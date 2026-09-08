import { Request } from 'express';

export function extractClientIp(request: Request): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || null;
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0]?.trim() || null;
  }
  return request.ip?.trim() || request.socket?.remoteAddress || null;
}

export function extractUserAgent(request: Request): string | null {
  const value = request.headers['user-agent'];
  if (typeof value === 'string' && value.trim()) {
    return value.trim().slice(0, 512);
  }
  return null;
}
