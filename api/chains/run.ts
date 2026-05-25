import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";

interface SchemaField { key: string; type: "string"|"number"|"boolean"|"array"; description: string; }
interface ChainNode { id: string; type: string; data: any; }
interface TraceStep { id: string; name: string; className: string; status: "success"|"error"; inputs: Record<string,any>; outputs: Record<string,any>; durationMs: number; description: string; }
interface SearchGroundingChunk { title: string; uri: string; }

function compileTemplate(template: string, inputs: Record<string,string>): string {
  let result = template;
  for (const [key, value] of Object.entries(inputs)) {
    result = result.replace(new RegExp(`{${key.replace(/[-\/\\^$*+?.()|[\]{}]/g,"\\$&")}}`, "g"), value||"");
  }
  return result;
}

function buildGeminiSchema(fields: SchemaField[]) {
  const properties: Record<string,any> = {};
  const required: string[] = [];
  fields.forEach(f => {
    let typeMap = Type.STRING;
    let items: any = undefined;
    if (f.type==="number") typeMap=Type.NUMBER;
    else if (f.type==="boolean") typeMap=Type.BOOLEAN;
    else if (f.type==="array") { typeMap=Type.ARRAY; items={type:Type.STRING}; }
    properties[f.key] = { type:typeMap, description:f.description, ...(items?{items}:{}) };
    required.push(f.key);
  });
  return { type:Type.OBJECT, properties, required };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ success:false, error:"Method not allowed" });

  const { nodes, inputs, customApiKey } = req.body as { nodes:ChainNode[]; inputs:Record<string,string>; customApiKey?:string; };

  if (!nodes || !Array.isArray(nodes) || nodes.length===0)
    return res.status(400).json({ success:false, error:"No nodes provided." });

  const apiKey = customApiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!apiKey)
    return res.status(400).json({ success:false, error:"No Gemini API key found. Add GEMINI_API_KEY in Vercel → Settings → Environment Variables." });

  const ai = new GoogleGenAI({ apiKey });
  const trace: TraceStep[] = [];
  let groundingChunks: SearchGroundingChunk[] = [];

  try {
    const inputNode = nodes.find(n=>n.type==="Input");
    trace.push({ id:inputNode?.id||"input-step", name:"Resolve Input Variables", className:"chain.InputVariables", status:"success", inputs:inputs||{}, outputs:{...inputs}, durationMs:5, description:"Processes raw prompt variables." });

    const promptNode = nodes.find(n=>n.type==="PromptTemplate");
    if (!promptNode) throw new Error("Missing PromptTemplate node.");

    const t0 = Date.now();
    const systemCompiled = compileTemplate(promptNode.data.systemPromptTemplate||"You are a helpful assistant.", inputs);
    const userCompiled   = compileTemplate(promptNode.data.userPromptTemplate||"Handle: {input}", inputs);
    trace.push({ id:promptNode.id, name:"Construct ChatPromptTemplate", className:"prompts.ChatPromptTemplate", status:"success", inputs:{systemTemplate:promptNode.data.systemPromptTemplate, userTemplate:promptNode.data.userPromptTemplate, variables:inputs}, outputs:{systemInstruction:systemCompiled, userPrompt:userCompiled}, durationMs:Date.now()-t0, description:"Compiles templates with input values." });

    const modelNode = nodes.find(n=>n.type==="ChatModel");
    if (!modelNode) throw new Error("Missing ChatModel node.");

    const parserNode = nodes.find(n=>n.type==="OutputParser");
    const parserType = parserNode?.data.parserType||"string";
    const modelName  = modelNode.data.modelName||"gemini-2.0-flash";
    const temperature = modelNode.data.temperature??0.7;
    const enableSearch = !!modelNode.data.enableSearch;

    const config: any = { temperature, systemInstruction:systemCompiled };
    if (enableSearch) config.tools = [{ googleSearch:{} }];

    let parserInstructions = "";
    if (parserType==="list") parserInstructions = "\n\nRespond as a comma-separated list only. Example: item1, item2, item3";
    else if (parserType==="json" && parserNode?.data.jsonSchema) { config.responseMimeType="application/json"; config.responseSchema=buildGeminiSchema(parserNode.data.jsonSchema); }

    const t1 = Date.now();
    let response: any;
    try {
      response = await ai.models.generateContent({ model:modelName, contents:userCompiled+parserInstructions, config });
    } catch(apiErr: any) {
      let msg = apiErr.message||"Gemini API call failed.";
      if (apiErr.status===403||apiErr.status===401) msg="Invalid Gemini API key.";
      else if (apiErr.status===429) msg="Rate limit exceeded. Wait a moment and try again.";
      else if (apiErr.status===404) msg=`Model '${modelName}' not found. Try 'gemini-2.0-flash'.`;
      throw new Error(msg);
    }

    const rawText = response.text||"";
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks && Array.isArray(chunks))
      groundingChunks = chunks.map((c:any)=>({ title:c.web?.title||"Source", uri:c.web?.uri||"#" })).filter((c:any)=>!!c.uri);

    trace.push({ id:modelNode.id, name:`Invoke ChatModel (${modelName})`, className:"chat_models.ChatGoogleGenerativeAI", status:"success", inputs:{model:modelName, temperature, enableSearch, prompt:userCompiled}, outputs:{rawResponse:rawText, groundingSourcesCount:groundingChunks.length}, durationMs:Date.now()-t1, description:"Sends prompt to Gemini and returns response." });

    const t2 = Date.now();
    let parsedValue: any = rawText;
    if (parserType==="json") {
      try { parsedValue=JSON.parse(rawText.trim()); }
      catch { const m=rawText.match(/\{[\s\S]*\}/); parsedValue=m?JSON.parse(m[0]):{error:"Could not parse JSON",raw:rawText}; }
    } else if (parserType==="list") {
      parsedValue = rawText.split(",").map((s:string)=>s.trim()).filter(Boolean);
    }

    if (parserNode) trace.push({ id:parserNode.id, name:`Apply OutputParser (${parserType})`, className:"output_parsers.StringOutputParser", status:"success", inputs:{rawText,parserType}, outputs:{parsedOutput:parsedValue}, durationMs:Date.now()-t2, description:"Parses model output into target type." });

    return res.status(200).json({ success:true, trace, finalOutput:parsedValue, groundingChunks });

  } catch(err: any) {
    return res.status(500).json({ success:false, error:err.message||"Unexpected server error." });
  }
}
