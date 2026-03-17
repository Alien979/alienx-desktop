/**
 * Google Gemini Provider
 * Uses the official @google/genai SDK with dynamic model loading and file upload support
 */

import { GoogleGenAI } from '@google/genai';
import { LLMProvider, LLMRequest, LLMResponse, LLMProviderConfig } from './types';

export class GoogleProvider implements LLMProvider {
  name = 'Google Gemini';

  async sendRequest(request: LLMRequest, config: LLMProviderConfig): Promise<LLMResponse> {
    const model = config.model || request.model || 'gemini-2.0-flash-exp';

    try {
      // Initialize Google AI client
      const client = new GoogleGenAI({ apiKey: config.apiKey.trim() });

      // Convert messages to Gemini format
      const contents = request.messages
        .filter(m => m.role !== 'system') // Gemini doesn't have separate system messages
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));

      // Add system message as first user message if present
      const systemMessage = request.messages.find(m => m.role === 'system');
      if (systemMessage) {
        contents.unshift({
          role: 'user',
          parts: [{ text: `System: ${systemMessage.content}` }]
        });
      }

      // Generate content
      const result = await client.models.generateContent({
        model,
        contents,
        // @ts-expect-error - generationConfig exists at runtime but not in types
        generationConfig: {
          temperature: config.temperature ?? request.temperature ?? 0.7,
          maxOutputTokens: config.maxTokens ?? request.maxTokens ?? 4000,
        },
      });

      // @ts-ignore - Runtime API may differ from type definitions
      const content = result.text || '';

      if (!content) {
        throw new Error('No response content from Google Gemini');
      }

      return {
        content,
        // @ts-ignore - Runtime API may differ from type definitions
        model: result.response?.modelVersion || model,
        // @ts-ignore - Runtime API may differ from type definitions
        usage: result.response?.usageMetadata ? {
          // @ts-ignore
          promptTokens: result.response.usageMetadata.promptTokenCount || 0,
          // @ts-ignore
          completionTokens: result.response.usageMetadata.candidatesTokenCount || 0,
          // @ts-ignore
          totalTokens: result.response.usageMetadata.totalTokenCount || 0,
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
      if (error?.status === 401 || errorMessage.toLowerCase().includes('api key') || errorMessage.toLowerCase().includes('authentication')) {
        errorMessage = 'Invalid API key. Please check your Google API key.';
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

    try {
      const client = new GoogleGenAI({ apiKey: apiKey.trim() });

      // Try to list models to validate the API key
      await client.models.list();

      return true;
    } catch (error: any) {
      const errorStatus = error?.status || error?.response?.status;
      const errorMessage = error?.error?.message || error?.message || String(error);

      // 401/403 = invalid key
      if (errorStatus === 401 || errorStatus === 403) {
        return false;
      }

      // Check if it's an authentication error
      if (errorMessage.toLowerCase().includes('api key') ||
          errorMessage.toLowerCase().includes('authentication') ||
          errorMessage.toLowerCase().includes('unauthorized')) {
        return false;
      }

      // 429 = rate limited but key is valid
      if (errorStatus === 429) {
        return true;
      }

      return false;
    }
  }

  async listModels(config: LLMProviderConfig): Promise<string[]> {
    const defaultModels = [
      'gemini-2.0-flash-exp',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
    ];

    if (!config.apiKey || !config.apiKey.trim()) {
      return defaultModels;
    }

    try {
      // Use the REST API endpoint directly
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(config.apiKey.trim())}`
      );

      if (!response.ok) {
        return defaultModels;
      }

      const data = await response.json();

      // Extract models that support generateContent
      const modelIds: string[] = [];
      if (data.models && Array.isArray(data.models)) {
        for (const model of data.models) {
          if (model.supportedGenerationMethods?.includes('generateContent')) {
            const modelName = model.name.replace('models/', '');
            modelIds.push(modelName);
          }
        }
      }

      // Return fetched models or defaults if none found
      return modelIds.length > 0 ? modelIds : defaultModels;
    } catch (error) {
      return defaultModels;
    }
  }

  /**
   * Send request with file attachments using Google Gemini File API
   * @param files Array of { name: string, content: string } objects
   * @param request Standard LLM request
   * @param config Provider configuration
   */
  async sendRequestWithFiles(
    files: Array<{ name: string; content: string }>,
    request: LLMRequest,
    config: LLMProviderConfig
  ): Promise<LLMResponse> {
    const model = config.model || request.model || 'gemini-2.0-flash-exp';

    try {
      // Initialize Google AI client
      const client = new GoogleGenAI({ apiKey: config.apiKey.trim() });

      // Upload files to Google Gemini File API
      // @ts-ignore - FileMetadata type may not be exported correctly
      const uploadedFiles: any[] = [];

      for (const file of files) {
        // Create a text file from the content
        const textBlob = new Blob([file.content], { type: 'text/plain' });
        const fileName = file.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
        const fileObject = new File([textBlob], fileName, { type: 'text/plain' });

        try {
          // @ts-ignore - SDK file upload API may differ from type definitions
          const uploadedFile = await client.files.create({
            file: fileObject,
            displayName: file.name,
          });

          // Wait for file to be processed if needed
          let fileMetadata = uploadedFile;
          while (fileMetadata.state === 'PROCESSING') {
            await new Promise(resolve => setTimeout(resolve, 1000));
            fileMetadata = await client.files.get({ name: fileMetadata.name });
          }

          if (fileMetadata.state === 'FAILED') {
            throw new Error(`File ${fileName} failed to process`);
          }

          uploadedFiles.push(fileMetadata);
        } catch (uploadError: any) {
          throw new Error(`Failed to upload file ${fileName}: ${uploadError.message}`);
        }
      }

      // Get system and user messages
      const systemMessage = request.messages.find(m => m.role === 'system');
      const userMessages = request.messages.filter(m => m.role === 'user');
      const userPrompt = userMessages.map(m => m.content).join('\n\n');

      // Build content parts with files and text
      const parts: Array<{ text?: string; fileData?: { fileUri: string; mimeType: string } }> = [];

      // Add system message first if exists
      if (systemMessage) {
        parts.push({
          text: `System: ${systemMessage.content}\n\n`,
        });
      }

      // Add all uploaded files
      uploadedFiles.forEach(file => {
        parts.push({
          fileData: {
            fileUri: file.uri,
            mimeType: file.mimeType,
          },
        });
      });

      // Add user prompt
      parts.push({
        text: userPrompt,
      });

      // Generate content with files
      const result = await client.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
        // @ts-expect-error - generationConfig exists at runtime but not in types
        generationConfig: {
          temperature: config.temperature ?? request.temperature ?? 0.7,
          maxOutputTokens: config.maxTokens ?? request.maxTokens ?? 4000,
        },
      });

      // @ts-ignore
      const content = result.text || '';

      if (!content) {
        throw new Error('No response content from Google Gemini');
      }

      // Clean up uploaded files
      for (const file of uploadedFiles) {
        try {
          // @ts-ignore
          await client.files.delete({ name: file.name });
        } catch (deleteError) {
          // Silently ignore deletion errors
        }
      }

      return {
        content,
        // @ts-ignore - Runtime API may differ from type definitions
        model: result.response?.modelVersion || model,
        // @ts-ignore - Runtime API may differ from type definitions
        usage: result.response?.usageMetadata ? {
          // @ts-ignore
          promptTokens: result.response.usageMetadata.promptTokenCount || 0,
          // @ts-ignore
          completionTokens: result.response.usageMetadata.candidatesTokenCount || 0,
          // @ts-ignore
          totalTokens: result.response.usageMetadata.totalTokenCount || 0,
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
      if (error?.status === 401 || errorMessage.toLowerCase().includes('api key') || errorMessage.toLowerCase().includes('authentication')) {
        errorMessage = 'Invalid API key. Please check your Google API key.';
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




