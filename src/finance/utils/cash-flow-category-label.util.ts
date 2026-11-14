/** Portuguese labels for cash-flow category codes (no em dashes). */

const LABELS: Record<string, string> = {
  APPOINTMENT: 'Atendimento',
  APPOINTMENT_REVERSAL: 'Estorno de atendimento',
  PRODUCT_SALE: 'Venda de produto',
  COMMISSION_PAYOUT: 'Repasse de comissão',
  OPENING_BALANCE: 'Saldo de abertura',
  CLOSING_ADJUSTMENT: 'Ajuste de fechamento',
  EXPENSE: 'Despesa',
  REVENUE: 'Receita',
};

export function cashFlowCategoryLabel(category: string | null | undefined): string {
  const key = category?.trim() ?? '';

  if (!key) {
    return 'Lançamento';
  }

  return LABELS[key] ?? key;
}
