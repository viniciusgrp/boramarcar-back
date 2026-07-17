import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { PlanTier } from '../../tenants/entities/plan-tier.type';
import { getSupportAiDailyQuota } from '../../tenants/utils/support-ai-quota.util';
import { SupportAssistantConfigService } from './support-assistant-config.service';
import { SupportAssistantRepository } from './support-assistant.repository';

export interface SupportQuotaStatus {
  remainingTenant: number;
  remainingUser: number;
  dailyLimitTenant: number;
  dailyLimitUser: number;
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
    planTier: PlanTier;
  }): Promise<SupportQuotaStatus> {
    const sinceIso = this.getRollingDayStartIso();
    const limits = getSupportAiDailyQuota(params.planTier);
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
      dailyLimitTenant: limits.tenant,
      dailyLimitUser: limits.user,
      remainingTenant: Math.max(0, limits.tenant - tenantCount),
      remainingUser: Math.max(0, limits.user - userCount),
    };
  }

  async assertCanSendMessage(params: {
    tenantId: string;
    userId: string;
    conversationId: string;
    planTier: PlanTier;
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
