import { InternalServerErrorException } from '@nestjs/common';
import { isProductionAppEnv } from '../common/app-env.util';

export const ASAAS_SANDBOX_API_URL = 'https://api-sandbox.asaas.com/v3';

export interface AsaasApiUrlWarnings {
  missingUrl: boolean;
  sandboxInProduction: boolean;
}

export function isAsaasSandboxUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes('sandbox');
  } catch {
    return url.toLowerCase().includes('sandbox');
  }
}

export function isAsaasProductionRuntime(
  nodeEnv?: string | null,
  appEnv?: string | null,
): boolean {
  return (
    nodeEnv?.trim().toLowerCase() === 'production' || isProductionAppEnv(appEnv)
  );
}

export function resolveAsaasApiBaseUrl(params: {
  configured: string | null | undefined;
  nodeEnv?: string | null;
  appEnv?: string | null;
  warnings: AsaasApiUrlWarnings;
  warn: (message: string) => void;
}): string {
  const configured = params.configured?.trim() ?? '';
  const production = isAsaasProductionRuntime(params.nodeEnv, params.appEnv);

  if (!configured) {
    if (production) {
      throw new InternalServerErrorException(
        'ASAAS_API_URL is required when NODE_ENV or APP_ENV is production. Set the Asaas API base URL explicitly.',
      );
    }

    if (!params.warnings.missingUrl) {
      params.warnings.missingUrl = true;
      params.warn(
        `ASAAS_API_URL is not set. Using the Asaas sandbox (${ASAAS_SANDBOX_API_URL}). Set ASAAS_API_URL to choose the API explicitly.`,
      );
    }

    return ASAAS_SANDBOX_API_URL;
  }

  const base = configured.replace(/\/$/, '');

  if (
    production &&
    isAsaasSandboxUrl(base) &&
    !params.warnings.sandboxInProduction
  ) {
    params.warnings.sandboxInProduction = true;
    params.warn(
      `ASAAS_API_URL points at the Asaas sandbox (${base}) while NODE_ENV or APP_ENV is production.`,
    );
  }

  return base;
}
