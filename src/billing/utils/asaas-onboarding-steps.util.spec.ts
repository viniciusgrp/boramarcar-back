import { buildAsaasOnboardingSteps } from './asaas-onboarding-steps.util';

describe('asaas onboarding steps', () => {
  it('puts the action only on the next pending step', () => {
    const result = buildAsaasOnboardingSteps({
      hasAccount: true,
      commercialInfo: 'APPROVED',
      bankAccountInfo: 'APPROVED',
      documentation: 'PENDING',
      general: 'PENDING',
    });

    expect(result.title).toBe('Falta pouco para receber pagamentos online');
    expect(result.steps.map((step) => step.actionLabel)).toEqual([
      null,
      null,
      'Enviar documentos',
      null,
    ]);
    expect(result.steps[2]?.statusLabel).toBe('Pendente');
  });

  it('marks a step under review without an action button', () => {
    const result = buildAsaasOnboardingSteps({
      hasAccount: true,
      commercialInfo: 'APPROVED',
      bankAccountInfo: 'AWAITING_APPROVAL',
      documentation: 'PENDING',
      general: 'PENDING',
    });

    expect(result.steps[1]?.statusLabel).toBe('Em análise');
    expect(result.steps[1]?.actionLabel).toBeNull();
    expect(result.steps[2]?.actionLabel).toBe('Enviar documentos');
  });

  it('uses a ready title when every step is approved', () => {
    const result = buildAsaasOnboardingSteps({
      hasAccount: true,
      commercialInfo: 'APPROVED',
      bankAccountInfo: 'APPROVED',
      documentation: 'APPROVED',
      general: 'APPROVED',
    });

    expect(result.title).toBe('Pronta para receber pagamentos online');
    expect(result.steps.every((step) => step.actionLabel === null)).toBe(true);
  });
});
