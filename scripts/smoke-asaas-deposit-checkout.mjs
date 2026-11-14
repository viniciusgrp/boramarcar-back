/**
 * Smoke: create an Asaas sandbox checkout WITHOUT customerData (client sem CPF/endereço).
 * Usage:
 *   ASAAS_API_KEY=... ASAAS_API_URL=https://api-sandbox.asaas.com/v3 node scripts/smoke-asaas-deposit-checkout.mjs
 */
const apiKey = process.env.ASAAS_API_KEY?.trim();
const baseUrl = (
  process.env.ASAAS_API_URL?.trim() || 'https://api-sandbox.asaas.com/v3'
).replace(/\/$/, '');

if (!apiKey) {
  console.error('ASAAS_API_KEY is required');
  process.exit(2);
}

const body = {
  billingTypes: ['PIX', 'CREDIT_CARD'],
  chargeTypes: ['DETACHED'],
  minutesToExpire: 30,
  callback: {
    successUrl: 'https://example.com/ok',
    cancelUrl: 'https://example.com/cancel',
  },
  items: [
    {
      name: 'Sinal: Smoke QA',
      description: 'Pagamento antecipado smoke sem CPF',
      quantity: 1,
      value: 20,
      imageBase64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    },
  ],
  externalReference: `deposit-smoke:${Date.now()}`,
  // intentionally no customerData
};

const response = await fetch(`${baseUrl}/checkouts`, {
  method: 'POST',
  headers: {
    accept: 'application/json',
    'content-type': 'application/json',
    access_token: apiKey,
  },
  body: JSON.stringify(body),
});

const text = await response.text();
let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = { raw: text };
}

if (!response.ok) {
  console.error('FAIL', response.status, JSON.stringify(parsed, null, 2));
  process.exit(1);
}

const link = parsed?.link || parsed?.url || null;
console.log(
  JSON.stringify(
    {
      ok: true,
      id: parsed?.id ?? null,
      link,
      hasCustomerDataInRequest: false,
    },
    null,
    2,
  ),
);

if (!link) {
  process.exit(1);
}
