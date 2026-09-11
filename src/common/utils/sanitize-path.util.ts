export function sanitizeApiPath(rawUrl: string | undefined | null): string {
  if (!rawUrl) return 'unknown';

  const withoutQuery = rawUrl.split('?')[0] ?? '';
  let path = withoutQuery;

  try {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      path = new URL(path).pathname;
    }
  } catch {
    // Mantem o caminho original se falhar o parse
  }

  // Substitui UUIDs por :id
  const uuidRegex =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  path = path.replace(uuidRegex, ':id');

  // Substitui IDs numericos por :id
  path = path.replace(/\/(\d+)(?=\/|$)/g, '/:id');

  return path || '/';
}
