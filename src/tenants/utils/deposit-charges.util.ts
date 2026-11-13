export function tenantCanChargeDeposits(tenant: {
  asaas_wallet_id?: string | null;
  asaas_charges_enabled?: boolean | null;
}): boolean {
  return Boolean(tenant.asaas_wallet_id?.trim() && tenant.asaas_charges_enabled);
}
