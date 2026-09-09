import type { User } from '@supabase/supabase-js';
import {
  isCustomerProfileComplete,
  normalizeInstagramHandle,
  resolveCustomerDisplayName,
} from './customer-profile.util';
import type { Customer } from '../entities/customer.entity';

describe('customer-profile.util', () => {
  it('requires a phone for a complete profile', () => {
    expect(
      isCustomerProfileComplete({ phone: '11999999999' } as Customer),
    ).toBe(true);
    expect(isCustomerProfileComplete({ phone: ' ' } as Customer)).toBe(false);
  });

  it('prefers the OAuth display name', () => {
    const user = {
      identities: [{ provider: 'google' }],
      user_metadata: { full_name: 'Maria Silva' },
    } as unknown as User;

    expect(resolveCustomerDisplayName(user, 'Outro')).toBe('Maria Silva');
  });

  it('strips Instagram at-signs', () => {
    expect(normalizeInstagramHandle('@@studio')).toBe('studio');
  });
});
