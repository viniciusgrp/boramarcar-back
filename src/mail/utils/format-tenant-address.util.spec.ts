import { formatTenantAddress } from './format-tenant-address.util';
import type { Tenant } from '../../tenants/entities/tenant.entity';

describe('format-tenant-address.util', () => {
  it('joins address parts with a middle dot', () => {
    expect(
      formatTenantAddress({
        address_street: 'Rua A',
        address_number: '10',
        address_city: 'São Paulo',
        address_state: 'SP',
        address_cep: '01000-000',
      } as Tenant),
    ).toBe('Rua A, 10 · São Paulo - SP · 01000-000');
  });

  it('falls back when the tenant has no address', () => {
    expect(formatTenantAddress({} as Tenant)).toBe('Endereço não informado');
  });
});
