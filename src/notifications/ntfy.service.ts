import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NewTenantNotifyPayload {
  name: string;
  slug: string;
  ownerEmail?: string;
}

@Injectable()
export class NtfyService {
  private readonly logger = new Logger(NtfyService.name);

  constructor(private readonly configService: ConfigService) {}

  async notifyNewTenant(payload: NewTenantNotifyPayload): Promise<void> {
    const topic = this.configService.get<string>('NTFY_TOPIC')?.trim();

    if (!topic) {
      return;
    }

    const server = (
      this.configService.get<string>('NTFY_SERVER')?.trim() || 'https://ntfy.sh'
    ).replace(/\/$/, '');

    const lines = [
      `Nome: ${payload.name}`,
      `Slug: ${payload.slug}`,
    ];

    if (payload.ownerEmail) {
      lines.push(`E-mail: ${payload.ownerEmail}`);
    }

    try {
      const response = await fetch(`${server}/${topic}`, {
        method: 'POST',
        headers: {
          Title: 'Novo estabelecimento',
          Priority: '4',
          Tags: 'office,tada',
        },
        body: lines.join('\n'),
      });

      if (!response.ok) {
        this.logger.warn(
          `ntfy notify failed: HTTP ${response.status} ${response.statusText}`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'erro desconhecido';
      this.logger.warn(`ntfy notify failed: ${message}`);
    }
  }
}
