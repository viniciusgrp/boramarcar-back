import type { AsaasErrorBody } from './asaas.types';

export class AsaasHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly body: AsaasErrorBody | null,
    message: string,
  ) {
    super(message);
    this.name = 'AsaasHttpError';
  }
}

export function extractAsaasErrorMessage(body: unknown): string {
  if (!body || typeof body !== 'object') {
    return 'Falha na comunicação com o Asaas.';
  }

  const errors = (body as AsaasErrorBody).errors;

  if (!Array.isArray(errors) || errors.length === 0) {
    return 'Falha na comunicação com o Asaas.';
  }

  return errors
    .map((item) => item.description?.trim())
    .filter((item): item is string => Boolean(item))
    .join(' ');
}

export function isAsaasDuplicateAccountError(error: AsaasHttpError): boolean {
  const haystack = `${error.message} ${JSON.stringify(error.body ?? {})}`.toLowerCase();

  return (
    haystack.includes('já existe') ||
    haystack.includes('already exists') ||
    haystack.includes('e-mail') ||
    haystack.includes('email') ||
    haystack.includes('cpf') ||
    haystack.includes('cnpj')
  );
}
