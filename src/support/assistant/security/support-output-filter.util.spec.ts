import { filterSupportAssistantOutput } from './support-output-filter.util';

describe('filterSupportAssistantOutput', () => {
  it('redacts secrets from assistant output', () => {
    const result = filterSupportAssistantOutput(
      'Use esta chave sk_test_abcdefghijklmnopqrstuvwxyz',
    );
    expect(result.content).toContain('[redigido]');
    expect(result.flagged).toBe(true);
  });

  it('replaces risky financial policy wording', () => {
    const result = filterSupportAssistantOutput(
      'A política oficial é reembolso garantido em todos os casos.',
    );
    expect(result.content).toContain('atendimento humano');
    expect(result.flags).toContain('financial_policy_heuristic');
  });
});
