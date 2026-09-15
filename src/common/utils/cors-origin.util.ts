/** RFC1918 / loopback hostnames used when testing the app from a phone on the LAN. */
export function isPrivateLanHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return true;
  }

  if (/^10(?:\.\d{1,3}){3}$/.test(host)) {
    return true;
  }

  if (/^192\.168(?:\.\d{1,3}){2}$/.test(host)) {
    return true;
  }

  if (/^172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(host)) {
    return true;
  }

  return false;
}

export function isPrivateLanOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return isPrivateLanHostname(url.hostname);
  } catch {
    return false;
  }
}

export function isCorsOriginAllowed(params: {
  origin: string | undefined;
  isProduction: boolean;
  allowedOrigins: string[];
  corsAllowAll: boolean;
}): boolean {
  const { origin, isProduction, allowedOrigins, corsAllowAll } = params;

  if (!origin || corsAllowAll || allowedOrigins.includes(origin)) {
    return true;
  }

  return !isProduction && isPrivateLanOrigin(origin);
}
