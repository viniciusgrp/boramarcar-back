import { isValidCustomCommissionRate } from '../../services/utils/service-commission.util';
import { calculateCommissionAmount } from '../../professionals/utils/professional-commission.util';

/**
 * Resolve o percentual de comissão de uma linha de venda de produto.
 * Prioridade: taxa específica do produto > comissão padrão de vendas do
 * profissional > zero (produtos não têm comissão por padrão, diferente de
 * serviços, que herdam o percentual geral do profissional).
 */
export function resolveCommissionPercentForProductLine(
  productCustomCommissionRate: number | null | undefined,
  professionalProductCommissionPercent: number | null | undefined,
): number {
  if (isValidCustomCommissionRate(productCustomCommissionRate)) {
    return Math.round(Number(productCustomCommissionRate) * 100) / 100;
  }

  if (isValidCustomCommissionRate(professionalProductCommissionPercent)) {
    return Math.round(Number(professionalProductCommissionPercent) * 100) / 100;
  }

  return 0;
}

export interface ProductSaleCommissionLine {
  quantity: number;
  unitPrice: number;
  customCommissionRate: number | null | undefined;
}

export function calculateProductSaleLineCommission(
  line: ProductSaleCommissionLine,
  professionalProductCommissionPercent: number | null | undefined,
): { commissionPercent: number; commissionAmount: number } {
  const commissionPercent = resolveCommissionPercentForProductLine(
    line.customCommissionRate,
    professionalProductCommissionPercent,
  );
  const subtotal = Math.round(line.quantity * line.unitPrice * 100) / 100;

  return {
    commissionPercent,
    commissionAmount: calculateCommissionAmount(subtotal, commissionPercent),
  };
}
