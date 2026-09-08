import type { User } from '@supabase/supabase-js';
import { resolveAuthUserId } from './resolve-auth-user-id.util';

describe('resolve-auth-user-id.util', () => {
  it('returns the auth user id', () => {
    expect(resolveAuthUserId({ id: 'user-1' } as User)).toBe('user-1');
  });
});
