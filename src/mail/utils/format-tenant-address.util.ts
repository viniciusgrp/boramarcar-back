import type { Tenant } from '../../tenants/entities/tenant.entity';

export function formatTenantAddress(tenant: Tenant): string {
  const streetLine = [tenant.address_street, tenant.address_number]
    .filter((part) => part?.trim())
    .join(', ');

  const cityLine = [tenant.address_city, tenant.address_state]
    .filter((part) => part?.trim())
    .join(' - ');

  const parts = [
    streetLine || null,
    tenant.address_complement?.trim() || null,
    tenant.address_neighborhood?.trim() || null,
    cityLine || null,
    tenant.address_cep?.trim() || null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(' · ') : 'Endereço não informado';
}
