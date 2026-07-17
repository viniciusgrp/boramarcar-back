import { redactSecrets } from './support-secret-patterns.util';

const FINANCIAL_POLICY_MARKERS = [
  'reembolso garantido',
  'sempre devolvemos',
  'nunca cobramos',
  'política oficial é',
] as const;

export interface FilterSupportOutputResult {
  content: string;
  flagged: boolean;
  flags: string[];
}

export function filterSupportAssistantOutput(raw: string): FilterSupportOutputResult {
  const flags: string[] = [];
  let content = raw.trim();

  if (!content) {
    return {
      content:
        'Não consegui formular uma resposta segura. Você pode falar com nossa equipe pelo botão de atendimento humano.',
      flagged: true,
      flags: ['empty_response'],
    };
  }

  const redacted = redactSecrets(content);
  if (redacted !== content) {
    flags.push('secrets_redacted');
    content = redacted;
  }

  const lower = content.toLowerCase();
  if (FINANCIAL_POLICY_MARKERS.some((marker) => lower.includes(marker))) {
    flags.push('financial_policy_heuristic');
    content =
      'Para dúvidas sobre sinal, estorno ou cobrança, nossa equipe pode confirmar o caso específico. Use o atendimento humano com os detalhes do agendamento.';
  }

  const maxLength = 4000;
  if (content.length > maxLength) {
    content = `${content.slice(0, maxLength - 1)}…`;
    flags.push('truncated');
  }

  return {
    content,
    flagged: flags.length > 0,
    flags,
  };
}
