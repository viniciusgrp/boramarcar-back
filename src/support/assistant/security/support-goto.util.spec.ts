import { filterSupportAssistantOutput } from './support-output-filter.util';
import { sanitizeSupportGotoMarkers } from './support-goto.util';

describe('sanitizeSupportGotoMarkers', () => {
  it('keeps allowlisted GOTO markers and normalizes label', () => {
    const result = sanitizeSupportGotoMarkers(
      'Cadastre em Serviços.\n[GOTO:/admin/servicos|Abrir Serviços]',
    );
    expect(result.content).toContain('[GOTO:/admin/servicos|Abrir Serviços]');
    expect(result.removedInvalid).toBe(0);
  });

  it('strips paths outside allowlist and external-looking paths', () => {
    const result = sanitizeSupportGotoMarkers(
      'Ok\n[GOTO:/admin/servicos|Serviços]\n[GOTO:https://evil.com|Hack]\n[GOTO:/admin/../secret|X]',
    );
    expect(result.content).toContain('[GOTO:/admin/servicos|Serviços]');
    expect(result.content).not.toContain('evil');
    expect(result.content).not.toContain('/secret');
    expect(result.removedInvalid).toBeGreaterThan(0);
  });

  it('limits to 3 GOTO markers', () => {
    const result = sanitizeSupportGotoMarkers(
      [
        '[GOTO:/admin/servicos|A]',
        '[GOTO:/admin/agenda|B]',
        '[GOTO:/admin/equipe|C]',
        '[GOTO:/admin/fidelidade|D]',
      ].join('\n'),
    );
    const matches = result.content.match(/\[GOTO:/g) ?? [];
    expect(matches).toHaveLength(3);
    expect(result.removedInvalid).toBe(1);
  });
});

describe('filterSupportAssistantOutput + GOTO', () => {
  it('preserves valid GOTO after output filter', () => {
    const result = filterSupportAssistantOutput(
      'Veja em Configurações.\n[GOTO:/admin/configuracoes|Abrir Configurações]',
    );
    expect(result.content).toContain(
      '[GOTO:/admin/configuracoes|Abrir Configurações]',
    );
  });
});
