import type { User } from '@supabase/supabase-js';
import type { Customer } from '../entities/customer.entity';

export function isCustomerProfileComplete(customer: Customer | null): boolean {
  return Boolean(customer?.phone?.trim());
}

export function hasOAuthIdentity(user: User): boolean {
  return Boolean(
    user.identities?.some(
      (identity) =>
        identity.provider === 'google' || identity.provider === 'facebook',
    ),
  );
}

export function resolveOAuthProviderDisplayName(user: User): string | null {
  if (!hasOAuthIdentity(user)) {
    return null;
  }

  const metadataName = user.user_metadata?.full_name;
  const metadataNameText =
    typeof metadataName === 'string' ? metadataName.trim() : '';

  return metadataNameText.length >= 2 ? metadataNameText : null;
}

export function normalizeCustomerDisplayName(value?: string): string | null {
  const trimmed = value?.trim();

  if (!trimmed || trimmed.length < 2) {
    return null;
  }

  return trimmed;
}

export function resolveCustomerDisplayName(
  user: User,
  providedName?: string,
): string | null {
  const oauthName = resolveOAuthProviderDisplayName(user);

  if (oauthName) {
    return oauthName;
  }

  return normalizeCustomerDisplayName(providedName);
}

export function resolveOAuthDisplayName(user: User): string {
  const metadataName = user.user_metadata?.full_name;
  const metadataNameText =
    typeof metadataName === 'string' ? metadataName.trim() : '';

  if (metadataNameText) {
    return metadataNameText;
  }

  const emailPrefix = user.email?.split('@')[0]?.trim();

  return emailPrefix || 'Cliente';
}

export function resolveOAuthAvatarUrl(user: User): string | null {
  const avatar = user.user_metadata?.avatar_url;
  const avatarText = typeof avatar === 'string' ? avatar.trim() : '';

  return avatarText || null;
}

export function normalizeInstagramHandle(value?: string): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/^@+/, '');
}

export function normalizeAcquisitionSource(value?: string): string | null {
  const trimmed = value?.trim();

  return trimmed || null;
}
