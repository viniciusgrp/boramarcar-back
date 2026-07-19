import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SupportAiProviderName = 'openai' | 'groq' | 'gemini';

@Injectable()
export class SupportAssistantConfigService {
  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    const flag = this.configService.get<string>('SUPPORT_AI_ENABLED')?.trim();
    if (flag === 'false' || flag === '0') {
      return false;
    }
    return Boolean(this.getApiKey());
  }

  getProvider(): SupportAiProviderName {
    const raw =
      this.configService.get<string>('SUPPORT_AI_PROVIDER')?.trim().toLowerCase() ??
      'openai';
    if (raw === 'gemini') {
      return 'gemini';
    }
    if (raw === 'groq') {
      return 'groq';
    }
    return 'openai';
  }

  getApiKey(): string {
    const raw = this.configService.get<string>('SUPPORT_AI_API_KEY')?.trim() ?? '';
    if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      return raw.slice(1, -1).trim();
    }
    return raw;
  }

  /**
   * Google AI Studio keys:
   * - Auth keys (current default): usually start with "AQ."
   * - Standard keys (legacy): usually start with "AIza"
   */
  isLikelyGeminiApiKey(apiKey = this.getApiKey()): boolean {
    return apiKey.startsWith('AIza') || apiKey.startsWith('AQ.');
  }

  isLikelyOpenAiApiKey(apiKey = this.getApiKey()): boolean {
    return apiKey.startsWith('sk-');
  }

  getModel(): string {
    const configured = this.configService.get<string>('SUPPORT_AI_MODEL')?.trim();
    if (configured) {
      return configured;
    }
    switch (this.getProvider()) {
      case 'gemini':
        return 'gemini-2.5-flash';
      case 'groq':
        return 'llama-3.3-70b-versatile';
      default:
        return 'gpt-4o-mini';
    }
  }

  getMaxTokens(): number {
    return this.parsePositiveInt('SUPPORT_AI_MAX_TOKENS', 1024);
  }

  getTimeoutMs(): number {
    return this.parsePositiveInt('SUPPORT_AI_TIMEOUT_MS', 25_000);
  }

  getMaxMessageChars(): number {
    return this.parsePositiveInt('SUPPORT_AI_MAX_MESSAGE_CHARS', 2000);
  }

  getMaxHistoryMessages(): number {
    return this.parsePositiveInt('SUPPORT_AI_MAX_HISTORY_MESSAGES', 12);
  }

  getMaxMessagesPerConversation(): number {
    return this.parsePositiveInt('SUPPORT_AI_MAX_MESSAGES_PER_CONVERSATION', 40);
  }

  getDailyLimitPerTenant(): number {
    return this.parsePositiveInt('SUPPORT_AI_DAILY_LIMIT_PER_TENANT', 200);
  }

  getDailyLimitPerUser(): number {
    return this.parsePositiveInt('SUPPORT_AI_DAILY_LIMIT_PER_USER', 50);
  }

  assertReady(): void {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'O assistente de suporte não está disponível no momento.',
      );
    }
  }

  private parsePositiveInt(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }
}
