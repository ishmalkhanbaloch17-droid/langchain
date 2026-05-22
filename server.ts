import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { ChainNode, TraceStep, SearchGroundingChunk, ParserType, SchemaField } from "./src/types";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Helper to compile a template by substituting {variables}
function compileTemplate(template: string, inputs: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(inputs)) {
    // Escape regex characters
    const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const regex = new RegExp(`{${escapedKey}}`, "g");
    result = result.replace(regex, value || "");
  }
  return result;
}

// Convert our schema designer fields to Gemini Type schemas
function buildGeminiSchema(fields: SchemaField[]) {
  const properties: Record<string, any> = {};
  const required: string[] = [];

  fields.forEach(f => {
    let typeMap = Type.STRING;
    let items: any = undefined;

    if (f.type === "number") {
      typeMap = Type.NUMBER;
    } else if (f.type === "boolean") {
      typeMap = Type.BOOLEAN;
    } else if (f.type === "array") {
      typeMap = Type.ARRAY;
      items = { type: Type.STRING };
    }

    properties[f.key] = {
      type: typeMap,
      description: f.description,
      ...(items ? { items } : {})
    };
    required.push(f.key);
  });

  return {
    type: Type.OBJECT,
    properties,
    required,
  };
}

// REST endpoint to run the chain visually and return full traces
app.post("/api/chains/run", async (req, res) => {
  const { nodes, inputs, customApiKey } = req.body as { 
    nodes: ChainNode[]; 
    inputs: Record<string, string>; 
    customApiKey?: string; 
  };

  if (!nodes || nodes.length === 0) {
    return res.status(400).json({
      success: false,
      error: "No nodes provided in the chain."
    });
  }

  // 1. Initialize trace steps
  const trace: TraceStep[] = [];
  let currentInput = { ...inputs };
  let finalResult: any = null;
  let groundingChunks: SearchGroundingChunk[] = [];

  const apiKey = customApiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(400).json({
      success: false,
      error: "No Gemini API Key found. Please add it via the 'API Credentials Override' field in the right-hand panel, or configure it globally in Settings > Secrets."
    });
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  try {
    // --- STEP 1: RESOLVE INPUTS ---
    const inputNode = nodes.find(n => n.type === "Input");
    const inputStepId = inputNode?.id || "input-step";
    
    trace.push({
      id: inputStepId,
      name: "Resolve Input Variables",
      className: "chain.InputVariables",
      status: "success",
      inputs: inputs,
      outputs: currentInput,
      durationMs: 12,
      description: "LangChain processes raw prompt variables from the user environment."
    });

    // --- STEP 2: PROMPT CONSTRUCT ---
    const promptNode = nodes.find(n => n.type === "PromptTemplate");
    if (!promptNode) {
      throw new Error("Missing a PromptTemplate node in the chain flow.");
    }

    const startPromptTime = Date.now();
    const systemTemplate = promptNode.data.systemPromptTemplate || "You are a professional assistant.";
    const userTemplate = promptNode.data.userPromptTemplate || "Handle task: {input}";

    const systemCompiled = compileTemplate(systemTemplate, currentInput);
    const userCompiled = compileTemplate(userTemplate, currentInput);

    const promptOutputs = {
      systemInstruction: systemCompiled,
      userPrompt: userCompiled,
      messages: [
        { role: "system", content: systemCompiled },
        { role: "user", content: userCompiled }
      ]
    };

    trace.push({
      id: promptNode.id,
      name: "Construct ChatPromptTemplate",
      className: "prompts.ChatPromptTemplate",
      status: "success",
      inputs: {
        systemTemplate,
        userTemplate,
        variables: currentInput
      },
      outputs: promptOutputs,
      durationMs: Date.now() - startPromptTime,
      description: "Compiles templates by substituting bracket variables with input payloads."
    });

    // --- STEP 3: LLM CALL COUPLING WITH OUTPUT PARSER INSTRUCTIONS ---
    const modelNode = nodes.find(n => n.type === "ChatModel");
    if (!modelNode) {
      throw new Error("Missing LLM ChatModel node in the chain flow.");
    }

    const parserNode = nodes.find(n => n.type === "OutputParser");
    const parserType: ParserType = parserNode?.data.parserType || "string";

    const modelName = modelNode.data.modelName || "gemini-3.5-flash";
    const temperature = modelNode.data.temperature !== undefined ? modelNode.data.temperature : 0.7;
    const enableSearch = !!modelNode.data.enableSearch;

    const startLLMTime = Date.now();
    
    // Construct LLM configuration
    const config: any = {
      temperature: temperature,
      systemInstruction: systemCompiled,
    };

    if (enableSearch) {
      config.tools = [{ googleSearch: {} }];
    }

    // Custom formatting directions for output parsers
    let parserInstructions = "";
    if (parserType === "list") {
      parserInstructions = "\n\nCRITICAL: Formulate your response strictly as a comma-separated list of values (CSS format) with zero formatting or explanation. Example: item1, item2, item3";
    } else if (parserType === "json" && parserNode?.data.jsonSchema) {
      config.responseMimeType = "application/json";
      config.responseSchema = buildGeminiSchema(parserNode.data.jsonSchema);
    }

    const promptToSend = userCompiled + parserInstructions;

    // Call Gemini
    const response = await ai.models.generateContent({
      model: modelName,
      contents: promptToSend,
      config
    });

    const durationLLM = Date.now() - startLLMTime;
    const rawText = response.text || "";

    // Extract search grounding if present
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks && Array.isArray(chunks)) {
      groundingChunks = chunks
        .map(c => ({
          title: c.web?.title || c.maps?.uri || "Google Source",
          uri: c.web?.uri || c.maps?.uri || "#"
        }))
        .filter(c => !!c.uri);
    }

    trace.push({
      id: modelNode.id,
      name: `Invoke ChatModel (${modelName})`,
      className: "chat_models.ChatGoogleGenerativeAI",
      status: "success",
      inputs: {
        model: modelName,
        temperature,
        enableSearch,
        prompt: promptToSend,
      },
      outputs: {
        rawResponse: rawText,
        groundingSourcesCount: groundingChunks.length,
        finishReason: response.candidates?.[0]?.finishReason || "STOP"
      },
      durationMs: durationLLM,
      description: "Dispatches payload to Gemini API server and awaits generation results."
    });

    // --- STEP 4: OUTPUT PARSING ---
    const startParseTime = Date.now();
    let parsedValue: any = rawText;

    if (parserType === "json") {
      try {
        parsedValue = JSON.parse(rawText.trim());
      } catch (err: any) {
        // Fallback or retry clean
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsedValue = JSON.parse(jsonMatch[0]);
          } catch (e) {
            parsedValue = { error: "Failed to parse structural JSON", raw: rawText };
          }
        } else {
          parsedValue = { error: "Output did not conform to JSON", raw: rawText };
        }
      }
    } else if (parserType === "list") {
      parsedValue = rawText
        .split(",")
        .map(item => item.trim())
        .filter(item => item.length > 0);
    }

    finalResult = parsedValue;

    if (parserNode) {
      trace.push({
        id: parserNode.id,
        name: `Apply OutputParser (${parserType})`,
        className: parserType === "json" ? "output_parsers.JsonOutputParser" : 
                   parserType === "list" ? "output_parsers.CommaSeparatedListOutputParser" : 
                   "output_parsers.StringOutputParser",
        status: "success",
        inputs: {
          rawText,
          parserType,
          ...(parserType === "json" ? { expectedSchema: parserNode.data.jsonSchema } : {})
        },
        outputs: {
          parsedOutput: parsedValue
        },
        durationMs: Date.now() - startParseTime,
        description: "Validates and parses model outputs into desired target program types."
      });
    }

    return res.json({
      success: true,
      trace,
      finalOutput: finalResult,
      groundingChunks
    });

  } catch (err: any) {
    console.error("Execution failure inside LangChain compiler:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "An exception occurred during chain compilation."
    });
  }
});

async function startServer() {
  // Serve frontend assets
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server executing at http://localhost:${PORT}`);
  });
}

startServer();
