import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmProvider,
} from './llm-provider.interface';
import { SupportAssistantConfigService } from '../support-assistant-config.service';

interface OpenAiChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  usage?: Record<string, unknown>;
  error?: { message?: string };
}

@Injectable()
export class OpenAiLlmProvider implements LlmProvider {
  private readonly logger = new Logger(OpenAiLlmProvider.name);

  constructor(private readonly config: SupportAssistantConfigService) {}

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const apiKey = this.config.getApiKey();
    const model = this.config.getModel();
    const timeoutMs = this.config.getTimeoutMs();
    const maxTokens = this.config.getMaxTokens();

    const url = 'https://api.openai.com/v1/chat/completions';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: maxTokens,
          messages: [
            {
              role: 'system',
              content: request.systemInstruction,
            },
            {
              role: 'user',
              content: request.userTurn,
            },
          ],
        }),
      });

      const payload = (await response.json()) as OpenAiChatCompletionResponse;

      if (!response.ok) {
        const apiMessage = payload.error?.message?.trim();
        this.logger.warn(
          `OpenAI request failed with status ${response.status}${
            apiMessage ? `: ${apiMessage}` : ` (model=${model})`
          }`,
        );
        throw new ServiceUnavailableException(
          'O assistente está indisponível no momento. Tente novamente ou fale com nossa equipe.',
        );
      }

      const text = payload.choices?.[0]?.message?.content?.trim() ?? '';

      if (!text) {
        throw new ServiceUnavailableException(
          'O assistente não retornou uma resposta válida. Tente novamente ou fale com nossa equipe.',
        );
      }

      return {
        content: text,
        provider: 'openai',
        model,
        tokenUsage: payload.usage ?? null,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new ServiceUnavailableException(
          'O assistente demorou para responder. Tente novamente ou fale com nossa equipe.',
        );
      }

      this.logger.warn('OpenAI provider error');
      throw new ServiceUnavailableException(
        'O assistente está indisponível no momento. Tente novamente ou fale com nossa equipe.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
