import type { User } from '@supabase/supabase-js';

export function resolveAuthUserId(user: User): string {
  return user.id;
}
