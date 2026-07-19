import { redactSecrets } from './support-secret-patterns.util';
import { sanitizeSupportGotoMarkers } from './support-goto.util';
import { extractSupportActionPropose } from '../actions/support-action-sanitize.util';

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

  const gotoSanitized = sanitizeSupportGotoMarkers(content);
  content = gotoSanitized.content;
  if (gotoSanitized.removedInvalid > 0) {
    flags.push('invalid_goto_stripped');
  }

  // Keep at most one valid ACTION_PROPOSE marker for the enrich step.
  const actionProbe = extractSupportActionPropose(content);
  if (actionProbe.removedInvalid > 0) {
    flags.push('invalid_action_stripped');
  }
  if (actionProbe.action) {
    content = `${actionProbe.displayContent}\n\n[ACTION_PROPOSE:${actionProbe.action.type}|${JSON.stringify(actionProbe.action.payload)}]`.trim();
  } else {
    content = actionProbe.displayContent;
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
