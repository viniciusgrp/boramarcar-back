import { containsBlockedSecretDump } from './support-secret-patterns.util';

export interface SanitizeSupportInputResult {
  sanitized: string;
  blocked: boolean;
  reason?: string;
}

export function sanitizeSupportUserInput(
  raw: string,
  maxLength: number,
): SanitizeSupportInputResult {
  const withoutControlChars = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  const normalizedWhitespace = withoutControlChars.replace(/\s+/g, ' ').trim();

  if (!normalizedWhitespace) {
    return {
      sanitized: '',
      blocked: true,
      reason: 'Informe sua mensagem.',
    };
  }

  if (normalizedWhitespace.length > maxLength) {
    return {
      sanitized: normalizedWhitespace.slice(0, maxLength),
      blocked: true,
      reason: `A mensagem pode ter no máximo ${maxLength} caracteres.`,
    };
  }

  if (containsBlockedSecretDump(normalizedWhitespace)) {
    return {
      sanitized: normalizedWhitespace,
      blocked: true,
      reason:
        'Detectamos conteúdo sensível na mensagem. Use o atendimento humano para compartilhar dados privados.',
    };
  }

  return {
    sanitized: normalizedWhitespace,
    blocked: false,
  };
}
