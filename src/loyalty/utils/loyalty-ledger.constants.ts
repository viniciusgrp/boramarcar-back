/** Stable ledger descriptions for loyalty movements. */

export const LOYALTY_COMPLETION_EARN_DESCRIPTION =
  'Pontos pelo atendimento concluído';

export const LOYALTY_COMPLETION_REVERSE_DESCRIPTION =
  'Estorno — conclusão revertida';

export const LOYALTY_WELCOME_BONUS_DESCRIPTION = 'Bônus de cadastro';

export const LOYALTY_BOOKING_REDEEM_PREFIX = 'Resgate no agendamento: ';

export const LOYALTY_STANDALONE_REDEEM_PREFIX = 'Resgate: ';

export const LOYALTY_RESTORE_REDEEM_DESCRIPTION =
  'Resgate reaplicado: agendamento reativado';

export const LOYALTY_REFUND_REDEEM_DESCRIPTION =
  'Estorno de resgate: agendamento cancelado';

export function buildBookingRedeemDescription(rewardTitle: string): string {
  return `${LOYALTY_BOOKING_REDEEM_PREFIX}${rewardTitle}`;
}

export function buildStandaloneRedeemDescription(rewardTitle: string): string {
  return `${LOYALTY_STANDALONE_REDEEM_PREFIX}${rewardTitle}`;
}

export function buildExpirationDescription(expirationDays: number): string {
  return `Pontos expirados após ${expirationDays} dias`;
}

export function isBookingRedeemDescription(description: string): boolean {
  return description.startsWith(LOYALTY_BOOKING_REDEEM_PREFIX);
}

export function isStandaloneRedeemDescription(description: string): boolean {
  return (
    description.startsWith(LOYALTY_STANDALONE_REDEEM_PREFIX) &&
    !isBookingRedeemDescription(description)
  );
}

/** Any redeem that charges points for a reward (booking, standalone, or restore). */
export function isRewardRedeemDescription(description: string): boolean {
  return (
    isBookingRedeemDescription(description) ||
    isStandaloneRedeemDescription(description) ||
    description === LOYALTY_RESTORE_REDEEM_DESCRIPTION
  );
}

export function isRedeemRefundDescription(description: string): boolean {
  return description.startsWith('Estorno de resgate');
}

export function isCompletionEarnDescription(description: string): boolean {
  return description === LOYALTY_COMPLETION_EARN_DESCRIPTION;
}

export function isCompletionReverseDescription(description: string): boolean {
  return description === LOYALTY_COMPLETION_REVERSE_DESCRIPTION;
}

export function isWelcomeBonusDescription(description: string): boolean {
  return description === LOYALTY_WELCOME_BONUS_DESCRIPTION;
}

/** Earn rows that create expireable point lots (excludes redeem refunds). */
export function isExpireableEarnDescription(description: string): boolean {
  return !isRedeemRefundDescription(description);
}
