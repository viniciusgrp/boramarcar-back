import { cashFlowCategoryLabel } from './cash-flow-category-label.util';

describe('cashFlowCategoryLabel', () => {
  it('maps known codes to Portuguese without em dashes', () => {
    expect(cashFlowCategoryLabel('APPOINTMENT')).toBe('Atendimento');
    expect(cashFlowCategoryLabel('PRODUCT_SALE')).toBe('Venda de produto');
    expect(cashFlowCategoryLabel('COMMISSION_PAYOUT')).toBe(
      'Repasse de comissão',
    );
    expect(cashFlowCategoryLabel('PRODUCT_SALE')).not.toMatch(/[—–]/);
  });

  it('falls back for unknown categories', () => {
    expect(cashFlowCategoryLabel('CUSTOM')).toBe('CUSTOM');
    expect(cashFlowCategoryLabel('')).toBe('Lançamento');
  });
});
