import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AsaasClient } from './asaas.client';

describe('AsaasClient API URL', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  it('fails at startup in production when ASAAS_API_URL is missing', () => {
    process.env.NODE_ENV = 'production';
    const client = new AsaasClient({
      get: (key: string) => (key === 'APP_ENV' ? 'development' : undefined),
    } as unknown as ConfigService);

    expect(() => client.onModuleInit()).toThrow(/ASAAS_API_URL is required/);
  });

  it('warns once outside production and keeps the sandbox default', () => {
    process.env.NODE_ENV = 'test';
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const client = new AsaasClient({
      get: () => undefined,
    } as unknown as ConfigService);

    expect(() => client.onModuleInit()).not.toThrow();
    client.onModuleInit();

    const sandboxWarnings = warn.mock.calls.filter((call) =>
      String(call[0]).includes('api-sandbox.asaas.com'),
    );
    expect(sandboxWarnings).toHaveLength(1);
  });
});
