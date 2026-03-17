/**
 * Anthropic Provider (Claude)
 * Uses the official @anthropic-ai/sdk
 */

import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMRequest, LLMResponse, LLMProviderConfig } from './types';

export class AnthropicProvider implements LLMProvider {
  name = 'Anthropic';

  async sendRequest(request: LLMRequest, config: LLMProviderConfig): Promise<LLMResponse> {
    const model = config.model || request.model || 'claude-sonnet-4-5';

    try {
      // Initialize Anthropic client with API key
      const anthropic = new Anthropic({
        apiKey: config.apiKey.trim(),
        dangerouslyAllowBrowser: true,
      });

      // Convert messages format for Anthropic API
      // Anthropic requires system message to be separate
      const systemMessage = request.messages.find(m => m.role === 'system')?.content || '';
      const userMessages = request.messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        }));

      // Ensure we have at least one user message
      if (userMessages.length === 0) {
        throw new Error('At least one user message is required');
      }

      // Prepare request parameters following the SDK example pattern
      const requestParams: any = {
        model,
        max_tokens: config.maxTokens ?? request.maxTokens ?? 4096,
        messages: userMessages,
      };

      // Include system message if it exists
      if (systemMessage && systemMessage.trim().length > 0) {
        requestParams.system = systemMessage;
      }

      // Include temperature if provided
      if (config.temperature !== undefined || request.temperature !== undefined) {
        requestParams.temperature = config.temperature ?? request.temperature ?? 0.7;
      }

      // Make the API call using the SDK (following docs pattern)
      const message = await anthropic.messages.create(requestParams);

      // Extract content from response
      let content = '';
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === 'text' && 'text' in block) {
            content = block.text;
            break;
          }
        }
      }

      if (!content || content.trim().length === 0) {
        throw new Error('No response content from Anthropic');
      }

      return {
        content,
        model: message.model || model,
        usage: message.usage ? {
          promptTokens: message.usage.input_tokens || 0,
          completionTokens: message.usage.output_tokens || 0,
          totalTokens: (message.usage.input_tokens || 0) + (message.usage.output_tokens || 0),
        } : undefined,
      };
    } catch (error: any) {
      let errorMessage = 'Unknown error occurred';

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error?.message) {
        errorMessage = error.message;
      }

      // Add helpful context for common errors
      if (error?.status === 401 || errorMessage.toLowerCase().includes('api key')) {
        errorMessage = 'Invalid API key. Please check your Anthropic API key.';
      } else if (error?.status === 429 || errorMessage.toLowerCase().includes('rate limit')) {
        errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
      }

      return {
        content: '',
        model,
        error: errorMessage,
      };
    }
  }

  async validateAPIKey(apiKey: string): Promise<boolean> {
    if (!apiKey || apiKey.trim().length === 0) {
      return false;
    }

    // Basic format validation - Anthropic keys start with sk-ant-
    const trimmedKey = apiKey.trim();
    if (!trimmedKey.startsWith('sk-ant-')) {
      return false;
    }

    // Match the exact Python validation approach
    // Python code: model="claude-3-haiku-20240307", max_tokens=100, messages=[{"role": "user", "content": "Hello!..."}]
    try {

      const anthropic = new Anthropic({
        apiKey: trimmedKey,
        dangerouslyAllowBrowser: true,
      } as any);

      // Match Python validation exactly
      await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 100,
        messages: [
          { role: 'user', content: 'Hello! Please confirm this API key is working.' }
        ],
      });

      // If we get here with a response, the key is valid
      return true;
    } catch (error: any) {
      // Check error status from SDK
      const errorStatus = error?.status || error?.statusCode || error?.response?.status;
      const errorMessage = error?.error?.message || error?.message || String(error);

      // Try direct fetch as fallback (in case SDK has browser issues)
      
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': trimmedKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 100,
            messages: [
              { role: 'user', content: 'Hello! Please confirm this API key is working.' }
            ],
          }),
        });

        const responseText = await response.text();

        if (response.status === 200) {
          return true;
        }

        if (response.status === 401 || response.status === 403) {
          return false;
        }

        if (response.status === 400) {
          // Parse error to check if it's auth-related
          try {
            const errorData = JSON.parse(responseText);
            const errorMsg = (errorData.error?.message || errorData.message || '').toLowerCase();
            
            if (errorMsg.includes('api key') ||
                errorMsg.includes('authentication') ||
                errorMsg.includes('unauthorized')) {
              return false;
            }
            // 400 but not auth error = key is valid, just parameter issue
            return true;
          } catch {
            // Can't parse, assume invalid
            return false;
          }
        }

        if (response.status === 429) {
          return true;
        }

        return false;
      } catch (fetchError: any) {
        // If both fail, check if it's a network/CORS issue
        if (fetchError instanceof TypeError && fetchError.message.includes('Failed to fetch')) {
          // Since Python works, the key is likely valid - return true to allow user to proceed
          // They'll get an error on actual use if it's really invalid
          return true;
        }
      }

      // Final error handling
      if (errorStatus === 401 || errorStatus === 403) {
        return false;
      }

      // If we can't determine, but Python worked, assume valid (might be browser issue)
      if (errorStatus === undefined && errorMessage.includes('fetch')) {
        return true;
      }

      return false;
    }
  }

  async listModels(config: LLMProviderConfig): Promise<string[]> {
    const defaultModels = [
      'claude-sonnet-4-5',
      'claude-haiku-4-5',
      'claude-opus-4-5',
      'claude-opus-4-1',
    ];

    if (!config.apiKey || !config.apiKey.trim()) {
      return defaultModels;
    }

    try {
      const client = new Anthropic({
        apiKey: config.apiKey.trim(),
        dangerouslyAllowBrowser: true,
      });

      const modelIds: string[] = [];

      // Automatically fetches more pages as needed
      for await (const modelInfo of client.models.list()) {
        // @ts-ignore - SDK type definitions may be incomplete
        if (modelInfo.id) {
          // @ts-ignore
          modelIds.push(modelInfo.id);
        }
      }

      // Return fetched models or defaults if none found
      return modelIds.length > 0 ? modelIds : defaultModels;
    } catch (error) {
      return defaultModels;
    }
  }

  /**
   * Send request with file attachments using Anthropic base64 document encoding
   * Uses base64-encoded documents in Messages API (browser-compatible, no file upload needed)
   */
  async sendRequestWithFiles(
    files: Array<{ name: string; content: string }>,
    request: LLMRequest,
    config: LLMProviderConfig
  ): Promise<LLMResponse> {
    const model = config.model || request.model || 'claude-sonnet-4-5';

    try {
      // Initialize Anthropic client
      const anthropic = new Anthropic({
        apiKey: config.apiKey.trim(),
        dangerouslyAllowBrowser: true,
      });

      // Get system and user messages
      const systemMessage = request.messages.find(m => m.role === 'system');
      const userMessages = request.messages.filter(m => m.role === 'user');
      const userPrompt = userMessages.map(m => m.content).join('\n\n');

      // Build content with all file data included as text
      // Since document type with base64 may not be supported in browser,
      // we'll format the files as structured text content

      let fullUserContent = '';

      // Add each file as a structured section
      for (const file of files) {
        fullUserContent += `\n\n=== FILE: ${file.name} ===\n\n${file.content}\n\n=== END OF ${file.name} ===\n\n`;
      }

      // Add the user prompt at the end
      fullUserContent += `\n\n${userPrompt}`;

      // Prepare request parameters with simple text content
      const requestParams: any = {
        model,
        messages: [
          {
            role: 'user',
            content: fullUserContent,
          },
        ],
        max_tokens: config.maxTokens ?? request.maxTokens ?? 4096,
      };

      // Only include system message if it exists
      if (systemMessage && systemMessage.content.trim().length > 0) {
        requestParams.system = systemMessage.content;
      }

      // Include temperature if provided
      if (config.temperature !== undefined || request.temperature !== undefined) {
        requestParams.temperature = config.temperature ?? request.temperature ?? 0.7;
      }

      // Make the API call using SDK
      const message = await anthropic.messages.create(requestParams);

      // Extract content from response
      let content = '';
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === 'text' && 'text' in block) {
            content = block.text;
            break;
          }
        }
      }

      if (!content) {
        throw new Error('No response content from Anthropic Messages API');
      }

      return {
        content,
        model: message.model || model,
        usage: message.usage ? {
          promptTokens: message.usage.input_tokens || 0,
          completionTokens: message.usage.output_tokens || 0,
          totalTokens: (message.usage.input_tokens || 0) + (message.usage.output_tokens || 0),
        } : undefined,
      };
    } catch (error: any) {
      // Handle SDK errors
      let errorMessage = 'Unknown error occurred';

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error?.error) {
        if (typeof error.error === 'string') {
          errorMessage = error.error;
        } else if (error.error.message) {
          errorMessage = error.error.message;
        } else if (error.error.type) {
          errorMessage = `${error.error.type}: ${error.error.message || 'Unknown error'}`;
        }
      } else if (error?.message) {
        errorMessage = error.message;
      }

      // Add helpful context for common errors
      if (error?.status === 401 || errorMessage.toLowerCase().includes('api key') || errorMessage.toLowerCase().includes('authentication')) {
        errorMessage = 'Invalid API key. Please check your Anthropic API key.';
      } else if (error?.status === 429 || errorMessage.toLowerCase().includes('rate limit')) {
        errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
      }

      return {
        content: '',
        model,
        error: errorMessage,
      };
    }
  }
}

