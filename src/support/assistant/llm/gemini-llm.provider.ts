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

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  usageMetadata?: Record<string, unknown>;
  error?: { message?: string };
}

@Injectable()
export class GeminiLlmProvider implements LlmProvider {
  private readonly logger = new Logger(GeminiLlmProvider.name);

  constructor(private readonly config: SupportAssistantConfigService) {}

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const apiKey = this.config.getApiKey();
    const model = this.config.getModel();
    const timeoutMs = this.config.getTimeoutMs();
    const maxTokens = this.config.getMaxTokens();

    if (!this.config.isLikelyGeminiApiKey(apiKey)) {
      this.logger.warn(
        'SUPPORT_AI_API_KEY format looks unexpected. Create a Gemini key at https://aistudio.google.com/apikey (prefix AIza or AQ.)',
      );
    }

    // Prefer header auth; query-string keys are still accepted but headers avoid URL leaks.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: request.systemInstruction }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: request.userTurn }],
            },
          ],
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: 0.2,
          },
        }),
      });

      const payload = (await response.json()) as GeminiGenerateContentResponse;

      if (!response.ok) {
        const apiMessage = payload.error?.message?.trim();
        this.logger.warn(
          `Gemini request failed with status ${response.status}${
            apiMessage ? `: ${apiMessage}` : ` (model=${model})`
          }`,
        );
        throw new ServiceUnavailableException(
          'O assistente está indisponível no momento. Tente novamente ou fale com nossa equipe.',
        );
      }

      const text =
        payload.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? '')
          .join('')
          .trim() ?? '';

      if (!text) {
        throw new ServiceUnavailableException(
          'O assistente não retornou uma resposta válida. Tente novamente ou fale com nossa equipe.',
        );
      }

      return {
        content: text,
        provider: 'gemini',
        model,
        tokenUsage: payload.usageMetadata ?? null,
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

      this.logger.warn('Gemini provider error');
      throw new ServiceUnavailableException(
        'O assistente está indisponível no momento. Tente novamente ou fale com nossa equipe.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
