import {
  detectAndStripNeedsHumanMarker,
  SUPPORT_NEEDS_HUMAN_MARKER,
} from './support-needs-human.util';

describe('detectAndStripNeedsHumanMarker', () => {
  it('detects explicit marker and strips it', () => {
    const result = detectAndStripNeedsHumanMarker(
      `Não tenho essa informação na base.\n${SUPPORT_NEEDS_HUMAN_MARKER}`,
    );
    expect(result.needsHuman).toBe(true);
    expect(result.content).not.toContain(SUPPORT_NEEDS_HUMAN_MARKER);
    expect(result.content).toContain('Não tenho essa informação');
  });

  it('detects heuristic phrases without marker', () => {
    const result = detectAndStripNeedsHumanMarker(
      'Não tenho certeza sobre esse caso. Prefira o atendimento humano.',
    );
    expect(result.needsHuman).toBe(true);
  });

  it('returns false for confident answers', () => {
    const result = detectAndStripNeedsHumanMarker(
      'Para cadastrar um serviço, abra Serviços no menu e clique em Novo.',
    );
    expect(result.needsHuman).toBe(false);
  });
});
