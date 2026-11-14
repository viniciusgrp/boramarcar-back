import { InternalServerErrorException } from '@nestjs/common';
import {
  ASAAS_SANDBOX_API_URL,
  resolveAsaasApiBaseUrl,
  type AsaasApiUrlWarnings,
} from './asaas-api-url.util';

function warnings(): AsaasApiUrlWarnings {
  return { missingUrl: false, sandboxInProduction: false };
}

describe('resolveAsaasApiBaseUrl', () => {
  it('fails in production when ASAAS_API_URL is missing', () => {
    const warn = jest.fn();

    expect(() =>
      resolveAsaasApiBaseUrl({
        configured: '  ',
        nodeEnv: 'production',
        appEnv: 'development',
        warnings: warnings(),
        warn,
      }),
    ).toThrow(InternalServerErrorException);

    expect(() =>
      resolveAsaasApiBaseUrl({
        configured: undefined,
        nodeEnv: 'development',
        appEnv: 'production',
        warnings: warnings(),
        warn,
      }),
    ).toThrow(/ASAAS_API_URL is required/);

    expect(warn).not.toHaveBeenCalled();
  });

  it('uses the sandbox outside production and warns once', () => {
    const warn = jest.fn();
    const state = warnings();

    expect(
      resolveAsaasApiBaseUrl({
        configured: '',
        nodeEnv: 'development',
        appEnv: 'hml',
        warnings: state,
        warn,
      }),
    ).toBe(ASAAS_SANDBOX_API_URL);

    expect(
      resolveAsaasApiBaseUrl({
        configured: undefined,
        nodeEnv: 'test',
        appEnv: 'development',
        warnings: state,
        warn,
      }),
    ).toBe(ASAAS_SANDBOX_API_URL);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(ASAAS_SANDBOX_API_URL),
    );
  });

  it('warns once when production points at a sandbox URL', () => {
    const warn = jest.fn();
    const state = warnings();
    const sandbox = 'https://api-sandbox.asaas.com/v3/';

    expect(
      resolveAsaasApiBaseUrl({
        configured: sandbox,
        nodeEnv: 'production',
        appEnv: 'production',
        warnings: state,
        warn,
      }),
    ).toBe('https://api-sandbox.asaas.com/v3');

    expect(
      resolveAsaasApiBaseUrl({
        configured: sandbox,
        nodeEnv: 'production',
        appEnv: 'production',
        warnings: state,
        warn,
      }),
    ).toBe('https://api-sandbox.asaas.com/v3');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('sandbox'));
  });

  it('keeps an explicit production URL without a warning', () => {
    const warn = jest.fn();

    expect(
      resolveAsaasApiBaseUrl({
        configured: 'https://api.asaas.com/v3/',
        nodeEnv: 'production',
        appEnv: 'production',
        warnings: warnings(),
        warn,
      }),
    ).toBe('https://api.asaas.com/v3');

    expect(warn).not.toHaveBeenCalled();
  });
});
