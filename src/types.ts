export type ParserType = 'string' | 'json' | 'list';

export interface SchemaField {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
}

export interface NodeData {
  // Input Node
  variables?: { name: string; value: string; description: string }[];
  
  // PromptTemplate Node
  systemPromptTemplate?: string;
  userPromptTemplate?: string;
  inputVariables?: string[];

  // ChatModel Node
  modelName?: string;
  temperature?: number;
  enableSearch?: boolean;

  // OutputParser Node
  parserType?: ParserType;
  jsonSchema?: SchemaField[];
}

export interface ChainNode {
  id: string;
  type: 'Input' | 'PromptTemplate' | 'ChatModel' | 'OutputParser';
  name: string;
  data: NodeData;
}

export interface ChainTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  nodes: ChainNode[];
}

export interface ChainRunRequest {
  nodes: ChainNode[];
  inputs: Record<string, string>;
}

export interface SearchGroundingChunk {
  title?: string;
  uri?: string;
}

export interface TraceStep {
  id: string;
  name: string;
  className: string;
  status: 'idle' | 'running' | 'success' | 'error';
  inputs: any;
  outputs: any;
  durationMs?: number;
  error?: string;
  description: string;
}

export interface ChainRunResponse {
  success: boolean;
  error?: string;
  trace: TraceStep[];
  finalOutput: any;
  groundingChunks?: SearchGroundingChunk[];
}
