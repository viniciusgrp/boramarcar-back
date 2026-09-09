import type { IncomingHttpHeaders } from 'http';

export function getClientIp(request: {
  ip?: string;
  headers: IncomingHttpHeaders;
}): string | undefined {
  const forwarded = request.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || undefined;
  }

  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0]?.trim() || undefined;
  }

  return request.ip?.trim() || undefined;
}
