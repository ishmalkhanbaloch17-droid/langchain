import { useState, useEffect } from 'react';
import { 
  Wrench, Cpu, Hash, Braces, Play, ArrowRight, BookOpen, 
  Sparkles, Code, Copy, Plus, Trash2, HelpCircle, Info, 
  ExternalLink, FileText, Terminal, CheckCircle2, AlertCircle, 
  Loader2, RefreshCw, Layers, Check, ChevronRight, Key, ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChainNode, ChainTemplate, TraceStep, SearchGroundingChunk, 
  ParserType, SchemaField 
} from './types';

const POPULAR_LANGUAGES = [
  { code: "Japanese", label: "Japanese (日本語)" },
  { code: "Spanish", label: "Spanish (Español)" },
  { code: "French", label: "French (Français)" },
  { code: "German", label: "German (Deutsch)" },
  { code: "Italian", label: "Italian (Italiano)" },
  { code: "Mandarin Chinese", label: "Mandarin Chinese (中文)" },
  { code: "Korean", label: "Korean (한국어)" },
  { code: "Arabic", label: "Arabic (العربية)" },
  { code: "Hindi", label: "Hindi (हिन्दी)" },
  { code: "Portuguese", label: "Portuguese (Português)" },
  { code: "Turkish", label: "Turkish (Türkçe)" },
  { code: "Russian", label: "Russian (Русский)" },
  { code: "Vietnamese", label: "Vietnamese (Tiếng Việt)" },
  { code: "Dutch", label: "Dutch (Nederlands)" },
  { code: "Swedish", label: "Swedish (Svenska)" }
];

// Pre-configured premium LangChain Templates
const TEMPLATES: ChainTemplate[] = [
  {
    id: "structured-translator",
    name: "Structured Phrase Translator",
    description: "Deconstructs slang and idioms into target languages, outputting cultural meanings in clean JSON.",
    icon: "Braces",
    nodes: [
      {
        id: "node-inputs",
        type: "Input",
        name: "Input variables",
        data: {
          variables: [
            { name: "text", value: "on cloud nine", description: "The idiomatic phrase to translate" },
            { name: "to_language", value: "German", description: "The translation target language" }
          ]
        }
      },
      {
        id: "node-prompt",
        type: "PromptTemplate",
        name: "Prompt Template",
        data: {
          systemPromptTemplate: "You are an expert dual-language socio-linguist. Deconstruct idioms accurately and formalize semantic translations.",
          userPromptTemplate: "Analyze the idiom '{text}'. Translate it into {to_language}. Break down figurative definitions, cultural equivalence, and formality ratings.",
          inputVariables: ["text", "to_language"]
        }
      },
      {
        id: "node-model",
        type: "ChatModel",
        name: "Chat Model",
        data: {
          modelName: "gemini-3.5-flash",
          temperature: 0.15,
          enableSearch: false
        }
      },
      {
        id: "node-parser",
        type: "OutputParser",
        name: "Output Parser",
        data: {
          parserType: "json",
          jsonSchema: [
            { key: "translation", type: "string", description: "The literal wording translation" },
            { key: "figurative_meaning", type: "string", description: "What the slang or idiom genuinely expresses in culture" },
            { key: "native_equivalent", type: "string", description: "Native equivalent idiom in target language" },
            { key: "formality_rating", type: "string", description: "Appropriateness scale: formal, polite, or casual slurs" }
          ]
        }
      }
    ]
  },
  {
    id: "grounded-agent",
    name: "Grounded Smart Agent",
    description: "Performs deep thematic intelligence synthesis grounded globally using live Google Web Search.",
    icon: "Sparkles",
    nodes: [
      {
        id: "node-inputs",
        type: "Input",
        name: "Input variables",
        data: {
          variables: [
            { name: "query", value: "Latest announcements on Artemis space program in 2026", description: "Fact search statement" }
          ]
        }
      },
      {
        id: "node-prompt",
        type: "PromptTemplate",
        name: "Prompt Template",
        data: {
          systemPromptTemplate: "You are a professional research agent synthesizing current historical news. You must cite real sources.",
          userPromptTemplate: "Generate a detailed executive overview on: '{query}'. Provide exact dates, institutions, and state goals.",
          inputVariables: ["query"]
        }
      },
      {
        id: "node-model",
        type: "ChatModel",
        name: "Chat Model",
        data: {
          modelName: "gemini-3.5-flash",
          temperature: 0.05,
          enableSearch: true
        }
      },
      {
        id: "node-parser",
        type: "OutputParser",
        name: "Output Parser",
        data: {
          parserType: "string"
        }
      }
    ]
  },
  {
    id: "list-helper",
    name: "Advertisement Hook Creator",
    description: "Synthesizes viral headlines and marketing ideas returned directly as a clean formatted list.",
    icon: "Layers",
    nodes: [
      {
        id: "node-inputs",
        type: "Input",
        name: "Input variables",
        data: {
          variables: [
            { name: "industry", value: "Autonomous Electric Bike Helmets", description: "Product vertical context" },
            { name: "ideas_count", value: "3", description: "Number of titles to spawn" }
          ]
        }
      },
      {
        id: "node-prompt",
        type: "PromptTemplate",
        name: "Prompt Template",
        data: {
          systemPromptTemplate: "You are a legendary psychological copywriter experienced in direct-response marketing.",
          userPromptTemplate: "Come up with precisely {ideas_count} high-performance social video hooks for the {industry} market. Ensure intense curiosity loops.",
          inputVariables: ["industry", "ideas_count"]
        }
      },
      {
        id: "node-model",
        type: "ChatModel",
        name: "Chat Model",
        data: {
          modelName: "gemini-3.5-flash",
          temperature: 0.8,
          enableSearch: false
        }
      },
      {
        id: "node-parser",
        type: "OutputParser",
        name: "Output Parser",
        data: {
          parserType: "list"
        }
      }
    ]
  }
];

export default function App() {
  const [nodes, setNodes] = useState<ChainNode[]>(() => {
    return JSON.parse(JSON.stringify(TEMPLATES[0].nodes));
  });

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("structured-translator");
  const [activeTab, setActiveTab] = useState<'playground' | 'code' | 'guide'>('playground');
  const [codeLang, setCodeLang] = useState<'typescript' | 'python'>('typescript');
  const [copied, setCopied] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [runError, setRunError] = useState<string | null>(null);

  // Trace and Results State
  const [executionTrace, setExecutionTrace] = useState<TraceStep[] | null>(null);
  const [finalOutput, setFinalOutput] = useState<any | null>(null);
  const [groundingChunks, setGroundingChunks] = useState<SearchGroundingChunk[] | null>(null);
  const [expandedTraceStep, setExpandedTraceStep] = useState<string | null>(null);

  // Custom API key override stored locally inside the browser 
  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    return localStorage.getItem("custom_gemini_api_key") || "";
  });

  useEffect(() => {
    localStorage.setItem("custom_gemini_api_key", customApiKey);
  }, [customApiKey]);

  // Load selected template into workspace node structures
  const handleLoadTemplate = (tpl: ChainTemplate) => {
    setNodes(JSON.parse(JSON.stringify(tpl.nodes)));
    setSelectedTemplateId(tpl.id);
    setExecutionTrace(null);
    setFinalOutput(null);
    setGroundingChunks(null);
    setRunError(null);
  };

  // Helper to extract input variables by finding all {variables} in prompts
  const getExtractedVariables = (): { name: string; value: string; description: string }[] => {
    const inputNode = nodes.find(n => n.type === 'Input');
    const promptNode = nodes.find(n => n.type === 'PromptTemplate');
    
    const existingVars = inputNode?.data.variables || [];
    const promptText = (promptNode?.data.systemPromptTemplate || "") + " " + (promptNode?.data.userPromptTemplate || "");
    
    // Find matching bracket variables e.g. {topic}
    const regex = /\{([a-zA-Z0-9_]+)\}/g;
    const foundVars: string[] = [];
    let match;
    while ((match = regex.exec(promptText)) !== null) {
      if (!foundVars.includes(match[1])) {
        foundVars.push(match[1]);
      }
    }

    return foundVars.map(vName => {
      const matchInNode = existingVars.find(ev => ev.name === vName);
      return {
        name: vName,
        value: matchInNode ? matchInNode.value : "",
        description: matchInNode ? matchInNode.description : `Variable referenced in PromptTemplate`
      };
    });
  };

  // Update specific node's data state
  const updateNodeData = (nodeId: string, newData: any) => {
    setNodes(prev => prev.map(n => {
      if (n.id === nodeId) {
        return { ...n, data: { ...n.data, ...newData } };
      }
      return n;
    }));
  };

  // Live variable entry modifications by the user
  const handleVariableValueChange = (vName: string, newValue: string) => {
    const inputNode = nodes.find(n => n.type === 'Input');
    if (!inputNode) return;

    const currentVars = inputNode.data.variables || [];
    let updatedVars = [...currentVars];
    const exists = currentVars.some(v => v.name === vName);

    if (exists) {
      updatedVars = currentVars.map(v => v.name === vName ? { ...v, value: newValue } : v);
    } else {
      updatedVars.push({ name: vName, value: newValue, description: "Auto-extracted prompt variable" });
    }

    updateNodeData(inputNode.id, { variables: updatedVars });
  };

  // Run client-side visual execution fallback if backend is offline/static
  const executeChainClientSide = async (
    nodes: ChainNode[], 
    inputsMap: Record<string, string>, 
    apiKey: string
  ): Promise<{ trace: TraceStep[]; finalOutput: any; groundingChunks: SearchGroundingChunk[] | null }> => {
    const trace: TraceStep[] = [];
    let currentInput = { ...inputsMap };
    let finalResult: any = null;
    let fallbackGrounding: SearchGroundingChunk[] | null = null;

    // --- STEP 1: RESOLVE INPUTS ---
    const inputNode = nodes.find(n => n.type === "Input");
    const inputStepId = inputNode?.id || "input-step";
    trace.push({
      id: inputStepId,
      name: "Resolve Input Variables",
      className: "chain.InputVariables",
      status: "success",
      inputs: inputsMap || {},
      outputs: currentInput,
      durationMs: 8,
      description: "LangChain processes raw prompt variables from the user environment."
    });

    // --- STEP 2: PROMPT CONSTRUCT ---
    const promptNode = nodes.find(n => n.type === "PromptTemplate");
    if (!promptNode) {
      throw new Error("Missing structural PromptTemplate node in composition config diagram.");
    }

    const startPromptTime = Date.now();
    const systemTemplate = promptNode.data.systemPromptTemplate || "You are a professional assistant.";
    const userTemplate = promptNode.data.userPromptTemplate || "Handle task: {input}";

    const compileTemplateClient = (template: string, vars: Record<string, string>): string => {
      let result = template;
      for (const [key, value] of Object.entries(vars)) {
        const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
        const regex = new RegExp(`{${escapedKey}}`, "g");
        result = result.replace(regex, value || "");
      }
      return result;
    };

    const systemCompiled = compileTemplateClient(systemTemplate, currentInput);
    const userCompiled = compileTemplateClient(userTemplate, currentInput);

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

    // --- STEP 3: LLM CALL COUPLING ---
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

    const buildGeminiSchemaClient = (fields: SchemaField[]) => {
      const properties: Record<string, any> = {};
      const required: string[] = [];

      fields.forEach(f => {
        let typeMap = "STRING";
        let items: any = undefined;

        if (f.type === "number") {
          typeMap = "NUMBER";
        } else if (f.type === "boolean") {
          typeMap = "BOOLEAN";
        } else if (f.type === "array") {
          typeMap = "ARRAY";
          items = { type: "STRING" };
        }

        properties[f.key] = {
          type: typeMap,
          description: f.description,
          ...(items ? { items } : {})
        };
        required.push(f.key);
      });

      return {
        type: "OBJECT",
        properties,
        required,
      };
    };

    let parserInstructions = "";
    let responseMimeType = "text/plain";
    let responseSchema: any = undefined;

    if (parserType === "list") {
      parserInstructions = "\n\nCRITICAL: Formulate your response strictly as a comma-separated list of values (CSS format) with zero formatting or explanation. Example: item1, item2, item3";
    } else if (parserType === "json" && parserNode?.data.jsonSchema) {
      responseMimeType = "application/json";
      responseSchema = buildGeminiSchemaClient(parserNode.data.jsonSchema);
    }

    const finalPrompt = userCompiled + parserInstructions;
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          parts: [{ text: finalPrompt }]
        }
      ],
      systemInstruction: {
        parts: [{ text: systemCompiled }]
      },
      generationConfig: {
        temperature: temperature,
        responseMimeType: responseMimeType,
        ...(responseSchema ? { responseSchema } : {})
      },
      ...(enableSearch ? {
        tools: [{ googleSearch: {} }]
      } : {})
    };

    let response;
    try {
      response = await fetch(geminiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });
    } catch (netErr: any) {
      throw new Error(`Direct connection to Gemini API failed. Ensure you are online and your API key allows browser CORS queries: ${netErr.message}`);
    }

    if (!response.ok) {
      let errText = "";
      try {
        const errJson = await response.json();
        errText = errJson.error?.message || response.statusText;
      } catch (e) {
        errText = response.statusText;
      }
      throw new Error(`Gemini LLM API error ${response.status}: ${errText}`);
    }

    const responseData = await response.json();
    const durationLLM = Date.now() - startLLMTime;

    const candidate = responseData.candidates?.[0];
    const rawText = candidate?.content?.parts?.[0]?.text || "";

    const chunks = candidate?.groundingMetadata?.groundingChunks;
    if (chunks && Array.isArray(chunks)) {
      fallbackGrounding = chunks
        .map((c: any) => ({
          title: c.web?.title || c.maps?.uri || "Google Source Link",
          uri: c.web?.uri || c.maps?.uri || "#"
        }))
        .filter((c: any) => !!c.uri);
    }

    trace.push({
      id: modelNode.id,
      name: "Connect ChatGemini",
      className: `models.${modelName}`,
      status: "success",
      inputs: {
        modelName,
        temperature,
        prompt: finalPrompt,
        enableSearch
      },
      outputs: {
        text: rawText,
        groundingMetadata: candidate?.groundingMetadata || null
      },
      durationMs: durationLLM,
      description: "Direct secure LLM invocation using user API credentials override."
    });

    // --- STEP 4: OUTPUT PARSING ---
    const startParseTime = Date.now();
    let parsedValue: any = rawText;

    if (parserType === "json") {
      try {
        parsedValue = JSON.parse(rawText.trim());
      } catch (err) {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsedValue = JSON.parse(jsonMatch[0]);
          } catch (e) {
            parsedValue = { error: "Failed to parse structural JSON model response", raw: rawText };
          }
        } else {
          parsedValue = { error: "Output did not conform to JSON parser constraints", raw: rawText };
        }
      }
    } else if (parserType === "list") {
      const cleaned = rawText.replace(/^\[|\]$/g, '').trim();
      parsedValue = cleaned.split(",").map((s: string) => s.trim()).filter((s: string) => s.length > 0);
    }

    finalResult = parsedValue;

    if (parserNode) {
      trace.push({
        id: parserNode.id,
        name: `${parserType.toUpperCase()} Output Parser`,
        className: parserType === "json" ? "parsers.JsonOutputParser" : (parserType === "list" ? "parsers.CommaSeparatedListOutputParser" : "parsers.StringOutputParser"),
        status: "success",
        inputs: rawText,
        outputs: parsedValue,
        durationMs: Date.now() - startParseTime,
        description: "Standardizes, extracts, and parses multi-structured data feeds into strongly-typed variables."
      });
    }

    return {
      trace,
      finalOutput: finalResult,
      groundingChunks: fallbackGrounding
    };
  };

  // Run the visual chain visually through the server sandbox
  const handleExecuteChain = async () => {
    setIsExecuting(true);
    setRunError(null);
    setExecutionTrace(null);
    setFinalOutput(null);
    setGroundingChunks(null);

    const variablesList = getExtractedVariables();
    const inputsMap: Record<string, string> = {};
    variablesList.forEach(v => {
      inputsMap[v.name] = v.value;
    });

    const isStaticHosting = window.location.hostname.includes("vercel.app") || 
                            window.location.hostname.includes("netlify.app") || 
                            window.location.hostname.includes("github.io") ||
                            window.location.hostname.includes("stackblitz") ||
                            window.location.hostname.includes("webcontainer");

    const hasCustomApiKey = !!customApiKey.trim();

    // If we're on a static host and have an API key override, run client-side to bypass backend unavailability!
    if (isStaticHosting && hasCustomApiKey) {
      try {
        console.log("[Client Execution] Running chain compilation and execution client-side.");
        const result = await executeChainClientSide(nodes, inputsMap, customApiKey.trim());
        setExecutionTrace(result.trace);
        setFinalOutput(result.finalOutput);
        setGroundingChunks(result.groundingChunks);
        if (result.trace && result.trace.length > 0) {
          setExpandedTraceStep(result.trace[result.trace.length - 1].id);
        }
        return;
      } catch (clientErr: any) {
        console.error(clientErr);
        setRunError(`[Client Execution Error]: ${clientErr.message}`);
        return;
      } finally {
        setIsExecuting(false);
      }
    }

    try {
      const response = await fetch('/api/chains/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nodes: nodes,
          inputs: inputsMap,
          customApiKey: customApiKey.trim() || undefined
        })
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        // Fallback option: If the server fetch returned non-JSON (like Vercel static router, or server timeout) 
        // AND the user has entered their custom API Key override, we can run completely client-side automatically!
        if (hasCustomApiKey) {
          console.warn("[Server Offline/Non-JSON] Falling back to client-side chain compilations execution.");
          const result = await executeChainClientSide(nodes, inputsMap, customApiKey.trim());
          setExecutionTrace(result.trace);
          setFinalOutput(result.finalOutput);
          setGroundingChunks(result.groundingChunks);
          if (result.trace && result.trace.length > 0) {
            setExpandedTraceStep(result.trace[result.trace.length - 1].id);
          }
          return;
        }

        if (isStaticHosting) {
          throw new Error(`Vercel Static Hosting environment detected. To run chain configurations: \n1. Please paste your Gemini API Key in the "Gemini API Key Override" field inside the right side panel. This will activate secure, direct-from-browser client-side execution!\n2. Or, run the repository locally using "npm run dev".`);
        }
        throw new Error("The backend execution server is currently starting or unreachable. To bypass this, please paste your Gemini API Key in the 'Gemini API Key Override' field in the right sidebar to run directly from the browser.");
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonErr) {
        throw new Error("The compilation server response was malformed. Please try again in a few seconds.");
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'The execution server returned an error during compilation.');
      }

      setExecutionTrace(data.trace);
      setFinalOutput(data.finalOutput);
      setGroundingChunks(data.groundingChunks || null);
      if (data.trace && data.trace.length > 0) {
        setExpandedTraceStep(data.trace[data.trace.length - 1].id);
      }
    } catch (err: any) {
      console.error(err);
      
      // Secondary fallback on connection failures (e.g. TypeError failed to fetch)
      if (hasCustomApiKey) {
        try {
          console.warn("[Fetch Failed Fallback] Catch block engaged. Attempting secure client-side runner...");
          const result = await executeChainClientSide(nodes, inputsMap, customApiKey.trim());
          setExecutionTrace(result.trace);
          setFinalOutput(result.finalOutput);
          setGroundingChunks(result.groundingChunks);
          if (result.trace && result.trace.length > 0) {
            setExpandedTraceStep(result.trace[result.trace.length - 1].id);
          }
          return;
        } catch (fallbackErr: any) {
          setRunError(`[Both Server and Client runs failed] Server Error: ${err.message}. Client Fallback Error: ${fallbackErr.message}`);
          return;
        }
      }

      setRunError(err.message || "Failed to communicate with LangChain Expression compiler.");
    } finally {
      setIsExecuting(false);
    }
  };

  // Copy code utility state toggler
  const handleCopyCode = (text: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          })
          .catch(() => {
            // Revert to fallback if Promise is rejected
            fallbackCopy(text);
          });
      } else {
        fallbackCopy(text);
      }
    } catch (err) {
      fallbackCopy(text);
    }
  };

  const fallbackCopy = (text: string) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      if (successful) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.warn("Fallback clipboard copy failed:", err);
    }
  };

  // Download final trace execution outcome to file
  const handleDownloadOutcome = (format: 'json' | 'txt') => {
    if (!finalOutput) return;
    const content = format === 'json' 
      ? (typeof finalOutput === 'object' ? JSON.stringify(finalOutput, null, 2) : JSON.stringify({ result: finalOutput }, null, 2))
      : (typeof finalOutput === 'object' ? JSON.stringify(finalOutput, null, 2) : String(finalOutput));

    const mimeType = format === 'json' ? 'application/json' : 'text/plain';
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chain_outcome.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Synthesize dynamic client-side code matching real parameters for user copying
  const generateCodeString = () => {
    const promptNode = nodes.find(n => n.type === 'PromptTemplate');
    const modelNode = nodes.find(n => n.type === 'ChatModel');
    const parserNode = nodes.find(n => n.type === 'OutputParser');

    const sysPrompt = promptNode?.data.systemPromptTemplate || "You are a professional assistant.";
    const userPrompt = promptNode?.data.userPromptTemplate || "Handle task: {input}";
    const modelName = modelNode?.data.modelName || "gemini-3.5-flash";
    const temperature = modelNode?.data.temperature ?? 0.7;
    const enableSearch = !!modelNode?.data.enableSearch;
    const parserType = parserNode?.data.parserType || "string";

    const extractedVars = getExtractedVariables();
    const keyToUse = customApiKey.trim() ? "YOUR_CUSTOM_KEY" : "process.env.GEMINI_API_KEY";
    
    if (codeLang === 'typescript') {
      const tsParserClass = parserType === 'json' ? 'JsonOutputParser' : 
                            parserType === 'list' ? 'CommaSeparatedListOutputParser' : 
                            'StringOutputParser';
      const tsParserImport = parserType === 'json' ? 'JsonOutputParser' : 
                            parserType === 'list' ? 'CommaSeparatedListOutputParser' : 
                            'StringOutputParser';
      
      const varsTsDeclaration = extractedVars.map(v => `  ${v.name}: "${v.value.replace(/"/g, '\\"')}"`).join(",\n");
      const schemaTmplJson = parserType === 'json' ? `// Outputs structured JSON conforming to configured schemas:
// ${JSON.stringify(parserNode?.data.jsonSchema || [], null, 2).replace(/\n/g, "\n// ")}` : "";

      return `import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ${tsParserImport} } from "@langchain/core/output_parsers";

// 1. Initialize modern ChatPromptTemplate setup
const prompt = ChatPromptTemplate.fromMessages([
  ["system", "${sysPrompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"],
  ["human", "${userPrompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"]
]);

// 2. Setup Gemini ChatLLM Model
const model = new ChatGoogleGenerativeAI({
  model: "${modelName}",
  temperature: ${temperature},
  apiKey: "${keyToUse}",
  ${enableSearch ? "tools: [{ googleSearch: {} }],\n" : ""}
});

// 3. Declare designated Output Parser
const parser = new ${tsParserClass}();

// 4. Chain visual piping using LangChain Expressive Piping (LCEL)
const chain = prompt.pipe(model).pipe(parser);

// 5. Fire high-level chain evaluation
const response = await chain.invoke({
${varsTsDeclaration}
});

console.log("Structured outcome:", response);
${schemaTmplJson}`;
    } else {
      // Python LangChain Standard 
      const pyParserClass = parserType === 'json' ? 'SimpleJsonOutputParser' : 
                            parserType === 'list' ? 'CommaSeparatedListOutputParser' : 
                            'StrOutputParser';
      const pyParserImport = parserType === 'json' ? 'from langchain_core.output_parsers import SimpleJsonOutputParser' : 
                             parserType === 'list' ? 'from langchain_core.output_parsers import CommaSeparatedListOutputParser' : 
                             'from langchain_core.output_parsers import StrOutputParser';
      const varsPyDeclaration = extractedVars.map(v => `    "${v.name}": "${v.value.replace(/"/g, '\\"')}"`).join(",\n");
      
      return `from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
${pyParserImport}

# 1. Arrange sequential ChatPromptTemplate message parameters
prompt = ChatPromptTemplate.from_messages([
    ("system", "${sysPrompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"),
    ("human", "${userPrompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')}")
])

# 2. Setup Google Generative AI bindings
model = ChatGoogleGenerativeAI(
    model="${modelName}",
    temperature=${temperature},
    api_key="${keyToUse}",
    ${enableSearch ? "google_search=True,\n" : ""}
)

# 3. Apply designated Output Parser Node
parser = ${pyParserClass}()

# 4. Bind variables utilizing Python bitwise LCEL operators
chain = prompt | model | parser

# 5. Execute Chain and print outcomes
outcome = chain.invoke({
${varsPyDeclaration}
})

print(outcome)
`;
    }
  };

  const currentVariables = getExtractedVariables();

  return (
    <div id="langchain-studio" className="h-screen bg-slate-50 text-slate-900 font-sans flex flex-col overflow-hidden antialiased">
      
      {/* 1. BRAND HEADER (Clean Minimalism Aesthetic) */}
      <header id="app-header" className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0 shadow-xs z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-lg tracking-tight">LangStudio<span className="text-indigo-600">Pro</span></span>
            <span className="bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded">v2.4.0</span>
          </div>
          <span className="text-xs text-slate-400 border-l border-slate-200 pl-3 leading-none hidden md:inline-block">
            Visual LCEL Chain Synthesizer & Trace Monitor
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center bg-slate-100 rounded-lg p-1">
            <button 
              onClick={() => setActiveTab('playground')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                activeTab === 'playground' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Visualizer & Play
            </button>
            <button 
              onClick={() => setActiveTab('code')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                activeTab === 'code' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Export LCEL Code
            </button>
            <button 
              onClick={() => setActiveTab('guide')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                activeTab === 'guide' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              IDE Guide
            </button>
          </div>

          <button
            onClick={handleExecuteChain}
            disabled={isExecuting || currentVariables.length === 0}
            className={`flex items-center gap-2 text-white px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
              isExecuting || currentVariables.length === 0
                ? 'bg-slate-350 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 active:scale-97 cursor-pointer'
            }`}
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Running...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                </svg>
                <span>Run Chain</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* 2. THREE-COLUMN IDE WORKSPACE */}
      <main className="flex flex-1 overflow-hidden">
        
        {/* SIDEBAR A: TEMPLATE & KNOWLEDGE DISCOVERY (Left) */}
        <aside className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0 overflow-y-auto">
          {/* Section: Simple Easy-To-Understand App Purpose */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-indigo-600" />
              What is this App?
            </h3>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              LangStudio is a visual blueprint builder for constructing intelligent automated tasks using <strong>LangChain Expression Language (LCEL)</strong>.
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
              Select a preset template below to instantly configure variables, customized system prompt templates, smart Gemini LLM models, and strict structured output filters.
            </p>
          </div>

          {/* Preset list */}
          <div className="p-4 space-y-4">
            <div>
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Preset Chains</h3>
              <div className="space-y-2">
                {TEMPLATES.map(tpl => {
                  const isActive = selectedTemplateId === tpl.id;
                  return (
                    <div 
                      key={tpl.id}
                      onClick={() => handleLoadTemplate(tpl)}
                      className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                        isActive
                          ? 'bg-indigo-50 border-indigo-200 shadow-xs'
                          : 'bg-white border-slate-100 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`p-1.5 rounded ${isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                          {tpl.icon === 'Braces' ? <Braces className="w-3.5 h-3.5" /> : 
                           tpl.icon === 'Sparkles' ? <Sparkles className="w-3.5 h-3.5" /> : 
                           <Layers className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className={`text-xs font-bold truncate ${isActive ? 'text-indigo-950' : 'text-slate-700'}`}>
                            {tpl.name}
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2 leading-normal">
                            {tpl.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Core Component Block Legend */}
            <div className="pt-2">
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Workspace Legend</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2 rounded border border-slate-100 bg-slate-50/50">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></div>
                  <div>
                    <span className="text-xs font-medium text-slate-700 block line-height-1">Input variables</span>
                    <span className="text-[9px] text-slate-400 block -mt-0.5">Custom values or language targets</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded border border-slate-100 bg-slate-50/50">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0"></div>
                  <div>
                    <span className="text-xs font-medium text-slate-700 block line-height-1">Prompt Template</span>
                    <span className="text-[9px] text-slate-400 block -mt-0.5">Fuses system instructions and parameters</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded border border-slate-100 bg-slate-50/50">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></div>
                  <div>
                    <span className="text-xs font-medium text-slate-700 block line-height-1">Gemini Chat Model</span>
                    <span className="text-[9px] text-slate-400 block -mt-0.5">Google's fast & accurate intelligence</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded border border-slate-100 bg-slate-50/50">
                  <div className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0"></div>
                  <div>
                    <span className="text-xs font-medium text-slate-700 block line-height-1">Strict Output Parser</span>
                    <span className="text-[9px] text-slate-400 block -mt-0.5">Ensures outputs strictly conform to structures</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* WORKSPACE CENTER B: INTERACTIVE PIPELINE FLOW VISUALIZER & TRACE */}
        <section className="flex-1 flex flex-col relative overflow-hidden bg-slate-50">
          {activeTab === 'playground' && (
            <>
              {/* Visual Canvas containing the vertical flowing cards */}
              <div className="flex-1 dot-grid overflow-y-auto p-6 relative">
            
            {/* Quick Helper Banner */}
            <div className="mb-6 bg-white border border-slate-150 rounded-xl p-4 shadow-xs max-w-2xl mx-auto flex items-start gap-3">
              <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="text-xs">
                <h4 className="font-bold text-slate-800">Visual Blueprint Pipeline</h4>
                <p className="text-slate-500 mt-1 leading-relaxed">
                  Modify system instruction words, adjust parameters, or select your target outputs below. This sequence generates production-grade LangChain integration scripts in real-time.
                </p>
              </div>
            </div>

            {/* FLOW SEQUENTIAL CONTAINER */}
            <div className="space-y-5 max-w-2xl mx-auto pb-8 relative">
              
              {/* NODE 1: INPUT COMPONENT */}
              {(() => {
                const node = nodes.find(n => n.type === 'Input')!;
                return (
                  <div key={node.id} id={`stage-${node.id}`} className="node-card bg-white rounded-lg overflow-hidden relative">
                    <div className="bg-amber-500/10 px-4 py-2 flex justify-between items-center border-b border-amber-200">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                        <span className="text-xs font-bold text-amber-950 uppercase tracking-wider">{node.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-amber-700 font-medium">chain.InputVariables</span>
                    </div>

                    <div className="p-4 bg-white space-y-3">
                      <div className="text-[11px] text-slate-500">
                        Input variables declared inside the prompts templates below. Change these values in the right-hand playground to customize translated content:
                      </div>

                      <div className="space-y-2">
                        {currentVariables.map(v => {
                          const isLanguageField = v.name === 'to_language';
                          return (
                            <div key={v.name} className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <span className="text-xs font-mono font-semibold text-slate-700 block truncate">
                                  {`{${v.name}}`}
                                </span>
                                <span className="text-[10px] text-slate-400 block truncate">{v.description}</span>
                              </div>
                              
                              <div className="shrink-0 w-44">
                                {isLanguageField ? (
                                  <select
                                    value={v.value}
                                    onChange={(e) => handleVariableValueChange(v.name, e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                                  >
                                    <option value="">(Select target language)</option>
                                    {POPULAR_LANGUAGES.map(lang => (
                                      <option key={lang.code} value={lang.code}>
                                        {lang.label}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="text"
                                    value={v.value}
                                    onChange={(e) => handleVariableValueChange(v.name, e.target.value)}
                                    placeholder="Variable string..."
                                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 text-slate-800"
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {currentVariables.length === 0 && (
                          <div className="text-center py-2 text-xs text-amber-600 bg-amber-50 rounded border border-amber-100 italic">
                            No bracket placeholders identified. Customize prompt values below.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Edge visual output port */}
                    <div className="flex justify-end px-4 py-1.5 bg-[#fbfcfd] border-t border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-slate-400 uppercase tracking-tight">to instruction</span>
                        <div className="port port-active"></div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-center -my-3">
                <div className="h-6 w-0.5 bg-slate-200 relative">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border border-slate-200 rounded-full p-0.5 shadow-xs">
                    <ArrowRight className="h-3 w-3 rotate-90 text-slate-400" />
                  </div>
                </div>
              </div>

              {/* NODE 2: PROMPT TEMPLATE COMPONENT */}
              {(() => {
                const node = nodes.find(n => n.type === 'PromptTemplate')!;
                return (
                  <div key={node.id} id={`stage-${node.id}`} className="node-card bg-white rounded-lg overflow-hidden relative">
                    <div className="bg-indigo-600/10 px-4 py-2 flex justify-between items-center border-b border-indigo-200">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-600"></div>
                        <span className="text-xs font-bold text-indigo-950 uppercase tracking-wider">{node.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-indigo-700 font-medium">prompts.ChatPromptTemplate</span>
                    </div>

                    <div className="p-4 space-y-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">
                          AI Personality & Guardrails (System Prompt):
                        </label>
                        <textarea
                          rows={2}
                          value={node.data.systemPromptTemplate}
                          onChange={(e) => updateNodeData(node.id, { systemPromptTemplate: e.target.value })}
                          className="w-full text-xs font-sans text-slate-700 bg-slate-50 focus:bg-white rounded border border-slate-200 focus:border-indigo-500 p-2 leading-relaxed"
                          placeholder="Configure the model's core system directive..."
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">
                          User Command Blueprint (Use curly brackets for variables like {'{text}'}):
                        </label>
                        <textarea
                          rows={2}
                          value={node.data.userPromptTemplate}
                          onChange={(e) => updateNodeData(node.id, { userPromptTemplate: e.target.value })}
                          className="w-full text-xs font-mono text-slate-700 bg-slate-50 focus:bg-white rounded border border-slate-200 focus:border-indigo-500 p-2 leading-relaxed"
                          placeholder="Define the task..."
                        />
                      </div>
                    </div>

                    <div className="flex justify-between px-4 py-1.5 bg-[#fbfcfd] border-t border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <div className="port port-active"></div>
                        <span className="text-[9px] text-slate-400 uppercase tracking-tight font-medium">In</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-slate-400 uppercase tracking-tight font-medium">Send prompts</span>
                        <div className="port port-active"></div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-center -my-3">
                <div className="h-6 w-0.5 bg-slate-200 relative">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border border-slate-200 rounded-full p-0.5 shadow-xs">
                    <ArrowRight className="h-3 w-3 rotate-90 text-slate-400" />
                  </div>
                </div>
              </div>

              {/* NODE 3: CHAT MODEL COMPONENT */}
              {(() => {
                const node = nodes.find(n => n.type === 'ChatModel')!;
                return (
                  <div key={node.id} id={`stage-${node.id}`} className="node-card bg-white rounded-lg overflow-hidden relative">
                    <div className="bg-emerald-600/10 px-4 py-2 flex justify-between items-center border-b border-emerald-200">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-600"></div>
                        <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider">{node.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-700 font-medium">chat_models.ChatGoogleGenerativeAI</span>
                    </div>

                    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Model Variant</label>
                        <select
                          value={node.data.modelName}
                          onChange={(e) => updateNodeData(node.id, { modelName: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded text-xs py-1.5 px-2 outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                        >
                          <option value="gemini-3.5-flash">gemini-3.5-flash (Fast, smart, recommended)</option>
                          <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Extreme efficiency)</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Creativity (Temp)</label>
                          <span className="text-[11px] font-mono font-bold text-slate-700">{node.data.temperature}</span>
                        </div>
                        <input
                          type="range"
                          min="0.0"
                          max="1.2"
                          step="0.05"
                          value={node.data.temperature}
                          onChange={(e) => updateNodeData(node.id, { temperature: parseFloat(e.target.value) })}
                          className="w-full h-1.5 bg-slate-100 rounded-lg cursor-pointer accent-emerald-600"
                        />
                      </div>

                      <div className="flex flex-col justify-center bg-slate-50 p-2 rounded border border-slate-100">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={node.data.enableSearch}
                            onChange={(e) => updateNodeData(node.id, { enableSearch: e.target.checked })}
                            className="rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 w-4 h-4 cursor-pointer"
                          />
                          <div className="flex flex-col">
                            <span className="font-bold text-xs">Web Search Grounding</span>
                            <span className="text-[9px] text-slate-400">Pulls live internet answers</span>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div className="flex justify-between px-4 py-1.5 bg-[#fbfcfd] border-t border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <div className="port port-active"></div>
                        <span className="text-[9px] text-slate-400 uppercase tracking-tight font-medium font-mono">In (Prompt)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-slate-400 uppercase tracking-tight font-medium font-mono">Out (Completion)</span>
                        <div className="port port-active"></div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-center -my-3">
                <div className="h-6 w-0.5 bg-slate-200 relative">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border border-slate-200 rounded-full p-0.5 shadow-xs">
                    <ArrowRight className="h-3 w-3 rotate-90 text-slate-400" />
                  </div>
                </div>
              </div>

              {/* NODE 4: OUTPUT PARSER COMPONENT */}
              {(() => {
                const node = nodes.find(n => n.type === 'OutputParser')!;
                return (
                  <div key={node.id} id={`stage-${node.id}`} className="node-card bg-white rounded-lg overflow-hidden relative">
                    <div className="bg-purple-600/10 px-4 py-2 flex justify-between items-center border-b border-purple-200">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-purple-600"></div>
                        <span className="text-xs font-bold text-purple-950 uppercase tracking-wider">{node.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-purple-700 font-medium">
                        {node.data.parserType === "json" ? "output_parsers.JsonOutputParser" : 
                         node.data.parserType === "list" ? "output_parsers.CommaSeparatedListOutputParser" : 
                         "output_parsers.StringOutputParser"}
                      </span>
                    </div>

                    <div className="p-4 space-y-3">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                          Output Return Formats
                        </label>
                        <div className="flex flex-wrap gap-4">
                          {(['string', 'json', 'list'] as ParserType[]).map(pt => (
                            <label key={pt} className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-700">
                              <input
                                type="radio"
                                name="parserType"
                                value={pt}
                                checked={node.data.parserType === pt}
                                onChange={() => updateNodeData(node.id, { parserType: pt })}
                                className="text-purple-600 focus:ring-purple-500 h-4 w-4"
                              />
                              <span className="capitalize">
                                {pt === 'string' ? 'Raw Text String' :
                                 pt === 'json' ? 'Strict Structured JSON' :
                                 'Comma Separated Array'}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {node.data.parserType === 'json' && (
                        <div className="bg-purple-50/50 rounded p-3 border border-purple-100 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-purple-950">JSON Field Constraints Schemas</span>
                            <button
                              onClick={() => {
                                const currentSchema = node.data.jsonSchema || [];
                                const newField: SchemaField = { key: `field_${currentSchema.length + 1}`, type: "string", description: "Describe field objective" };
                                updateNodeData(node.id, { jsonSchema: [...currentSchema, newField] });
                              }}
                              className="text-[10px] font-bold bg-purple-600 hover:bg-purple-700 text-white px-2 py-0.5 rounded transition-all"
                            >
                              + Add Schema Field
                            </button>
                          </div>

                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {(node.data.jsonSchema || []).map((field, idx) => (
                              <div key={idx} className="flex items-center gap-2 py-1.5 border-b border-purple-100 last:border-0">
                                <input
                                  type="text"
                                  value={field.key}
                                  onChange={(e) => {
                                    const updated = [...(node.data.jsonSchema || [])];
                                    updated[idx].key = e.target.value;
                                    updateNodeData(node.id, { jsonSchema: updated });
                                  }}
                                  placeholder="json_key_name"
                                  className="w-1/4 bg-white border border-slate-200 rounded text-[10.5px] py-1 px-1.5 font-mono"
                                />
                                <select
                                  value={field.type}
                                  onChange={(e) => {
                                    const updated = [...(node.data.jsonSchema || [])];
                                    updated[idx].type = e.target.value as any;
                                    updateNodeData(node.id, { jsonSchema: updated });
                                  }}
                                  className="w-1/5 bg-white border border-slate-200 rounded text-[10.5px]"
                                >
                                  <option value="string">string</option>
                                  <option value="number">number</option>
                                  <option value="boolean">boolean</option>
                                </select>
                                <input
                                  type="text"
                                  value={field.description}
                                  onChange={(e) => {
                                    const updated = [...(node.data.jsonSchema || [])];
                                    updated[idx].description = e.target.value;
                                    updateNodeData(node.id, { jsonSchema: updated });
                                  }}
                                  placeholder="Guidelines for the model output content..."
                                  className="flex-1 bg-white border border-slate-200 rounded text-[10.5px] py-1 px-1.5"
                                />
                                <button
                                  onClick={() => {
                                    const updated = (node.data.jsonSchema || []).filter((_, i) => i !== idx);
                                    updateNodeData(node.id, { jsonSchema: updated });
                                  }}
                                  className="text-slate-400 hover:text-red-500 p-1 rounded-md"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}

                            {(node.data.jsonSchema || []).length === 0 && (
                              <p className="text-[10px] text-purple-900/40 italic text-center py-1.5">
                                Schema list empty. Add an outcome key to structure instructions.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-start px-4 py-1.5 bg-[#fbfcfd] border-t border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <div className="port port-active"></div>
                        <span className="text-[9px] text-slate-400 uppercase tracking-tight font-medium font-mono">Parsed Outcomes</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

            </div>

          </div>

          {/* 3. EXECUTION TRACE TERMINAL & FINAL OUTCOMES (Bottom Dock) */}
          <div className="h-56 bg-slate-900 border-t border-slate-800 p-4 shrink-0 flex flex-col z-10 text-slate-350 overflow-hidden">
            <div className="flex items-center justify-between mb-2 pb-1 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold block">
                  Interactive Execution Trace Logs
                </span>
                
                {isExecuting && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[9px] font-medium flex items-center gap-1 animate-pulse">
                    <span className="h-1.5 w-1.5 bg-amber-400 rounded-full"></span>
                    Gemini Live Fact Grounding & Executing...
                  </span>
                )}

                {executionTrace && !isExecuting && (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-medium flex items-center gap-1">
                    <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full"></span>
                    Trace Evaluated Successfully
                  </span>
                )}
              </div>

              {groundingChunks && groundingChunks.length > 0 && (
                <div className="flex items-center gap-1.5 text-[10px] text-indigo-400 max-w-sm truncate">
                  <span>Grounding References:</span>
                  {groundingChunks.map((chunk, index) => (
                    <a 
                      key={index} 
                      href={chunk.uri} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="underline hover:text-indigo-300 mr-2 truncate"
                    >
                      {chunk.title || `Source ${index+1}`}
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Simulated interactive steps log console */}
            <div className="flex-1 bg-black/40 rounded p-3 font-mono text-xs overflow-y-auto space-y-1 relative leading-relaxed">
              
              {!executionTrace && !isExecuting && !runError && (
                <div className="text-slate-500 italic h-full flex flex-col items-center justify-center text-center p-4">
                  <Terminal className="w-8 h-8 text-slate-700 mb-2" />
                  <p className="font-semibold text-slate-400">Sandbox Idle</p>
                  <p className="text-[11px] font-normal text-slate-600 mt-1">
                    Click "Run Chain" above or toggles inputs. The backend compiles your visual LCEL configuration and triggers a breakdown here.
                  </p>
                </div>
              )}

              {isExecuting && (
                <div className="space-y-1.5">
                  <p className="text-amber-400 font-bold">[1/4] INITIALIZING: visual LCEL piping compilation verified...</p>
                  <p className="text-slate-400">[2/4] BINDING: formatting inputs variables into prompt templates slots...</p>
                  <p className="text-slate-500 animate-pulse">[3/4] MODEL: sending query to Gemini AI API (Streaming enabled)...</p>
                </div>
              )}

              {runError && (
                <div className="p-2.5 bg-red-950/20 border border-red-900/30 rounded text-red-400">
                  <p className="font-bold flex items-center gap-1.5 text-xs">
                    <AlertCircle className="w-4 h-4" /> Run Server Chain Compilation Failed
                  </p>
                  <p className="text-[11px] mt-1.5 leading-relaxed font-sans">{runError}</p>
                </div>
              )}

              {executionTrace && !isExecuting && (
                <div className="space-y-2">
                  <p className="text-emerald-500 font-bold">[ OK ] PIPELINE PARSED SUCCESSFULLY</p>
                  {executionTrace.map((step, idx) => (
                    <div 
                      key={step.id} 
                      className="border-l-2 border-slate-700 pl-3 py-1 text-[11px]"
                    >
                      <p className="font-bold text-slate-300">
                        Step {idx+1}: {step.name} <span className="text-slate-500 font-normal">({step.className})</span>
                      </p>
                      <p className="text-slate-400 italic text-[10px] mt-0.5">{step.description}</p>
                      <div className="grid grid-cols-2 gap-4 mt-1 max-w-4xl text-[10px]">
                        <div>
                          <span className="text-slate-600 font-bold uppercase block tracking-wider">In:</span>
                          <pre className="text-indigo-300 truncate max-h-10">{JSON.stringify(step.inputs)}</pre>
                        </div>
                        <div>
                          <span className="text-slate-600 font-bold uppercase block tracking-wider">Out:</span>
                          <pre className="text-emerald-400 truncate max-h-10">{JSON.stringify(step.outputs)}</pre>
                        </div>
                      </div>
                    </div>
                  ))}

                  {finalOutput && (
                    <div className="mt-2 pt-2 border-t border-slate-800">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-indigo-400 font-bold text-xs uppercase tracking-wider">Result Block Outcome:</p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDownloadOutcome('json')}
                            className="flex items-center gap-1 text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-2 py-0.5 rounded transition-colors cursor-pointer"
                            title="Download outcome as JSON"
                          >
                            <FileText className="w-3 h-3" />
                            Download .JSON
                          </button>
                          <button
                            onClick={() => handleDownloadOutcome('txt')}
                            className="flex items-center gap-1 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-2 py-0.5 rounded transition-colors cursor-pointer"
                            title="Download outcome as plain text"
                          >
                            <FileText className="w-3 h-3" />
                            Download .TXT
                          </button>
                        </div>
                      </div>
                      <pre className="text-emerald-300 text-xs bg-[#0b0f19] p-2.5 rounded border border-slate-800 overflow-x-auto mt-1 max-h-24">
                        {typeof finalOutput === 'object' ? JSON.stringify(finalOutput, null, 2) : String(finalOutput)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
            </>
          )}

          {activeTab === 'code' && (
            <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Full-scale LCEL Integration Script</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Copy and paste this production-ready pipeline script into your local workspace.</p>
                  </div>
                  <div className="flex gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button
                      onClick={() => setCodeLang('typescript')}
                      className={`text-[11px] font-bold px-3 py-1 rounded-md transition-all cursor-pointer ${
                        codeLang === 'typescript' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      TypeScript
                    </button>
                    <button
                      onClick={() => setCodeLang('python')}
                      className={`text-[11px] font-bold px-3 py-1 rounded-md transition-all cursor-pointer ${
                        codeLang === 'python' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Python
                    </button>
                  </div>
                </div>

                <div className="relative bg-slate-900 rounded-xl overflow-hidden mt-2 text-slate-300 p-4 border border-slate-800 text-[11px]">
                  <button
                    onClick={() => handleCopyCode(generateCodeString())}
                    className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 bg-slate-800 text-slate-300 hover:text-white rounded-md text-xs font-semibold hover:bg-slate-700 transition-all cursor-pointer"
                    title="Copy full script"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Script</span>
                      </>
                    )}
                  </button>
                  <pre className="text-xs font-mono text-emerald-400 overflow-x-auto max-h-[500px] leading-relaxed pt-8 custom-scrollbar">
                    {generateCodeString()}
                  </pre>
                </div>

                {/* Local environment helper block */}
                <div className="mt-6 border-t border-slate-100 pt-5 space-y-4">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">How to Setup and Run Locally</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                      <span className="font-bold text-slate-700 block mb-1">1. Install SDK Packages</span>
                      {codeLang === 'typescript' ? (
                        <code className="block bg-slate-900 text-amber-400 font-mono p-2 rounded text-[10.5px]">
                          npm install @langchain/core @langchain/google-genai
                        </code>
                      ) : (
                        <code className="block bg-slate-900 text-amber-400 font-mono p-2 rounded text-[10.5px]">
                          pip install langchain-core langchain-google-genai
                        </code>
                      )}
                    </div>
                    
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                      <span className="font-bold text-slate-700 block mb-1">2. Authenticate securely</span>
                      <code className="block bg-slate-900 text-amber-450 font-mono p-2 rounded text-[10.5px] truncate">
                        export GEMINI_API_KEY="AIzaSy..."
                      </code>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {activeTab === 'guide' && (
            <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
                
                <div>
                  <h3 className="text-lg font-bold text-slate-800">LangChain Expression Language (LCEL) Manual</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Learn how visual blocks are converted to standard, robust enterprise code paths.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-indigo-50/50 border border-indigo-100 space-y-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                      LC
                    </div>
                    <h4 className="font-bold text-xs text-slate-800">Why declarative Piping?</h4>
                    <p className="text-[11px] text-slate-650 leading-relaxed">
                      Instead of chain implementations written line-by-line using complex procedural loop states, LCEL implements standard logical components that safely pass inputs to outputs instantly with optimized concurrent speed.
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-emerald-50/50 border border-emerald-100 space-y-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white text-xs font-bold">
                      G
                    </div>
                    <h4 className="font-bold text-xs text-slate-800">Live Web Grounding</h4>
                    <p className="text-[11px] text-slate-650 leading-relaxed">
                      The Gemini engine features state of the art source checking natively, meaning details are compiled by executing direct web lookups and returning exact citations for real transparency.
                    </p>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-150">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest block">Detailed node classifications</h4>
                  
                  <div className="space-y-3">
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-start gap-3 flex-row">
                      <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Input Variables (chain.InputVariables)</span>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          Captures variables formatted inside prompt templates. Lets you run multiple batch sequences seamlessly.
                        </p>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-start gap-3 flex-row">
                      <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Prompt Template (prompts.ChatPromptTemplate)</span>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          Separates system guardrails and instructions from interactive user parameter entries to prevent prompt injection issues in live servers.
                        </p>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-start gap-3 flex-row">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Chat Model (chat_models.ChatGoogleGenerativeAI)</span>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          Translates processed user prompts into actionable content. Supports temperature dials to tweak creativity constraints or live search toggles.
                        </p>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-start gap-3 flex-row">
                      <div className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 shrink-0" />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Output Parser (output_parsers)</span>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          Guarantees format compliance. Rather than loose paragraph text templates, shapes the result into clean list collections, or structure-validated nested JSON properties.
                        </p>
                      </div>
                    </div>

                  </div>
                </div>

              </div>
            </div>
          )}

        </section>

        {/* SIDEBAR C: CONTROL PARAMETERS & INJECTOR PLAYGROUND (Right) */}
        <aside className="w-80 border-l border-slate-200 bg-white shrink-0 flex flex-col overflow-y-auto p-4 space-y-5 z-20">
          
          {/* SECTION: API KEY OVERRIDE & STATUS CARD */}
          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2.5">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-indigo-600" />
              API Credentials Setup
            </h3>
            
            <div className="space-y-2 text-xs">
              <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 flex items-start gap-2 text-[10.5px]">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Workspace Key Active</span>
                  <p className="text-[9.5px] text-emerald-700/80 leading-normal mt-0.5">
                    Your AI Studio environment key is handled securely behind standard server proxies.
                  </p>
                </div>
              </div>

              <div className="space-y-1 pt-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Gemini API Key Override (Optional)
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                    placeholder="Enter custom absolute key..."
                    className="w-full bg-white border border-slate-200 text-xs rounded p-2 focus:ring-1 focus:ring-indigo-500 text-slate-800 font-mono"
                  />
                  {customApiKey && (
                    <button 
                      onClick={() => setCustomApiKey("")}
                      className="absolute right-2.5 top-2.5 text-[9px] text-red-500 hover:text-red-700 font-bold"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="text-[9.5px] text-slate-400 leading-normal">
                  Supply a developer override token if your account has custom quotas or you are demonstrating out-of-bounds requests. Key is stored locally in client localStorage.
                </p>
              </div>
            </div>
          </div>

          {/* PLAYGROUND: VARIABLE ENTRY SHEET */}
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Play className="w-3.5 h-3.5 text-indigo-600" />
              Interactive Variables
            </h3>
            <div className="space-y-3">
              {currentVariables.map(v => {
                const isLanguageField = v.name === 'to_language';
                return (
                  <div key={v.name} className="space-y-1">
                    <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                      <span>{v.name}</span>
                      <span className="text-[9px] font-mono text-slate-400 font-normal">({`{${v.name}}`})</span>
                    </label>
                    
                    {isLanguageField ? (
                      <select
                        value={v.value}
                        onChange={(e) => handleVariableValueChange(v.name, e.target.value)}
                        className="w-full bg-white border border-slate-200 text-xs rounded p-2 focus:ring-1 focus:ring-indigo-500 cursor-pointer text-slate-800"
                      >
                        <option value="">(Select language)</option>
                        {POPULAR_LANGUAGES.map(lang => (
                          <option key={lang.code} value={lang.code}>
                            {lang.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={v.value}
                        onChange={(e) => handleVariableValueChange(v.name, e.target.value)}
                        placeholder={`Enter live value for {${v.name}}...`}
                        className="w-full bg-white border border-slate-200 text-xs rounded p-2 focus:ring-1 focus:ring-indigo-500 text-slate-850"
                      />
                    )}
                    <p className="text-[9.5px] text-slate-400 line-clamp-1">{v.description}</p>
                  </div>
                );
              })}

              {currentVariables.length === 0 && (
                <p className="text-[11px] text-amber-600 bg-amber-50 rounded p-2 text-center italic">
                  Insert braces parameters inside template text fields.
                </p>
              )}
            </div>
          </div>

          {/* ACTIVE CODE EXPORT BLOCK */}
          <div>
            <div className="flex items-center justify-between border-b pb-2 mb-2">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5 text-indigo-600" />
                LCEL Code Generator
              </h3>
              <div className="flex gap-1 bg-slate-100 p-0.5 rounded border border-slate-200">
                <button
                  onClick={() => setCodeLang('typescript')}
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer ${
                    codeLang === 'typescript' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  TS
                </button>
                <button
                  onClick={() => setCodeLang('python')}
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer ${
                    codeLang === 'python' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  PY
                </button>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 leading-normal mb-1">
              Reflects all template system prompt revisions, values, nodes models, and output parsers visually configured:
            </p>

            <div className="relative bg-slate-900 rounded overflow-hidden mt-1 text-slate-300">
              <button
                onClick={() => handleCopyCode(generateCodeString())}
                className="absolute top-1.5 right-1.5 p-1 bg-slate-800 text-slate-400 hover:text-white rounded"
                title="Copy code format"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
              <pre className="text-[9.5px] font-mono p-2.5 text-emerald-400 overflow-x-auto max-h-48 leading-relaxed">
                {generateCodeString()}
              </pre>
            </div>
          </div>

          {/* ACCORDION C3: LANGSTUDIO LCEL QUICKSTART DISCOVERY */}
          <div className="pt-2 border-t border-slate-100">
            <h4 className="text-[10.5px] font-bold text-slate-700 uppercase tracking-widest mb-1.5">Quick Concepts Guide</h4>
            <div className="text-[10px] text-slate-500 space-y-2 leading-relaxed">
              <div className="flex items-start gap-1">
                <span className="font-bold text-indigo-600 mr-1 shrink-0">Piping ( | ):</span>
                <span>LCEL is a standard declarative specification allowing developer to pipe inputs, templates, models, and JSON parsers in a single self-correcting line.</span>
              </div>
              <div className="flex items-start gap-1">
                <span className="font-bold text-indigo-600 mr-1 shrink-0">Strict JSON:</span>
                <span>The system injects JSON return constraints dynamically underneath into Gemini system filters to guarantee compliance structure.</span>
              </div>
            </div>
          </div>

        </aside>

      </main>

    </div>
  );
}
