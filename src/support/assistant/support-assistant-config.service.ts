import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

  getApiKey(): string {
    return this.configService.get<string>('SUPPORT_AI_API_KEY')?.trim() ?? '';
  }

  getModel(): string {
    return (
      this.configService.get<string>('SUPPORT_AI_MODEL')?.trim() ||
      'gemini-1.5-flash'
    );
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
