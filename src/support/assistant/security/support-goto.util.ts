/**
 * Deep links seguros do assistente: só rotas internas /admin allowlisted.
 * Formato no texto da IA: [GOTO:/admin/servicos|Abrir Serviços]
 */

/** Captura qualquer marcador GOTO; a validação da rota é allowlisted depois. */
export const SUPPORT_GOTO_MARKER_REGEX =
  /\[GOTO:([^\|\]]+)(?:\|([^\]]{0,80}))?\]/gi;

export const SUPPORT_ASSISTANT_ALLOWED_GOTO_PATHS = [
  '/admin/dashboard',
  '/admin/agenda',
  '/admin/clientes',
  '/admin/servicos',
  '/admin/equipe',
  '/admin/configuracoes',
  '/admin/meu-perfil',
  '/admin/faturamento',
  '/admin/financeiro',
  '/admin/financas',
  '/admin/financas/despesas-fixas',
  '/admin/comissoes',
  '/admin/fidelidade',
  '/admin/cupons',
  '/admin/suporte',
  '/admin/recebimentos',
] as const;

export type SupportAssistantAllowedGotoPath =
  (typeof SUPPORT_ASSISTANT_ALLOWED_GOTO_PATHS)[number];

const DEFAULT_LABELS: Record<string, string> = {
  '/admin/dashboard': 'Abrir Início',
  '/admin/agenda': 'Abrir Agenda',
  '/admin/clientes': 'Abrir Clientes',
  '/admin/servicos': 'Abrir Serviços',
  '/admin/equipe': 'Abrir Equipe',
  '/admin/configuracoes': 'Abrir Configurações',
  '/admin/meu-perfil': 'Abrir Meu perfil',
  '/admin/faturamento': 'Abrir Meu plano',
  '/admin/financeiro': 'Abrir Financeiro',
  '/admin/financas': 'Abrir Fluxo de Caixa',
  '/admin/financas/despesas-fixas': 'Abrir Despesas fixas',
  '/admin/comissoes': 'Abrir Minhas Comissões',
  '/admin/fidelidade': 'Abrir Fidelidade',
  '/admin/cupons': 'Abrir Cupons',
  '/admin/suporte': 'Abrir Suporte',
  '/admin/recebimentos': 'Abrir Recebimentos',
};

const MAX_GOTO_PER_MESSAGE = 3;

export function normalizeSupportGotoPath(rawPath: string): string | null {
  const trimmed = rawPath.trim();
  if (!trimmed.startsWith('/admin/')) {
    return null;
  }
  if (
    trimmed.includes('..') ||
    trimmed.includes('://') ||
    trimmed.includes('?') ||
    trimmed.includes('#')
  ) {
    return null;
  }
  if (!/^\/admin\/[a-z0-9\-_]+(?:\/[a-z0-9\-_]+)*$/.test(trimmed)) {
    return null;
  }
  return trimmed.replace(/\/+$/, '') || null;
}

export function isAllowedSupportGotoPath(path: string): boolean {
  return (SUPPORT_ASSISTANT_ALLOWED_GOTO_PATHS as readonly string[]).includes(
    path,
  );
}

export function defaultSupportGotoLabel(path: string): string {
  return DEFAULT_LABELS[path] ?? 'Abrir tela';
}

/**
 * Remove GOTOs inválidos (fora da allowlist) e limita quantidade.
 * Mantém os válidos no texto para o front renderizar botões.
 */
export function sanitizeSupportGotoMarkers(content: string): {
  content: string;
  removedInvalid: number;
} {
  let removedInvalid = 0;
  let kept = 0;

  const contentWithoutMarkers = content.replace(
    SUPPORT_GOTO_MARKER_REGEX,
    (_full, rawPath: string, rawLabel?: string) => {
      const path = normalizeSupportGotoPath(rawPath);
      if (!path || !isAllowedSupportGotoPath(path)) {
        removedInvalid += 1;
        return '';
      }
      if (kept >= MAX_GOTO_PER_MESSAGE) {
        removedInvalid += 1;
        return '';
      }
      kept += 1;
      const label = (rawLabel?.trim() || defaultSupportGotoLabel(path)).slice(
        0,
        60,
      );
      return `[GOTO:${path}|${label}]`;
    },
  );

  return {
    content: contentWithoutMarkers.replace(/\n{3,}/g, '\n\n').trim(),
    removedInvalid,
  };
}

/** Lista compacta para o system prompt. */
export function formatAllowedGotoPathsForPrompt(): string {
  return SUPPORT_ASSISTANT_ALLOWED_GOTO_PATHS.map(
    (path) => `- ${path} (${defaultSupportGotoLabel(path)})`,
  ).join('\n');
}
