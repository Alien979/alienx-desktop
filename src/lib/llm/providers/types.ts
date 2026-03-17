/**
 * LLM Provider Types
 */

export interface LLMProviderConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  endpoint?: string; // for providers needing custom endpoint (e.g., Azure)
}

export interface LLMRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: string;
}

export interface LLMProvider {
  name: string;
  sendRequest(request: LLMRequest, config: LLMProviderConfig): Promise<LLMResponse>;
  validateAPIKey(apiKey: string): Promise<boolean>;
  listModels?(config: LLMProviderConfig): Promise<string[]>;
}




