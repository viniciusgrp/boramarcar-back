import { tenantCanChargeDeposits } from './deposit-charges.util';

describe('tenantCanChargeDeposits', () => {
  it('requires a wallet and charges enabled', () => {
    expect(
      tenantCanChargeDeposits({
        asaas_wallet_id: 'wal_1',
        asaas_charges_enabled: true,
      }),
    ).toBe(true);
    expect(
      tenantCanChargeDeposits({
        asaas_wallet_id: '  ',
        asaas_charges_enabled: true,
      }),
    ).toBe(false);
    expect(
      tenantCanChargeDeposits({
        asaas_wallet_id: 'wal_1',
        asaas_charges_enabled: false,
      }),
    ).toBe(false);
    expect(tenantCanChargeDeposits({})).toBe(false);
  });
});
