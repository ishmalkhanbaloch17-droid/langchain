import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { ChainNode, TraceStep, SearchGroundingChunk, ParserType, SchemaField } from "./src/types";

dotenv.config();

// Global fetch interceptor to log downstream API call requests and responses.
// This executes transparently for SDK fetch calls, highlighting missing or non-conforming JSON content-types.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" 
    ? input 
    : (input instanceof URL ? input.toString() : input.url);
  
  console.log(`[Downstream Fetch Request] URL: ${url}`);
  console.log(`[Downstream Fetch Request] Method: ${init?.method || "GET"}`);
  
  // Safely extract request headers, masking sensitive API credentials or tokens
  const reqHeaders: Record<string, string> = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((val, key) => {
        const lowerKey = key.toLowerCase();
        reqHeaders[key] = lowerKey === "authorization" || lowerKey.includes("key") || lowerKey.includes("api-") ? "[REDACTED]" : val;
      });
    } else if (Array.isArray(init.headers)) {
      init.headers.forEach(([key, val]) => {
        const lowerKey = key.toLowerCase();
        reqHeaders[key] = lowerKey === "authorization" || lowerKey.includes("key") || lowerKey.includes("api-") ? "[REDACTED]" : val;
      });
    } else {
      for (const [key, val] of Object.entries(init.headers)) {
        const lowerKey = key.toLowerCase();
        reqHeaders[key] = lowerKey === "authorization" || lowerKey.includes("key") || lowerKey.includes("api-") ? "[REDACTED]" : val as string;
      }
    }
  }
  console.log(`[Downstream Fetch Request] Headers:`, JSON.stringify(reqHeaders));

  try {
    const response = await originalFetch(input, init);
    console.log(`[Downstream Fetch Response] Status: ${response.status} ${response.statusText}`);
    
    // Log response headers
    const resHeaders: Record<string, string> = {};
    response.headers.forEach((val, key) => {
      resHeaders[key] = val;
    });
    console.log(`[Downstream Fetch Response] Headers:`, JSON.stringify(resHeaders));

    const contentType = response.headers.get("content-type") || "";
    if (!contentType) {
      console.warn(`[Downstream Fetch Warning] "content-type" header is completely MISSING for downstream response from: ${url}`);
    } else if (!contentType.toLowerCase().includes("application/json")) {
      console.warn(`[Downstream Fetch Warning] Invalid non-JSON content-type detected: "${contentType}" for downstream response from: ${url}`);
    } else {
      console.log(`[Downstream Fetch Info] Valid JSON response content-type: "${contentType}"`);
    }

    // Read response body securely, cloning so downstream parsing works unmodified
    const clonedResponse = response.clone();
    try {
      const rawText = await clonedResponse.text();
      console.log(`[Downstream Fetch Response] Raw Response Payload (up to 2000 chars):`);
      console.log(rawText.substring(0, 2000));
      if (rawText.length > 2000) {
        console.log(`... [Response Payload Truncated, total size: ${rawText.length} bytes]`);
      }
    } catch (bodyErr: any) {
      console.error(`[Downstream Fetch Response Error] Failed to read response body text stream:`, bodyErr.message);
    }

    return response;
  } catch (err: any) {
    console.error(`[Downstream Fetch Failure] Downstream API request failed completely for URL: ${url}`, err.message);
    throw err;
  }
};

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

// Config endpoint for client-side environment checking
app.get("/api/config", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  return res.json({
    success: true,
    hasServerApiKey: typeof process.env.GEMINI_API_KEY === "string" && process.env.GEMINI_API_KEY.trim().length > 0
  });
});

// REST endpoint to run the chain visually and return full traces
app.post("/api/chains/run", async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  // Log incoming execution context
  console.log(`[Chain Run] Incoming execution request at ${new Date().toISOString()}`);
  
  if (!req.body || typeof req.body !== "object") {
    console.error("[Chain Run] Invalid request body syntax or missing body entirely.");
    return res.status(400).json({
      success: false,
      error: "Malformed request payload received. Request body must be a valid JSON object."
    });
  }

  const { nodes, inputs, customApiKey } = req.body as { 
    nodes: ChainNode[]; 
    inputs: Record<string, string>; 
    customApiKey?: string; 
  };

  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    console.warn("[Chain Run] Validation failed: Zero nodes provided in chain configuration.");
    return res.status(400).json({
      success: false,
      error: "Validation failed: No nodes provided in the chain configuration."
    });
  }

  console.log(`[Chain Run] Parsed Composition Structure. Nodes Count: ${nodes.length}, Node Types: ${nodes.map(n => n.type).join(" -> ")}`);
  console.log(`[Chain Run] Input values:`, JSON.stringify(inputs || {}));

  // Create traces & setup tracking
  const trace: TraceStep[] = [];
  let currentInput = { ...inputs };
  let finalResult: any = null;
  let groundingChunks: SearchGroundingChunk[] = [];

  const apiKey = customApiKey?.trim() || process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    console.warn("[Chain Run] Authentication failure: No API key found globally or custom override.");
    return res.status(400).json({
      success: false,
      error: "Authentication failed: No active Gemini API Key found. Provide an override API key in the 'API Credentials' field in the right panel, or declare GEMINI_API_KEY in the environment."
    });
  }

  // Masked key display for safe logs
  const maskedKey = apiKey.length > 8 ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : "PROVIDED";
  console.log(`[Chain Run] Using Gemini API Key: [${maskedKey}]`);

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build-lcel',
      }
    }
  });

  try {
    // --- STEP 1: RESOLVE INPUTS ---
    console.log("[Chain Run] Step 1: Matching input parameter properties...");
    const inputNode = nodes.find(n => n.type === "Input");
    const inputStepId = inputNode?.id || "input-step";
    
    trace.push({
      id: inputStepId,
      name: "Resolve Input Variables",
      className: "chain.InputVariables",
      status: "success",
      inputs: inputs || {},
      outputs: currentInput,
      durationMs: 8,
      description: "LangChain processes raw prompt variables from the user environment."
    });

    // --- STEP 2: PROMPT CONSTRUCT ---
    console.log("[Chain Run] Step 2: Compiling instructions template...");
    const promptNode = nodes.find(n => n.type === "PromptTemplate");
    if (!promptNode) {
      throw new Error("Missing structural PromptTemplate node in composition config diagram.");
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
    console.log("[Chain Run] Step 3: Preparing LLM engine connection parameter specs...");
    const modelNode = nodes.find(n => n.type === "ChatModel");
    if (!modelNode) {
      throw new Error("Missing active LLM ChatModel node in the chain workflow.");
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
      console.log("[Chain Run] Web Grounding enabled for this task run. Triggering live Google Search connection.");
      config.tools = [{ googleSearch: {} }];
    }

    // Custom formatting directions for output parsers
    let parserInstructions = "";
    if (parserType === "list") {
      parserInstructions = "\n\nCRITICAL: Formulate your response strictly as a comma-separated list of values (CSS format) with zero formatting or explanation. Example: item1, item2, item3";
    } else if (parserType === "json" && parserNode?.data.jsonSchema) {
      config.responseMimeType = "application/json";
      config.responseSchema = buildGeminiSchema(parserNode.data.jsonSchema);
      console.log("[Chain Run] Structured JSON output schema enforced onto Gemini API configuration parameters.");
    }

    const promptToSend = userCompiled + parserInstructions;

    console.log(`[Chain Run] Executing model generation call with '${modelName}'...`);
    let response;
    try {
      response = await ai.models.generateContent({
        model: modelName,
        contents: promptToSend,
        config
      });
    } catch (apiErr: any) {
      console.error("[Chain Run] Model API Generation crashed:", apiErr);
      
      let clientMsg = apiErr.message || "Unknown API response exception raised by Google GenAI client.";
      if (clientMsg.includes("API_KEY") || clientMsg.includes("key is invalid") || apiErr.status === 403 || apiErr.status === 401) {
        clientMsg = "The configured Gemini API key is invalid or lacks functional permissions. Please double check that you provided the correct credential.";
      } else if (clientMsg.includes("quota") || apiErr.status === 429) {
        clientMsg = "The Gemini model rate limit or request quota has been exceeded. Please retry in a few seconds.";
      } else if (apiErr.status === 404) {
        clientMsg = `The selected LLM model '${modelName}' could not be resolved or is unavailable in the current workspace.`;
      }

      throw new Error(`[Gemini Engine Call Failed]: ${clientMsg}`);
    }

    const durationLLM = Date.now() - startLLMTime;
    const rawText = response.text || "";
    console.log(`[Chain Run] Model call returned in ${durationLLM}ms. Response Text Sample: "${rawText.substring(0, 120).replace(/\n/g, " ")}..."`);

    // Extract search grounding if present
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks && Array.isArray(chunks)) {
      groundingChunks = chunks
        .map(c => ({
          title: c.web?.title || c.maps?.uri || "Google Source Link",
          uri: c.web?.uri || c.maps?.uri || "#"
        }))
        .filter(c => !!c.uri);
      console.log(`[Chain Run] Captured ${groundingChunks.length} active grounding citations from Google Search engine.`);
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
    console.log(`[Chain Run] Step 4: Normalizing raw text structure towards type '${parserType}'...`);
    const startParseTime = Date.now();
    let parsedValue: any = rawText;

    if (parserType === "json") {
      try {
        parsedValue = JSON.parse(rawText.trim());
      } catch (err: any) {
        console.warn("[Chain Run] Simple JSON parsing failed on outputText, attempting backup greedy regex block match.");
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsedValue = JSON.parse(jsonMatch[0]);
          } catch (e) {
            console.error("[Chain Run] Greedy matching also produced non-conforming block structure parsing syntax error.");
            parsedValue = { error: "Failed to parse structural JSON model response", raw: rawText };
          }
        } else {
          console.error("[Chain Run] Could not locate any bracketed JSON structure tokens inside output.");
          parsedValue = { error: "Output did not conform to JSON parser constraints", raw: rawText };
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

    // Build finalized serialization safe result model
    const responsePayload = {
      success: true,
      trace,
      finalOutput: finalResult,
      groundingChunks
    };

    console.log("[Chain Run] Success: Entire compositions flow completed. Exporting tracing datasets...");
    return res.json(responsePayload);

  } catch (err: any) {
    console.error("[Chain Run] Critical exception during execution pipeline:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "An unexpected internal server exception occurred during structural composition pipeline execution."
    });
  }
});

// Global Express error handler middleware to intercept unhandled exceptions and return JSON answers
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[Unhandled Express Instance Error]:", err);
  res.setHeader("Content-Type", "application/json");
  return res.status(err.status || 500).json({
    success: false,
    error: err.message || "A fatal unhandled error occurred on the pipeline server."
  });
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
