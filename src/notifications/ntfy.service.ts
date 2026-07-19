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

    await this.publish({
      topic,
      server,
      title: 'Novo estabelecimento',
      priority: '4',
      tags: 'office,tada',
      body: lines.join('\n'),
    });
  }

  async notifySupportNeedsHuman(payload: {
    tenantName: string;
    tenantId: string;
    userRole: string;
    userEmail?: string;
    question: string;
  }): Promise<void> {
    const topic = this.configService.get<string>('NTFY_TOPIC')?.trim();

    if (!topic) {
      return;
    }

    const server = (
      this.configService.get<string>('NTFY_SERVER')?.trim() || 'https://ntfy.sh'
    ).replace(/\/$/, '');

    const lines = [
      `Estabelecimento: ${payload.tenantName}`,
      `Tenant ID: ${payload.tenantId}`,
      `Função: ${payload.userRole}`,
    ];

    if (payload.userEmail) {
      lines.push(`E-mail: ${payload.userEmail}`);
    }

    lines.push('', `Pergunta: ${payload.question}`);

    await this.publish({
      topic,
      server,
      title: 'Suporte IA: precisa de humano',
      priority: '4',
      tags: 'warning,speech_balloon',
      body: lines.join('\n'),
    });
  }

  private async publish(params: {
    topic: string;
    server: string;
    title: string;
    priority: string;
    tags: string;
    body: string;
  }): Promise<void> {
    try {
      const response = await fetch(`${params.server}/${params.topic}`, {
        method: 'POST',
        headers: {
          Title: params.title,
          Priority: params.priority,
          Tags: params.tags,
        },
        body: params.body,
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
