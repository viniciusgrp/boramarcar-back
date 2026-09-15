import type { ConfigService } from '@nestjs/config';
import { RecaptchaService } from './recaptcha.service';
import { RECAPTCHA_FAILED_MESSAGE } from './signup-security.messages';

function buildService(env: Record<string, string | undefined>) {
  const configService = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;

  return new RecaptchaService(configService);
}

describe('RecaptchaService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('skips verification in development and HML', async () => {
    const development = buildService({ APP_ENV: 'development' });
    const hml = buildService({
      APP_ENV: 'hml',
      RECAPTCHA_SECRET_KEY: 'secret',
    });

    await expect(development.assertValidToken({ token: undefined })).resolves.toBeUndefined();
    await expect(hml.assertValidToken({ token: '   ' })).resolves.toBeUndefined();
    await expect(buildService({}).assertValidToken({ token: undefined })).resolves.toBeUndefined();
  });

  it('rejects when production is missing the secret or token', async () => {
    const withoutSecret = buildService({ APP_ENV: 'production' });
    const withoutToken = buildService({
      APP_ENV: 'production',
      RECAPTCHA_SECRET_KEY: 'secret',
    });

    await expect(
      withoutSecret.assertValidToken({ token: 'abc' }),
    ).rejects.toMatchObject({ message: RECAPTCHA_FAILED_MESSAGE });

    await expect(
      withoutToken.assertValidToken({ token: '   ' }),
    ).rejects.toMatchObject({ message: RECAPTCHA_FAILED_MESSAGE });
  });

  it('rejects a low score', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ success: true, score: 0.1, action: 'tenant_register' }),
    }) as unknown as typeof fetch;

    const service = buildService({
      APP_ENV: 'production',
      RECAPTCHA_SECRET_KEY: 'secret',
      RECAPTCHA_MIN_SCORE: '0.5',
    });

    await expect(
      service.assertValidToken({
        token: 'token',
        expectedAction: 'tenant_register',
      }),
    ).rejects.toMatchObject({ message: RECAPTCHA_FAILED_MESSAGE });
  });

  it('rejects an invalid token from siteverify', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
    }) as unknown as typeof fetch;

    const service = buildService({
      APP_ENV: 'production',
      RECAPTCHA_SECRET_KEY: 'secret',
    });

    await expect(
      service.assertValidToken({ token: 'bad' }),
    ).rejects.toMatchObject({ message: RECAPTCHA_FAILED_MESSAGE });
  });

  it('accepts a valid high-score token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      json: async () => ({ success: true, score: 0.9, action: 'tenant_register' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = buildService({
      APP_ENV: 'production',
      RECAPTCHA_SECRET_KEY: 'secret',
    });

    await expect(
      service.assertValidToken({
        token: 'ok-token',
        remoteIp: '203.0.113.10',
        expectedAction: 'tenant_register',
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalled();
  });

  it('rejects when siteverify is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;

    const service = buildService({
      APP_ENV: 'production',
      RECAPTCHA_SECRET_KEY: 'secret',
    });

    await expect(
      service.assertValidToken({ token: 'ok-token' }),
    ).rejects.toMatchObject({ message: RECAPTCHA_FAILED_MESSAGE });
  });
});
