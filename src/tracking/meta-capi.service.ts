import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';

export interface MetaCapiUserData {
  email?: string;
  phone?: string;
  externalId?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  fbp?: string;
  fbc?: string;
}

export interface MetaCapiEventPayload {
  eventName: string;
  eventTime: number;
  eventSourceUrl: string;
  eventId?: string;
  userData: MetaCapiUserData;
  customData?: Record<string, unknown>;
}

@Injectable()
export class MetaCapiService {
  private readonly logger = new Logger(MetaCapiService.name);
  private readonly pixelId: string | undefined;
  private readonly accessToken: string | undefined;
  private readonly testEventCode: string | undefined;
  private configLoggedOnce = false;

  constructor(private readonly configService: ConfigService) {
    this.pixelId = this.configService.get<string>('META_PIXEL_ID')?.trim();
    this.accessToken = this.configService
      .get<string>('META_CAPI_ACCESS_TOKEN')
      ?.trim();
    this.testEventCode = this.configService
      .get<string>('META_CAPI_TEST_EVENT_CODE')
      ?.trim();
  }

  private isConfigured(): boolean {
    return Boolean(this.pixelId && this.accessToken);
  }

  private logConfigSkipOnce(): void {
    if (!this.configLoggedOnce) {
      this.configLoggedOnce = true;
      this.logger.log(
        'Meta Conversions API not configured (META_PIXEL_ID or META_CAPI_ACCESS_TOKEN missing), skipping events.',
      );
    }
  }

  private hashSha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('55')) {
      return digits;
    }
    return `55${digits}`;
  }

  buildFbc(fbclid: string, firstVisitAt?: string): string | undefined {
    if (!fbclid) {
      return undefined;
    }

    const timestamp = firstVisitAt
      ? new Date(firstVisitAt).getTime()
      : Date.now();

    return `fb.1.${timestamp}.${fbclid}`;
  }

  private buildEventPayload(payload: MetaCapiEventPayload): Record<string, unknown> {
    const userData: Record<string, string> = {};

    if (payload.userData.email) {
      userData.em = this.hashSha256(
        this.normalizeEmail(payload.userData.email),
      );
    }

    if (payload.userData.phone) {
      userData.ph = this.hashSha256(
        this.normalizePhone(payload.userData.phone),
      );
    }

    if (payload.userData.externalId) {
      userData.external_id = this.hashSha256(payload.userData.externalId);
    }

    if (payload.userData.clientIpAddress) {
      userData.client_ip_address = payload.userData.clientIpAddress;
    }

    if (payload.userData.clientUserAgent) {
      userData.client_user_agent = payload.userData.clientUserAgent;
    }

    if (payload.userData.fbp) {
      userData.fbp = payload.userData.fbp;
    }

    if (payload.userData.fbc) {
      userData.fbc = payload.userData.fbc;
    }

    const event: Record<string, unknown> = {
      event_name: payload.eventName,
      event_time: payload.eventTime,
      action_source: 'website',
      event_source_url: payload.eventSourceUrl,
      event_id: payload.eventId || randomUUID(),
      user_data: userData,
    };

    if (payload.customData) {
      event.custom_data = payload.customData;
    }

    return event;
  }

  async sendEvent(payload: MetaCapiEventPayload): Promise<void> {
    if (!this.isConfigured()) {
      this.logConfigSkipOnce();
      return;
    }

    const event = this.buildEventPayload(payload);
    const body: Record<string, unknown> = {
      data: [event],
    };

    if (this.testEventCode) {
      body.test_event_code = this.testEventCode;
    }

    const url = `https://graph.facebook.com/v21.0/${this.pixelId}/events?access_token=${this.accessToken}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text();
        this.logger.warn(
          `Meta CAPI event failed with status ${response.status}: ${text}`,
        );
      } else {
        this.logger.debug(
          `Meta CAPI ${payload.eventName} event sent successfully`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Meta CAPI event error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async sendCompleteRegistration(params: {
    email: string;
    userId: string;
    clientIpAddress?: string;
    clientUserAgent?: string;
    eventSourceUrl?: string;
    eventId?: string;
    fbp?: string;
    fbc?: string;
    fbclid?: string;
    firstVisitAt?: string;
  }): Promise<void> {
    let fbc = params.fbc;

    if (!fbc && params.fbclid) {
      fbc = this.buildFbc(params.fbclid, params.firstVisitAt);
    }

    await this.sendEvent({
      eventName: 'CompleteRegistration',
      eventTime: Math.floor(Date.now() / 1000),
      eventSourceUrl:
        params.eventSourceUrl || 'https://horariocerto.app/register',
      eventId: params.eventId,
      userData: {
        email: params.email,
        externalId: params.userId,
        clientIpAddress: params.clientIpAddress,
        clientUserAgent: params.clientUserAgent,
        fbp: params.fbp,
        fbc,
      },
      customData: {
        currency: 'BRL',
        value: 0,
      },
    });
  }
}
