import type { SupportProposedActionCard } from '../actions/support-action.types';

export type SupportConversationStatus =
  | 'open'
  | 'waiting_human'
  | 'resolved';

export interface SupportConversation {
  id: string;
  tenant_id: string;
  opened_by_user_id: string;
  status: SupportConversationStatus;
  subject: string | null;
  escalated_at: string | null;
  created_at: string;
  updated_at: string;
}

export type SupportMessageRole = 'user' | 'assistant' | 'system';

export interface SupportMessage {
  id: string;
  conversation_id: string;
  tenant_id: string;
  role: SupportMessageRole;
  content: string;
  provider: string | null;
  model: string | null;
  token_usage: Record<string, unknown> | null;
  moderation_flags: Record<string, unknown> | null;
  created_at: string;
}

export type SupportAiAuditEventType =
  | 'message_sent'
  | 'escalated'
  | 'quota_hit'
  | 'provider_error'
  | 'blocked_input'
  | 'action_previewed'
  | 'action_executed'
  | 'action_rejected';

export interface SupportConversationWithMessages extends SupportConversation {
  messages: SupportMessage[];
}

export type SupportAssistantStatusReason =
  | 'disabled'
  | 'subscription_required'
  | 'addon_required'
  | 'addon_past_due'
  | 'addon_canceled';

export interface SupportAssistantStatus {
  enabled: boolean;
  reason: SupportAssistantStatusReason | null;
  remainingQuotaTenant: number | null;
  remainingQuotaUser: number | null;
  dailyLimitTenant: number | null;
  dailyLimitUser: number | null;
}

/** Payload público de mensagem no chat (sem provider/tokens/flags). */
export interface SupportChatMessage {
  id: string;
  role: SupportMessageRole;
  content: string;
  created_at: string;
}

export interface SupportAssistantMessageResponse {
  conversationId: string;
  userMessage: SupportChatMessage;
  assistantMessage: SupportChatMessage;
  needsHuman: boolean;
  proposedAction?: SupportProposedActionCard | null;
}

export function toSupportChatMessage(message: SupportMessage): SupportChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    created_at: message.created_at,
  };
}
