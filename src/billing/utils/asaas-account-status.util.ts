/**
 * Same decisions as the ACCOUNT_STATUS webhook handler.
 * `general` drives charges and the stored account status.
 * Documentation approval marks details as submitted without enabling charges.
 * commercialInfo and bankAccountInfo are part of the Asaas status payload and
 * are accepted here so sync and webhooks share one mapper; the webhook does
 * not let those two fields change the three local columns on their own.
 */
export interface AsaasAccountStatusInput {
  eventType?: string | null;
  general?: string | null;
  commercialInfo?: string | null;
  bankAccountInfo?: string | null;
  documentation?: string | null;
}

export interface AsaasAccountStatusPatch {
  asaasChargesEnabled?: boolean;
  asaasDetailsSubmitted?: boolean;
  asaasAccountStatus?: string | null;
}

export function mapAsaasAccountStatusUpdate(
  input: AsaasAccountStatusInput,
): AsaasAccountStatusPatch | null {
  const eventType = input.eventType?.trim() ?? '';
  const general = input.general?.trim() ?? '';
  const documentation = input.documentation?.trim() ?? '';
  const chargesEnabled =
    eventType === 'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED' ||
    general === 'APPROVED';
  const generalRejected =
    eventType === 'ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED' ||
    general === 'REJECTED';

  if (chargesEnabled || generalRejected) {
    return {
      asaasChargesEnabled: chargesEnabled,
      asaasDetailsSubmitted: chargesEnabled || documentation === 'APPROVED',
      asaasAccountStatus: chargesEnabled ? 'APPROVED' : 'REJECTED',
    };
  }

  if (
    eventType === 'ACCOUNT_STATUS_DOCUMENT_APPROVED' ||
    eventType === 'ACCOUNT_STATUS_DOCUMENT_REJECTED'
  ) {
    return {
      asaasDetailsSubmitted: eventType === 'ACCOUNT_STATUS_DOCUMENT_APPROVED',
    };
  }

  if (
    !eventType &&
    (documentation === 'APPROVED' || documentation === 'REJECTED')
  ) {
    return {
      asaasDetailsSubmitted: documentation === 'APPROVED',
    };
  }

  return null;
}
