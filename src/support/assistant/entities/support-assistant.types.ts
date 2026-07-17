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
  | 'blocked_input';

export interface SupportConversationWithMessages extends SupportConversation {
  messages: SupportMessage[];
}

export interface SupportAssistantStatus {
  enabled: boolean;
  remainingQuotaTenant: number | null;
  remainingQuotaUser: number | null;
}

export interface SupportAssistantMessageResponse {
  conversationId: string;
  userMessage: SupportMessage;
  assistantMessage: SupportMessage;
}
