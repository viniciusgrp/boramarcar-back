import type { Provider } from '@nestjs/common';
import { SupportAssistantConfigService } from '../support-assistant-config.service';
import { GeminiLlmProvider } from './gemini-llm.provider';
import { GroqLlmProvider } from './groq-llm.provider';
import { OpenAiLlmProvider } from './openai-llm.provider';
import type { LlmProvider } from './llm-provider.interface';
import { LLM_PROVIDER } from './llm-provider.token';

export const llmProviderFactory: Provider = {
  provide: LLM_PROVIDER,
  inject: [
    SupportAssistantConfigService,
    OpenAiLlmProvider,
    GroqLlmProvider,
    GeminiLlmProvider,
  ],
  useFactory: (
    config: SupportAssistantConfigService,
    openai: OpenAiLlmProvider,
    groq: GroqLlmProvider,
    gemini: GeminiLlmProvider,
  ): LlmProvider => {
    const provider = config.getProvider();
    if (provider === 'gemini') {
      return gemini;
    }
    if (provider === 'groq') {
      return groq;
    }
    return openai;
  },
};
