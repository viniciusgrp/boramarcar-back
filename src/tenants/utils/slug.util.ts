/** Strict pattern for newly created slugs (no consecutive hyphens). */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Legacy slugs already stored may contain consecutive hyphens. */
const STORED_SLUG_PATTERN = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9]+)?$/;

export function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && SLUG_PATTERN.test(slug);
}

export function isStoredSlug(slug: string): boolean {
  return slug.length > 0 && STORED_SLUG_PATTERN.test(slug);
}

export function resolveSlugForUpdate(
  currentSlug: string,
  nextSlug: string,
): string {
  if (nextSlug.trim().toLowerCase() === currentSlug.trim().toLowerCase()) {
    return currentSlug;
  }

  return normalizeSlug(nextSlug);
}
