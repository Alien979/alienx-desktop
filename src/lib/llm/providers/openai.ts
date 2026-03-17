/**
 * OpenAI Provider (ChatGPT, GPT-4)
 * Uses the official openai SDK
 */

import OpenAI from 'openai';
import { jsPDF } from 'jspdf';
import { LLMProvider, LLMRequest, LLMResponse, LLMProviderConfig } from './types';

export class OpenAIProvider implements LLMProvider {
  name = 'OpenAI';

  async sendRequest(request: LLMRequest, config: LLMProviderConfig): Promise<LLMResponse> {
    const model = config.model || request.model || 'gpt-5.1';
    
    try {
      // Initialize OpenAI client
      const openai = new OpenAI({
        apiKey: config.apiKey.trim(),
        dangerouslyAllowBrowser: true, // Required for browser usage
      });

      // Standard chat completion (text only) - no file attachments
      const completion = await openai.chat.completions.create({
        model,
        messages: request.messages.map(m => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        })),
        temperature: config.temperature ?? request.temperature ?? 0.7,
        // Use max_completion_tokens for newer models; fall back to max_tokens if needed
        max_completion_tokens: config.maxTokens ?? request.maxTokens ?? 4000,
      });

      const content =
        completion.choices[0]?.message?.content ||
        completion.choices[0]?.message?.refusal ||
        '';

      if (!content) {
        return {
          content: 'OpenAI returned no content. Check model availability/permissions and reduce prompt size or max tokens.',
          model: completion.model || model,
        };
      }

      return {
        content,
        model: completion.model || model,
        usage: completion.usage ? {
          promptTokens: completion.usage.prompt_tokens || 0,
          completionTokens: completion.usage.completion_tokens || 0,
          totalTokens: completion.usage.total_tokens || 0,
        } : undefined,
      };
    } catch (error: any) {
      // Handle SDK errors
      let errorMessage = 'Unknown error occurred';
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error?.error) {
        // OpenAI SDK error format
        if (error.error.message) {
          errorMessage = error.error.message;
        } else if (typeof error.error === 'string') {
          errorMessage = error.error;
        }
      } else if (error?.message) {
        errorMessage = error.message;
      }

      // Add helpful context for common errors
      if (error?.status === 401 || errorMessage.toLowerCase().includes('api key') || errorMessage.toLowerCase().includes('authentication')) {
        errorMessage = 'Invalid API key. Please check your OpenAI API key.';
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

    // Basic format validation - OpenAI keys start with sk-
    const trimmedKey = apiKey.trim();
    if (!trimmedKey.startsWith('sk-')) {
      return false;
    }

    try {
      // Initialize OpenAI client
      const openai = new OpenAI({
        apiKey: trimmedKey,
        dangerouslyAllowBrowser: true, // Required for browser usage
      });

      // Use a minimal request to validate the API key
      // List models is a lightweight endpoint
      await openai.models.list();

      return true;
    } catch (error: any) {
      // Handle SDK errors
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

      // Network errors
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        return false;
      }

      // Unknown error - assume invalid
      return false;
    }
  }

  async listModels(config: LLMProviderConfig): Promise<string[]> {
    if (!config.apiKey || !config.apiKey.trim()) return [];
    try {
      const openai = new OpenAI({
        apiKey: config.apiKey.trim(),
        dangerouslyAllowBrowser: true,
      });
      const response = await openai.models.list();
      // Filter to chat-capable models only (heuristic)
      return response.data
        .map(m => m.id)
        .filter(id => id.toLowerCase().includes('gpt'));
    } catch {
      return [];
    }
  }

  /**
   * Send request with file attachments using OpenAI Responses API
   * @param files Array of { name: string, content: string } objects
   * @param request Standard LLM request
   * @param config Provider configuration
   */
  async sendRequestWithFiles(
    files: Array<{ name: string; content: string }>,
    request: LLMRequest,
    config: LLMProviderConfig
  ): Promise<LLMResponse> {
    const model = config.model || request.model || 'gpt-5.1';

    try {
      // Initialize OpenAI client
      const openai = new OpenAI({
        apiKey: config.apiKey.trim(),
        dangerouslyAllowBrowser: true,
      });

      // Upload files to OpenAI Files API
      const uploadedFileIds: string[] = [];

      for (const file of files) {
        // Create a PDF from the text content
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 10;
        const maxWidth = pageWidth - 2 * margin;
        const lineHeight = 7;
        let y = margin;

        // Add title
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(file.name.replace('.txt', ''), margin, y);
        y += lineHeight * 2;

        // Add content
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(file.content, maxWidth);

        for (const line of lines) {
          if (y + lineHeight > pageHeight - margin) {
            doc.addPage();
            y = margin;
          }
          doc.text(line, margin, y);
          y += lineHeight;
        }

        // Convert PDF to blob
        const pdfBlob = doc.output('blob');
        const pdfFileName = file.name.replace('.txt', '.pdf');
        const fileObject = new File([pdfBlob], pdfFileName, { type: 'application/pdf' });

        try {
          const uploadedFile = await openai.files.create({
            file: fileObject,
            purpose: 'user_data',
          });
          uploadedFileIds.push(uploadedFile.id);
        } catch (uploadError: any) {
          throw new Error(`Failed to upload file ${pdfFileName}: ${uploadError.message}`);
        }
      }

      // Get system and user messages
      const systemMessage = request.messages.find(m => m.role === 'system');
      const userMessages = request.messages.filter(m => m.role === 'user');
      const userPrompt = userMessages.map(m => m.content).join('\n\n');

      // Build content array with input_file and input_text
      const contentArray: Array<{ type: string; file_id?: string; text?: string }> = [];

      // Add system message first if exists (as input_text)
      if (systemMessage) {
        contentArray.push({
          type: 'input_text',
          text: `SYSTEM INSTRUCTIONS:\n${systemMessage.content}\n\n`,
        });
      }

      // Add all uploaded files as input_file
      uploadedFileIds.forEach(fileId => {
        contentArray.push({
          type: 'input_file',
          file_id: fileId,
        });
      });

      // Add user prompt as input_text
      contentArray.push({
        type: 'input_text',
        text: userPrompt,
      });

      // Call the Responses API
      const response = await (openai as any).responses.create({
        model,
        input: [
          {
            role: 'user',
            content: contentArray,
          },
        ],
        temperature: config.temperature ?? request.temperature ?? 0.7,
        max_output_tokens: config.maxTokens ?? request.maxTokens ?? 4000,
      });

      const content = response.output_text || response.output || '';

      if (!content) {
        throw new Error('No response content from OpenAI Responses API');
      }

      // Clean up uploaded files
      for (const fileId of uploadedFileIds) {
        try {
          await openai.files.del(fileId);
        } catch (deleteError) {
          // Silently ignore deletion errors
        }
      }

      return {
        content,
        model: response.model || model,
        usage: response.usage ? {
          promptTokens: response.usage.input_tokens || response.usage.prompt_tokens || 0,
          completionTokens: response.usage.output_tokens || response.usage.completion_tokens || 0,
          totalTokens: response.usage.total_tokens || 0,
        } : undefined,
      };
    } catch (error: any) {
      // Handle SDK errors
      let errorMessage = 'Unknown error occurred';

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error?.error) {
        // OpenAI SDK error format
        if (error.error.message) {
          errorMessage = error.error.message;
        } else if (typeof error.error === 'string') {
          errorMessage = error.error;
        }
      } else if (error?.message) {
        errorMessage = error.message;
      }

      // Add helpful context for common errors
      if (error?.status === 401 || errorMessage.toLowerCase().includes('api key') || errorMessage.toLowerCase().includes('authentication')) {
        errorMessage = 'Invalid API key. Please check your OpenAI API key.';
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




