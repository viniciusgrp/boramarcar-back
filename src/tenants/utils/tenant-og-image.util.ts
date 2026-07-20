export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

const REMOTE_IMAGE_TIMEOUT_MS = 4000;
const REMOTE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export async function fetchRemoteImageBuffer(
  url: string,
): Promise<Buffer | null> {
  const trimmed = url.trim();
  if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS);

  try {
    const response = await fetch(trimmed, {
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > REMOTE_IMAGE_MAX_BYTES) {
      return null;
    }

    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface TenantOgSvgOptions {
  name: string;
  primaryColor: string;
  textColor: string;
  hasBanner: boolean;
  hasLogo: boolean;
}

/** Transparent SVG overlay with tenant name (and optional logo placeholder spacing). */
export function buildTenantOgSvg(options: TenantOgSvgOptions): string {
  const titleX = options.hasLogo ? 280 : 80;
  const titleY = options.hasBanner ? 220 : 280;
  const subtitleY = titleY + 64;
  const maxNameChars = options.hasLogo ? 28 : 34;
  const displayName =
    options.name.length > maxNameChars
      ? `${options.name.slice(0, maxNameChars - 1)}…`
      : options.name;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" viewBox="0 0 ${OG_IMAGE_WIDTH} ${OG_IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <text x="${titleX}" y="${titleY}" fill="${options.textColor}" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700">${displayName}</text>
  <text x="${titleX}" y="${subtitleY}" fill="${options.textColor}" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="500" opacity="0.85">Agendar online</text>
  <text x="80" y="560" fill="${options.textColor}" font-family="Arial, Helvetica, sans-serif" font-size="22" opacity="0.7">BoraMarcar</text>
</svg>`;
}
