import { Inject, Injectable, Logger, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { InitialSetupService } from '../../tenants/initial-setup.service';
import type { TenantAccessContext } from '../../tenants/entities/tenant-access-context.entity';
import { USER_ROLE_LABELS } from '../../tenants/entities/user-role.type';
import { NtfyService } from '../../notifications/ntfy.service';
import { SupportService } from '../support.service';
import type { CreateSupportAssistantMessageDto } from './dto/create-support-assistant-message.dto';
import type { CreateSupportConversationDto } from './dto/create-support-conversation.dto';
import type { EscalateSupportConversationDto } from './dto/escalate-support-conversation.dto';
import {
  assertSupportTenantSnapshotHasNoForbiddenFields,
  buildSupportTenantSnapshot,
  serializeSupportTenantSnapshot,
} from './context/tenant-snapshot.builder';
import {
  assertSupportAnalyticsSnapshotHasNoForbiddenFields,
  serializeSupportAnalyticsSnapshot,
} from './context/support-analytics-snapshot.builder';
import { SupportAnalyticsSnapshotService } from './context/support-analytics-snapshot.service';
import { SupportAssistantActionsService } from './actions/support-assistant-actions.service';
import { SupportActionProposalStore } from './actions/support-action-proposal.store';
import type {
  SupportAssistantMessageResponse,
  SupportAssistantStatus,
  SupportConversation,
  SupportConversationWithMessages,
} from './entities/support-assistant.types';
import type { SupportProposedActionCard } from './actions/support-action.types';
import type { LlmProvider } from './llm/llm-provider.interface';
import { LLM_PROVIDER } from './llm/llm-provider.token';
import { sanitizeSupportUserInput } from './security/support-input-sanitizer.util';
import { filterSupportAssistantOutput } from './security/support-output-filter.util';
import { detectAndStripNeedsHumanMarker } from './security/support-needs-human.util';
import {
  buildSafeInjectionResponse,
  buildSupportAssistantPrompt,
  isPromptInjectionAttempt,
} from './security/support-prompt-builder.util';
import { SupportAssistantConfigService } from './support-assistant-config.service';
import { SupportAssistantQuotaService } from './support-assistant-quota.service';
import { SupportAssistantRepository } from './support-assistant.repository';
import { SupportKnowledgeService } from './support-knowledge.service';

@Injectable()
export class SupportAssistantService {
  private readonly logger = new Logger(SupportAssistantService.name);

  constructor(
    private readonly config: SupportAssistantConfigService,
    private readonly repository: SupportAssistantRepository,
    private readonly quotaService: SupportAssistantQuotaService,
    private readonly knowledgeService: SupportKnowledgeService,
    private readonly analyticsSnapshotService: SupportAnalyticsSnapshotService,
    private readonly actionsService: SupportAssistantActionsService,
    @Inject(LLM_PROVIDER) private readonly llmProvider: LlmProvider,
    private readonly initialSetupService: InitialSetupService,
    private readonly supportService: SupportService,
    private readonly ntfyService: NtfyService,
  ) {}

  async getStatus(params: {
    tenantId: string;
    userId: string;
  }): Promise<SupportAssistantStatus> {
    if (!this.config.isEnabled()) {
      return {
        enabled: false,
        remainingQuotaTenant: null,
        remainingQuotaUser: null,
      };
    }

    const remaining = await this.quotaService.getRemainingQuota(params);

    return {
      enabled: true,
      remainingQuotaTenant: remaining.remainingTenant,
      remainingQuotaUser: remaining.remainingUser,
    };
  }

  async createConversation(
    context: TenantAccessContext,
    user: User,
    dto: CreateSupportConversationDto,
  ): Promise<SupportConversation> {
    this.config.assertReady();

    return this.repository.createConversation({
      tenantId: context.tenant.id,
      userId: user.id,
      subject: dto.subject,
    });
  }

  async getConversation(
    context: TenantAccessContext,
    user: User,
    conversationId: string,
  ): Promise<SupportConversationWithMessages> {
    this.config.assertReady();

    return this.repository.getConversationWithMessages({
      conversationId,
      tenantId: context.tenant.id,
      userId: user.id,
    });
  }

  async sendMessage(
    context: TenantAccessContext,
    user: User,
    conversationId: string,
    dto: CreateSupportAssistantMessageDto,
  ): Promise<SupportAssistantMessageResponse> {
    this.config.assertReady();

    const conversation = await this.repository.findConversationForUser({
      conversationId,
      tenantId: context.tenant.id,
      userId: user.id,
    });

    if (!conversation) {
      throw new BadRequestException('Conversa não encontrada.');
    }

    const sanitized = sanitizeSupportUserInput(
      dto.content,
      this.config.getMaxMessageChars(),
    );

    if (sanitized.blocked) {
      await this.repository.insertAuditEvent({
        tenantId: context.tenant.id,
        userId: user.id,
        conversationId,
        eventType: 'blocked_input',
        metadata: { reason: sanitized.reason ?? 'blocked' },
      });
      throw new BadRequestException(
        sanitized.reason ?? 'Mensagem inválida.',
      );
    }

    await this.quotaService.assertCanSendMessage({
      tenantId: context.tenant.id,
      userId: user.id,
      conversationId,
    });

    const existing = await this.repository.getConversationWithMessages({
      conversationId,
      tenantId: context.tenant.id,
      userId: user.id,
    });

    const historyBeforeSend = existing.messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .slice(-this.config.getMaxHistoryMessages())
      .map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      }));

    const userMessage = await this.repository.insertMessage({
      conversationId,
      tenantId: context.tenant.id,
      role: 'user',
      content: sanitized.sanitized,
    });

    let assistantContent: string;
    let provider: string | null = null;
    let model: string | null = null;
    let tokenUsage: Record<string, unknown> | null = null;
    let moderationFlags: Record<string, unknown> | null = null;
    let needsHuman = false;
    let proposedAction: SupportProposedActionCard | null = null;

    if (isPromptInjectionAttempt(sanitized.sanitized)) {
      const injection = detectAndStripNeedsHumanMarker(
        buildSafeInjectionResponse(),
      );
      assistantContent = injection.content;
      needsHuman = injection.needsHuman;
      moderationFlags = { prompt_injection: true };
    } else {
      try {
        const setup = await this.initialSetupService.getStatusForUser(user.id);
        const snapshot = buildSupportTenantSnapshot(context, setup);
        assertSupportTenantSnapshotHasNoForbiddenFields(snapshot);

        const analyticsSnapshot =
          await this.analyticsSnapshotService.buildForContext(context);
        assertSupportAnalyticsSnapshotHasNoForbiddenFields(analyticsSnapshot);

        const prompt = buildSupportAssistantPrompt({
          knowledge: this.knowledgeService.getKnowledgeCorpus(),
          tenantSnapshotJson: serializeSupportTenantSnapshot(snapshot),
          analyticsSnapshotJson:
            serializeSupportAnalyticsSnapshot(analyticsSnapshot),
          history: historyBeforeSend,
          userMessage: sanitized.sanitized,
        });

        const completion = await this.llmProvider.complete({
          systemInstruction: prompt.systemInstruction,
          userTurn: prompt.userTurn,
          history: historyBeforeSend,
        });

        const filtered = filterSupportAssistantOutput(completion.content);
        const enriched = await this.actionsService.enrichAssistantOutput({
          context,
          userId: user.id,
          conversationId,
          assistantContent: filtered.content,
        });
        const detected = detectAndStripNeedsHumanMarker(enriched.displayContent);
        assistantContent = detected.content;
        needsHuman = detected.needsHuman;
        proposedAction = enriched.proposedAction;
        provider = completion.provider;
        model = completion.model;
        tokenUsage = completion.tokenUsage;
        moderationFlags = {
          ...(filtered.flagged ? { flags: filtered.flags } : {}),
          ...(needsHuman ? { needs_human: true } : {}),
          ...(proposedAction ? { proposed_action: proposedAction.type } : {}),
        };
        if (Object.keys(moderationFlags).length === 0) {
          moderationFlags = null;
        }
      } catch (error) {
        await this.repository.insertAuditEvent({
          tenantId: context.tenant.id,
          userId: user.id,
          conversationId,
          eventType: 'provider_error',
        });

        if (error instanceof ServiceUnavailableException) {
          throw error;
        }

        this.logger.warn('Support assistant generation failed');
        throw new ServiceUnavailableException(
          'O assistente está indisponível no momento. Tente novamente ou fale com nossa equipe.',
        );
      }
    }

    const assistantMessage = await this.repository.insertMessage({
      conversationId,
      tenantId: context.tenant.id,
      role: 'assistant',
      content: assistantContent,
      provider,
      model,
      tokenUsage,
      moderationFlags,
    });

    await this.repository.insertAuditEvent({
      tenantId: context.tenant.id,
      userId: user.id,
      conversationId,
      eventType: 'message_sent',
      metadata: needsHuman ? { needs_human: true } : null,
    });

    if (needsHuman) {
      await this.ntfyService.notifySupportNeedsHuman({
        tenantName: context.tenant.name,
        tenantId: context.tenant.id,
        userRole: USER_ROLE_LABELS[context.tenantUser.role],
        userEmail: user.email ?? undefined,
        question: sanitized.sanitized,
      });
    }

    return {
      conversationId,
      userMessage,
      assistantMessage,
      needsHuman,
      proposedAction,
    };
  }

  async executeAction(
    context: TenantAccessContext,
    user: User,
    dto: { proposalId: string; confirmCancelConflicting?: boolean },
  ) {
    this.config.assertReady();
    return this.actionsService.executeProposal({
      context,
      userId: user.id,
      proposalId: dto.proposalId,
      confirmCancelConflicting: dto.confirmCancelConflicting,
    });
  }

  async dismissAction(
    context: TenantAccessContext,
    user: User,
    dto: { proposalId: string },
  ) {
    this.config.assertReady();
    return this.actionsService.dismissProposal({
      context,
      userId: user.id,
      proposalId: dto.proposalId,
    });
  }

  async escalateConversation(
    context: TenantAccessContext,
    user: User,
    conversationId: string,
    dto: EscalateSupportConversationDto,
  ): Promise<{ success: true }> {
    const conversation = await this.repository.getConversationWithMessages({
      conversationId,
      tenantId: context.tenant.id,
      userId: user.id,
    });

    const transcript = conversation.messages
      .map((message) => {
        const label = message.role === 'assistant' ? 'Assistente' : 'Você';
        return `${label}: ${message.content}`;
      })
      .join('\n\n');

    const extraMessage = dto.message?.trim();
    const body = [
      extraMessage,
      '',
      '--- Transcrição do assistente ---',
      transcript || '(sem mensagens)',
    ]
      .filter((line, index, array) => !(line === '' && index === array.length - 1))
      .join('\n');

    await this.supportService.sendRequest(context, {
      name: dto.name.trim(),
      email: dto.email.trim(),
      subject: dto.subject.trim(),
      message: body,
    });

    await this.repository.markConversationEscalated({
      conversationId,
      tenantId: context.tenant.id,
    });

    await this.repository.insertAuditEvent({
      tenantId: context.tenant.id,
      userId: user.id,
      conversationId,
      eventType: 'escalated',
      metadata: {
        role: USER_ROLE_LABELS[context.tenantUser.role],
      },
    });

    return { success: true };
  }
}
