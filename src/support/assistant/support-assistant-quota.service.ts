import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { SupportAssistantConfigService } from './support-assistant-config.service';
import { SupportAssistantRepository } from './support-assistant.repository';

export interface SupportQuotaStatus {
  remainingTenant: number;
  remainingUser: number;
}

@Injectable()
export class SupportAssistantQuotaService {
  constructor(
    private readonly config: SupportAssistantConfigService,
    private readonly repository: SupportAssistantRepository,
  ) {}

  async getRemainingQuota(params: {
    tenantId: string;
    userId: string;
  }): Promise<SupportQuotaStatus> {
    const sinceIso = this.getRollingDayStartIso();
    const [tenantCount, userCount] = await Promise.all([
      this.repository.countAuditEventsSince({
        tenantId: params.tenantId,
        eventType: 'message_sent',
        sinceIso,
      }),
      this.repository.countAuditEventsSince({
        tenantId: params.tenantId,
        userId: params.userId,
        eventType: 'message_sent',
        sinceIso,
      }),
    ]);

    return {
      remainingTenant: Math.max(
        0,
        this.config.getDailyLimitPerTenant() - tenantCount,
      ),
      remainingUser: Math.max(
        0,
        this.config.getDailyLimitPerUser() - userCount,
      ),
    };
  }

  async assertCanSendMessage(params: {
    tenantId: string;
    userId: string;
    conversationId: string;
  }): Promise<SupportQuotaStatus> {
    const remaining = await this.getRemainingQuota(params);

    if (remaining.remainingTenant <= 0 || remaining.remainingUser <= 0) {
      await this.repository.insertAuditEvent({
        tenantId: params.tenantId,
        userId: params.userId,
        conversationId: params.conversationId,
        eventType: 'quota_hit',
      });
      throw new HttpException(
        'Limite diário do assistente atingido. Use o atendimento humano.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const messageCount = await this.repository.countMessagesInConversation(
      params.conversationId,
    );

    if (messageCount >= this.config.getMaxMessagesPerConversation()) {
      throw new HttpException(
        'Esta conversa atingiu o limite de mensagens. Inicie uma nova ou fale com nossa equipe.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return remaining;
  }

  private getRollingDayStartIso(): string {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }
}
