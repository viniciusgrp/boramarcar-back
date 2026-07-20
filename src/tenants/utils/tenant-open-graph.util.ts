export const TENANT_OG_DESCRIPTION_MAX_LENGTH = 300;

export interface TenantOpenGraphInput {
  name: string;
  slug: string;
  description: string | null;
  addressCity: string | null;
  logoUrl: string | null;
}

export interface TenantOpenGraphUrls {
  appOrigin: string;
  apiOrigin: string;
}

export interface TenantOpenGraphPayload {
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
  imageAlt: string;
  siteName: string;
  faviconUrl: string | null;
}

function trimTrailingSlash(origin: string): string {
  return origin.replace(/\/+$/, '');
}

function truncateDescription(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const sliced = normalized.slice(0, maxLength - 1).trimEnd();
  return `${sliced}…`;
}

export function buildTenantOpenGraphFallbackDescription(
  name: string,
  addressCity: string | null,
): string {
  const city = addressCity?.trim();
  const location = city ? ` em ${city}` : '';
  return `Agende online em ${name.trim()}${location}. Horários disponíveis 24h.`;
}

export function resolveTenantOpenGraphDescription(
  description: string | null,
  name: string,
  addressCity: string | null,
): string {
  const custom = description?.trim();
  if (custom) {
    return truncateDescription(custom, TENANT_OG_DESCRIPTION_MAX_LENGTH);
  }

  return truncateDescription(
    buildTenantOpenGraphFallbackDescription(name, addressCity),
    TENANT_OG_DESCRIPTION_MAX_LENGTH,
  );
}

export function buildTenantOpenGraphPayload(
  input: TenantOpenGraphInput,
  urls: TenantOpenGraphUrls,
): TenantOpenGraphPayload {
  const name = input.name.trim();
  const slug = input.slug.trim();
  const appOrigin = trimTrailingSlash(urls.appOrigin);
  const apiOrigin = trimTrailingSlash(urls.apiOrigin);
  const description = resolveTenantOpenGraphDescription(
    input.description,
    name,
    input.addressCity,
  );

  return {
    title: `${name} | Agendar online`,
    description,
    canonicalUrl: `${appOrigin}/${slug}`,
    imageUrl: `${apiOrigin}/tenants/${encodeURIComponent(slug)}/og-image`,
    imageAlt: name,
    siteName: name,
    faviconUrl: input.logoUrl?.trim() || null,
  };
}
