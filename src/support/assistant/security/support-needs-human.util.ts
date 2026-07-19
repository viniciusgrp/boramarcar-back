export const SUPPORT_NEEDS_HUMAN_MARKER = '[NEEDS_HUMAN]';

const NEEDS_HUMAN_PHRASES = [
  'não tenho certeza',
  'nao tenho certeza',
  'não sei responder',
  'nao sei responder',
  'não consigo confirmar',
  'nao consigo confirmar',
  'fora do que sei',
  'atendimento humano',
  'falar com nossa equipe',
  'falar com a equipe',
  'nossa equipe pode',
  'não está na documentação',
  'nao esta na documentacao',
  'não encontrei essa informação',
  'nao encontrei essa informacao',
] as const;

export interface NeedsHumanDetectionResult {
  content: string;
  needsHuman: boolean;
}

export function detectAndStripNeedsHumanMarker(
  rawContent: string,
): NeedsHumanDetectionResult {
  const hasMarker = rawContent.includes(SUPPORT_NEEDS_HUMAN_MARKER);
  const content = rawContent
    .split(SUPPORT_NEEDS_HUMAN_MARKER)
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const lower = content.toLowerCase();
  const hasPhrase = NEEDS_HUMAN_PHRASES.some((phrase) =>
    lower.includes(phrase),
  );

  return {
    content,
    needsHuman: hasMarker || hasPhrase,
  };
}
