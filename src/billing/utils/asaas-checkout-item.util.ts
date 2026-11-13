/** Asaas rejects checkout item names longer than this. */
export const ASAAS_CHECKOUT_ITEM_NAME_MAX_LENGTH = 30;

/** Asaas rejects checkout item descriptions longer than this. */
export const ASAAS_CHECKOUT_ITEM_DESCRIPTION_MAX_LENGTH = 150;

export const DEPOSIT_CHECKOUT_ITEM_NAME_PREFIX = 'Sinal: ';

export const DEPOSIT_CHECKOUT_ITEM_DESCRIPTION_LEAD =
  'Pagamento antecipado para confirmar agendamento';

const ELLIPSIS = '…';

/**
 * Keeps an Asaas checkout item name within the 30 character limit.
 * The variable detail is truncated, trailing spaces are removed, and a
 * single ellipsis is appended only when it still fits.
 */
export function limitAsaasCheckoutItemName(
  prefix: string,
  detail: string,
  maxLength = ASAAS_CHECKOUT_ITEM_NAME_MAX_LENGTH,
): string {
  const detailText = detail.trim();

  if (!detailText || prefix.length >= maxLength) {
    return fitCheckoutText(prefix.trimEnd(), maxLength);
  }

  const budget = maxLength - prefix.length;

  if (detailText.length <= budget) {
    return `${prefix}${detailText}`;
  }

  const truncated = detailText.slice(0, budget).trimEnd();
  const withEllipsis =
    truncated.length + ELLIPSIS.length <= budget
      ? `${truncated}${ELLIPSIS}`
      : truncated;

  return `${prefix}${withEllipsis}`;
}

export function buildDepositCheckoutItemCopy(tenantName: string): {
  name: string;
  description: string;
} {
  const fullName = tenantName.trim();
  const name = limitAsaasCheckoutItemName(
    DEPOSIT_CHECKOUT_ITEM_NAME_PREFIX,
    fullName,
  );

  return {
    name,
    description: buildDepositCheckoutItemDescription(fullName),
  };
}

function buildDepositCheckoutItemDescription(fullName: string): string {
  if (!fullName) {
    return DEPOSIT_CHECKOUT_ITEM_DESCRIPTION_LEAD;
  }

  const withLead = `${DEPOSIT_CHECKOUT_ITEM_DESCRIPTION_LEAD}. ${fullName}`;

  if (withLead.length <= ASAAS_CHECKOUT_ITEM_DESCRIPTION_MAX_LENGTH) {
    return withLead;
  }

  if (fullName.length <= ASAAS_CHECKOUT_ITEM_DESCRIPTION_MAX_LENGTH) {
    return fullName;
  }

  return fitCheckoutText(fullName, ASAAS_CHECKOUT_ITEM_DESCRIPTION_MAX_LENGTH);
}

function fitCheckoutText(value: string, maxLength: number): string {
  if (maxLength <= 0) {
    return '';
  }

  if (value.length <= maxLength) {
    return value;
  }

  const truncated = value.slice(0, maxLength).trimEnd();

  if (truncated.length + ELLIPSIS.length <= maxLength) {
    return `${truncated}${ELLIPSIS}`;
  }

  return truncated;
}
