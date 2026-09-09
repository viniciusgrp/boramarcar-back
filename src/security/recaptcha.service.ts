import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RECAPTCHA_FAILED_MESSAGE } from './signup-security.messages';

interface RecaptchaSiteVerifyResponse {
  success?: boolean;
  score?: number;
  action?: string;
  'error-codes'?: string[];
}

const SITEVERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const DEFAULT_MIN_SCORE = 0.5;

@Injectable()
export class RecaptchaService {
  private readonly logger = new Logger(RecaptchaService.name);

  constructor(private readonly configService: ConfigService) {}

  async assertValidToken(params: {
    token: string | undefined;
    remoteIp?: string;
    expectedAction?: string;
  }): Promise<void> {
    const secret = this.configService.get<string>('RECAPTCHA_SECRET_KEY')?.trim();
    const token = params.token?.trim();

    if (!secret || !token) {
      throw new BadRequestException(RECAPTCHA_FAILED_MESSAGE);
    }

    const minScore = this.readMinScore();
    const body = new URLSearchParams({
      secret,
      response: token,
    });

    if (params.remoteIp) {
      body.set('remoteip', params.remoteIp);
    }

    let payload: RecaptchaSiteVerifyResponse;

    try {
      const response = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      payload = (await response.json()) as RecaptchaSiteVerifyResponse;
    } catch (error) {
      this.logger.warn(
        `reCAPTCHA siteverify failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new BadRequestException(RECAPTCHA_FAILED_MESSAGE);
    }

    if (!payload.success) {
      throw new BadRequestException(RECAPTCHA_FAILED_MESSAGE);
    }

    const score = typeof payload.score === 'number' ? payload.score : 0;

    if (score < minScore) {
      throw new BadRequestException(RECAPTCHA_FAILED_MESSAGE);
    }

    if (
      params.expectedAction &&
      payload.action &&
      payload.action !== params.expectedAction
    ) {
      throw new BadRequestException(RECAPTCHA_FAILED_MESSAGE);
    }
  }

  private readMinScore(): number {
    const raw = this.configService.get<string>('RECAPTCHA_MIN_SCORE')?.trim();

    if (!raw) {
      return DEFAULT_MIN_SCORE;
    }

    const parsed = Number.parseFloat(raw);

    if (Number.isNaN(parsed)) {
      return DEFAULT_MIN_SCORE;
    }

    return Math.min(1, Math.max(0, parsed));
  }
}
