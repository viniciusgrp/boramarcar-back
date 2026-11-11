import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OnboardTenantDto } from './onboard-tenant.dto';
import { RegisterTenantDto } from './register-tenant.dto';

const baseRegisterBody = {
  owner_name: 'Maria Silva',
  email: 'maria@gmail.com',
  password: 'senha123',
  tenant_name: 'Studio Maria',
  slug: 'studio-maria',
};

const baseOnboardBody = {
  owner_name: 'Maria Silva',
  tenant_name: 'Studio Maria',
  slug: 'studio-maria',
};

async function validateRegister(body: Record<string, unknown>) {
  const dto = plainToInstance(RegisterTenantDto, body);
  return { dto, errors: await validate(dto) };
}

async function validateOnboard(body: Record<string, unknown>) {
  const dto = plainToInstance(OnboardTenantDto, body);
  return { dto, errors: await validate(dto) };
}

describe('RegisterTenantDto / OnboardTenantDto marketing fields', () => {
  it('accepts an organic signup body without marketing fields', async () => {
    const { dto, errors } = await validateRegister({
      ...baseRegisterBody,
      event_id: 'evt-organic-1',
    });

    expect(errors).toEqual([]);
    expect(dto.utm_source).toBeUndefined();
    expect(dto.first_visit_at).toBeUndefined();
  });

  it('accepts UTMs with first_visit_at as epoch milliseconds number', async () => {
    const { dto, errors } = await validateRegister({
      ...baseRegisterBody,
      utm_source: 'facebook',
      utm_medium: 'cpc',
      utm_campaign: 'launch',
      utm_content: 'ad1',
      fbclid: 'click123',
      first_visit_at: 1794425797521,
      event_id: 'evt-utm-1',
      fbp: 'fb.1.123.456',
      fbc: 'fb.1.123.click123',
    });

    expect(errors).toEqual([]);
    expect(dto.first_visit_at).toBe('2026-11-11T19:36:37.521Z');
    expect(dto.utm_source).toBe('facebook');
  });

  it('accepts first_visit_at as numeric string epoch milliseconds', async () => {
    const { dto, errors } = await validateRegister({
      ...baseRegisterBody,
      first_visit_at: '1794425797521',
      event_id: 'evt-numeric-string',
    });

    expect(errors).toEqual([]);
    expect(dto.first_visit_at).toBe('2026-11-11T19:36:37.521Z');
  });

  it('accepts first_visit_at as ISO 8601 string', async () => {
    const { dto, errors } = await validateRegister({
      ...baseRegisterBody,
      first_visit_at: '2026-11-10T19:00:00.000Z',
      event_id: 'evt-iso',
    });

    expect(errors).toEqual([]);
    expect(dto.first_visit_at).toBe('2026-11-10T19:00:00.000Z');
  });

  it('drops garbage first_visit_at instead of failing signup', async () => {
    const { dto, errors } = await validateRegister({
      ...baseRegisterBody,
      first_visit_at: 'not-a-real-timestamp',
      event_id: 'evt-garbage',
    });

    expect(errors).toEqual([]);
    expect(dto.first_visit_at).toBeUndefined();
  });

  it('applies the same rules to OnboardTenantDto', async () => {
    const organic = await validateOnboard({
      ...baseOnboardBody,
      event_id: 'evt-onboard-organic',
    });
    expect(organic.errors).toEqual([]);

    const withEpoch = await validateOnboard({
      ...baseOnboardBody,
      utm_source: 'instagram',
      first_visit_at: 1794425797521,
      event_id: 'evt-onboard-epoch',
      metaEventId: 'meta-dup-1',
    });
    expect(withEpoch.errors).toEqual([]);
    expect(withEpoch.dto.first_visit_at).toBe('2026-11-11T19:36:37.521Z');

    const withGarbage = await validateOnboard({
      ...baseOnboardBody,
      first_visit_at: 'garbage',
      event_id: 'evt-onboard-garbage',
    });
    expect(withGarbage.errors).toEqual([]);
    expect(withGarbage.dto.first_visit_at).toBeUndefined();
  });
});
