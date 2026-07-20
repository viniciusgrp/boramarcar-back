import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { TenantsService } from './tenants.service';
import type { TenantOpenGraphPayload } from './utils/tenant-open-graph.util';
import { buildTenantOpenGraphPayload } from './utils/tenant-open-graph.util';
import {
  buildTenantOgSvg,
  escapeXml,
  fetchRemoteImageBuffer,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
} from './utils/tenant-og-image.util';

@Injectable()
export class TenantOpenGraphService {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly configService: ConfigService,
  ) {}

  async getOpenGraphPayload(slug: string): Promise<TenantOpenGraphPayload> {
    const tenant = await this.tenantsService.findBySlug(slug);

    if (!tenant) {
      throw new NotFoundException(`Tenant with slug "${slug}" was not found`);
    }

    return buildTenantOpenGraphPayload(
      {
        name: tenant.name,
        slug: tenant.slug,
        description: tenant.description,
        addressCity: tenant.address_city,
        logoUrl: tenant.logo_url,
      },
      {
        appOrigin: this.resolveAppOrigin(),
        apiOrigin: this.resolveApiOrigin(),
      },
    );
  }

  async getOgImagePng(slug: string): Promise<Buffer> {
    const tenant = await this.tenantsService.findBySlug(slug);

    if (!tenant) {
      throw new NotFoundException(`Tenant with slug "${slug}" was not found`);
    }

    const primaryColor = tenant.primary_color?.trim() || '#111827';
    const safeName = escapeXml(tenant.name.trim() || 'Estabelecimento');

    const [bannerBuffer, logoBuffer] = await Promise.all([
      tenant.banner_url
        ? fetchRemoteImageBuffer(tenant.banner_url)
        : Promise.resolve(null),
      tenant.logo_url
        ? fetchRemoteImageBuffer(tenant.logo_url)
        : Promise.resolve(null),
    ]);

    const hasBanner = Boolean(bannerBuffer);
    const textColor = hasBanner
      ? '#ffffff'
      : pickContrastingTextColor(primaryColor);

    const composites: sharp.OverlayOptions[] = [];

    if (hasBanner && bannerBuffer) {
      const dimOverlay = await sharp({
        create: {
          width: OG_IMAGE_WIDTH,
          height: OG_IMAGE_HEIGHT,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0.45 },
        },
      })
        .png()
        .toBuffer();
      composites.push({ input: dimOverlay, top: 0, left: 0 });
    }

    if (logoBuffer) {
      const logoSize = 160;
      const logo = await sharp(logoBuffer)
        .resize(logoSize, logoSize, {
          fit: 'cover',
          position: 'centre',
        })
        .png()
        .toBuffer();

      composites.push({
        input: logo,
        top: hasBanner ? 120 : 160,
        left: 80,
      });
    }

    const svg = buildTenantOgSvg({
      name: safeName,
      primaryColor,
      textColor,
      hasBanner,
      hasLogo: Boolean(logoBuffer),
    });
    composites.push({ input: Buffer.from(svg), top: 0, left: 0 });

    const base = hasBanner && bannerBuffer
      ? sharp(bannerBuffer).resize(OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, {
          fit: 'cover',
          position: 'centre',
        })
      : sharp({
          create: {
            width: OG_IMAGE_WIDTH,
            height: OG_IMAGE_HEIGHT,
            channels: 3,
            background: primaryColor,
          },
        });

    return base.composite(composites).png().toBuffer();
  }

  private resolveAppOrigin(): string {
    return (
      this.configService.get<string>('PUBLIC_APP_ORIGIN')?.trim() ||
      this.configService.get<string>('FRONTEND_URL')?.trim() ||
      'https://boramarcar.com.br'
    );
  }

  private resolveApiOrigin(): string {
    return (
      this.configService.get<string>('PUBLIC_API_ORIGIN')?.trim() ||
      'https://api.boramarcar.com.br'
    );
  }
}

function pickContrastingTextColor(hex: string): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return '#ffffff';
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#111827' : '#ffffff';
}
