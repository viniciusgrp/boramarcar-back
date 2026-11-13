import {
  ASAAS_CHECKOUT_ITEM_DESCRIPTION_MAX_LENGTH,
  ASAAS_CHECKOUT_ITEM_NAME_MAX_LENGTH,
  buildDepositCheckoutItemCopy,
  DEPOSIT_CHECKOUT_ITEM_DESCRIPTION_LEAD,
  limitAsaasCheckoutItemName,
} from './asaas-checkout-item.util';

const EN_OR_EM_DASH = /[–—]/;

describe('asaas-checkout-item.util', () => {
  it('keeps a short tenant name in the checkout item name', () => {
    const copy = buildDepositCheckoutItemCopy('Studio');

    expect(copy.name).toBe('Sinal: Studio');
    expect(copy.name.length).toBeLessThanOrEqual(
      ASAAS_CHECKOUT_ITEM_NAME_MAX_LENGTH,
    );
    expect(copy.description).toBe(
      `${DEPOSIT_CHECKOUT_ITEM_DESCRIPTION_LEAD}. Studio`,
    );
    expect(copy.name).not.toMatch(EN_OR_EM_DASH);
    expect(copy.description).not.toMatch(EN_OR_EM_DASH);
  });

  it('truncates a tenant name that would make the item name longer than 30 characters', () => {
    const tenantName = 'Teste Webhook2 Asaas HML';

    expect(`Sinal: ${tenantName}`).toHaveLength(31);

    const copy = buildDepositCheckoutItemCopy(tenantName);

    expect(copy.name).toBe('Sinal: Teste Webhook2 Asaas HM');
    expect(copy.name).toHaveLength(ASAAS_CHECKOUT_ITEM_NAME_MAX_LENGTH);
    expect(copy.name.endsWith('…')).toBe(false);
    expect(copy.name.endsWith(' ')).toBe(false);
    expect(copy.name).not.toMatch(EN_OR_EM_DASH);
    expect(copy.description).toBe(
      `${DEPOSIT_CHECKOUT_ITEM_DESCRIPTION_LEAD}. ${tenantName}`,
    );
    expect(copy.description).toContain(tenantName);
    expect(copy.description.length).toBeLessThanOrEqual(
      ASAAS_CHECKOUT_ITEM_DESCRIPTION_MAX_LENGTH,
    );
  });

  it('trims trailing spaces on the tenant name before measuring it', () => {
    const copy = buildDepositCheckoutItemCopy('  Studio   ');

    expect(copy.name).toBe('Sinal: Studio');
    expect(copy.description).toContain('Studio');
    expect(copy.description.endsWith(' ')).toBe(false);
  });

  it('trims the space left by truncation and adds an ellipsis only when it fits', () => {
    const tenantName = `${'A'.repeat(20)}   MORE`;
    const name = limitAsaasCheckoutItemName('Sinal: ', tenantName);

    expect(name).toBe(`Sinal: ${'A'.repeat(20)}…`);
    expect(name.length).toBeLessThanOrEqual(
      ASAAS_CHECKOUT_ITEM_NAME_MAX_LENGTH,
    );
    expect(name.endsWith(' …')).toBe(false);
  });

  it('does not add an ellipsis when the cut leaves no spare character', () => {
    const tenantName = 'A'.repeat(40);
    const name = limitAsaasCheckoutItemName('Sinal: ', tenantName);

    expect(name).toBe(`Sinal: ${'A'.repeat(23)}`);
    expect(name).toHaveLength(ASAAS_CHECKOUT_ITEM_NAME_MAX_LENGTH);
    expect(name.endsWith('…')).toBe(false);
  });

  it('keeps the full tenant name in the description when the lead would overflow it', () => {
    const tenantName = 'N'.repeat(120);
    const copy = buildDepositCheckoutItemCopy(tenantName);

    expect(copy.name.length).toBeLessThanOrEqual(
      ASAAS_CHECKOUT_ITEM_NAME_MAX_LENGTH,
    );
    expect(copy.description).toBe(tenantName);
    expect(copy.description.length).toBeLessThanOrEqual(
      ASAAS_CHECKOUT_ITEM_DESCRIPTION_MAX_LENGTH,
    );
  });

  it('caps a tenant name that is longer than the description field', () => {
    const tenantName = 'N'.repeat(180);
    const copy = buildDepositCheckoutItemCopy(tenantName);

    expect(copy.name.length).toBe(ASAAS_CHECKOUT_ITEM_NAME_MAX_LENGTH);
    expect(copy.description.length).toBe(
      ASAAS_CHECKOUT_ITEM_DESCRIPTION_MAX_LENGTH,
    );
    expect(copy.description.startsWith('N')).toBe(true);
    expect(copy.description).not.toMatch(EN_OR_EM_DASH);
  });
});
