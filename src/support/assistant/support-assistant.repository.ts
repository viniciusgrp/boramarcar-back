import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import type {
  SupportAiAuditEventType,
  SupportConversation,
  SupportConversationWithMessages,
  SupportMessage,
} from './entities/support-assistant.types';

@Injectable()
export class SupportAssistantRepository {
  private readonly logger = new Logger(SupportAssistantRepository.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async createConversation(params: {
    tenantId: string;
    userId: string;
    subject?: string | null;
  }): Promise<SupportConversation> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('support_conversations')
      .insert({
        tenant_id: params.tenantId,
        opened_by_user_id: params.userId,
        subject: params.subject?.trim() || null,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message ?? 'Não foi possível iniciar a conversa.',
      );
    }

    return data as SupportConversation;
  }

  async findConversationForUser(params: {
    conversationId: string;
    tenantId: string;
    userId: string;
  }): Promise<SupportConversation | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('support_conversations')
      .select('*')
      .eq('id', params.conversationId)
      .eq('tenant_id', params.tenantId)
      .eq('opened_by_user_id', params.userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data as SupportConversation | null) ?? null;
  }

  async getConversationWithMessages(params: {
    conversationId: string;
    tenantId: string;
    userId: string;
  }): Promise<SupportConversationWithMessages> {
    const conversation = await this.findConversationForUser(params);

    if (!conversation) {
      throw new NotFoundException('Conversa não encontrada.');
    }

    const { data: messages, error } = await this.supabaseService
      .getClient()
      .from('support_messages')
      .select('*')
      .eq('conversation_id', params.conversationId)
      .eq('tenant_id', params.tenantId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return {
      ...conversation,
      messages: (messages ?? []) as SupportMessage[],
    };
  }

  async countMessagesInConversation(conversationId: string): Promise<number> {
    const { count, error } = await this.supabaseService
      .getClient()
      .from('support_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return count ?? 0;
  }

  async insertMessage(params: {
    conversationId: string;
    tenantId: string;
    role: SupportMessage['role'];
    content: string;
    provider?: string | null;
    model?: string | null;
    tokenUsage?: Record<string, unknown> | null;
    moderationFlags?: Record<string, unknown> | null;
  }): Promise<SupportMessage> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('support_messages')
      .insert({
        conversation_id: params.conversationId,
        tenant_id: params.tenantId,
        role: params.role,
        content: params.content,
        provider: params.provider ?? null,
        model: params.model ?? null,
        token_usage: params.tokenUsage ?? null,
        moderation_flags: params.moderationFlags ?? null,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message ?? 'Não foi possível salvar a mensagem.',
      );
    }

    await this.supabaseService
      .getClient()
      .from('support_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', params.conversationId)
      .eq('tenant_id', params.tenantId);

    return data as SupportMessage;
  }

  async markConversationEscalated(params: {
    conversationId: string;
    tenantId: string;
  }): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('support_conversations')
      .update({
        status: 'waiting_human',
        escalated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.conversationId)
      .eq('tenant_id', params.tenantId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  async countAuditEventsSince(params: {
    tenantId: string;
    userId?: string;
    eventType: SupportAiAuditEventType;
    sinceIso: string;
  }): Promise<number> {
    let query = this.supabaseService
      .getClient()
      .from('support_ai_audit_events')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', params.tenantId)
      .eq('event_type', params.eventType)
      .gte('created_at', params.sinceIso);

    if (params.userId) {
      query = query.eq('user_id', params.userId);
    }

    const { count, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return count ?? 0;
  }

  async insertAuditEvent(params: {
    tenantId: string;
    userId: string;
    conversationId?: string | null;
    eventType: SupportAiAuditEventType;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('support_ai_audit_events')
      .insert({
        tenant_id: params.tenantId,
        user_id: params.userId,
        conversation_id: params.conversationId ?? null,
        event_type: params.eventType,
        metadata: params.metadata ?? null,
      });

    if (error) {
      // Never block chat/actions on audit (ex.: CHECK antigo sem action_*).
      this.logger.warn(
        `Audit event "${params.eventType}" skipped: ${error.message}`,
      );
    }
  }
}
