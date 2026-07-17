import type { SupportAiStatus } from '../entities/support-ai-status.type';
import type { Tenant } from '../entities/tenant.entity';
import { isSubscriptionActive } from './tenant-access.util';

export const SUPPORT_AI_ADDON_REQUIRED_MESSAGE =
  'O Assistente IA é um complemento pago. Assine em Faturamento para usar.';

export const SUPPORT_AI_SUBSCRIPTION_REQUIRED_MESSAGE =
  'O Assistente IA só fica disponível após assinar um plano (não no período de testes).';

export const SUPPORT_AI_PAST_DUE_MESSAGE =
  'Pagamento do Assistente IA pendente. Atualize o pagamento no portal de assinatura.';

export type SupportAiDenialReason =
  | 'subscription_required'
  | 'addon_required'
  | 'addon_past_due'
  | 'addon_canceled';

export type SupportAiAccessResult =
  | { allowed: true }
  | { allowed: false; reason: SupportAiDenialReason };

type SupportAiTenantFields = Pick<
  Tenant,
  'subscription_status' | 'support_ai_enabled' | 'support_ai_status'
>;

/**
 * Entitlement do add-on Assistente IA.
 * Exige plano ACTIVE (pago), flag do tenant e status do add-on ativo (ou cortesia sem status).
 */
export function resolveSupportAiAccess(
  tenant: SupportAiTenantFields,
): SupportAiAccessResult {
  if (!isSubscriptionActive(tenant.subscription_status)) {
    return { allowed: false, reason: 'subscription_required' };
  }

  if (!tenant.support_ai_enabled) {
    return { allowed: false, reason: 'addon_required' };
  }

  const status = tenant.support_ai_status as SupportAiStatus | null;

  if (status === 'past_due') {
    return { allowed: false, reason: 'addon_past_due' };
  }

  if (status === 'canceled' || status === 'inactive') {
    return { allowed: false, reason: 'addon_canceled' };
  }

  // null = cortesia operacional; 'active' = cobrado e em dia
  return { allowed: true };
}

export function canAccessSupportAi(tenant: SupportAiTenantFields): boolean {
  return resolveSupportAiAccess(tenant).allowed;
}

export function getSupportAiDenialMessage(
  reason: SupportAiDenialReason,
): string {
  switch (reason) {
    case 'subscription_required':
      return SUPPORT_AI_SUBSCRIPTION_REQUIRED_MESSAGE;
    case 'addon_past_due':
      return SUPPORT_AI_PAST_DUE_MESSAGE;
    case 'addon_canceled':
    case 'addon_required':
    default:
      return SUPPORT_AI_ADDON_REQUIRED_MESSAGE;
  }
}
