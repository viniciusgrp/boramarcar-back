import { TenantsService } from './tenants.service';
import { DISPOSABLE_EMAIL_MESSAGE } from '../security/signup-security.messages';
import { ESTABLISHMENT_EMAIL_NOT_CONFIRMED_MESSAGE } from '../security/signup-security.messages';
import { hashEstablishmentOtp } from '../security/establishment-otp.util';

function buildConfig(appEnv?: string) {
  return {
    get: (key: string) => (key === 'APP_ENV' ? appEnv : undefined),
  } as never;
}

function buildService(appEnv?: string) {
  return new TenantsService(
    {
      getClient: () => ({ auth: { admin: { createUser: jest.fn() } } }),
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    buildConfig(appEnv),
    { sendCompleteRegistration: jest.fn() } as never,
  );
}

describe('TenantsService', () => {
  it('rejects invalid slugs as unavailable', async () => {
    const service = buildService();

    await expect(service.checkSlugAvailability('---')).resolves.toEqual({
      slug: '',
      available: false,
    });
  });

  it('marks a valid unused slug as available', async () => {
    const service = buildService();
    jest.spyOn(service, 'findBySlug').mockResolvedValue(null);

    await expect(
      service.checkSlugAvailability('barbearia-nova'),
    ).resolves.toEqual({
      slug: 'barbearia-nova',
      available: true,
    });
  });

  it('rejects disposable emails before creating an auth user', async () => {
    const createUser = jest.fn();
    const service = new TenantsService(
      { getClient: () => ({ auth: { admin: { createUser } } }) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      buildConfig(),
      { sendCompleteRegistration: jest.fn() } as never,
    );

    await expect(
      service.register({
        owner_name: 'Dono',
        email: 'pentest@mailinator.com',
        password: 'senha1234',
        tenant_name: 'Pentest',
        slug: 'pentest-loja',
        recaptcha_token: 'token',
      }),
    ).rejects.toMatchObject({ message: DISPOSABLE_EMAIL_MESSAGE });

    expect(createUser).not.toHaveBeenCalled();
  });

  it('rejects passwords shorter than 8 characters', async () => {
    const createUser = jest.fn();
    const service = new TenantsService(
      { getClient: () => ({ auth: { admin: { createUser } } }) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      buildConfig(),
      { sendCompleteRegistration: jest.fn() } as never,
    );

    await expect(
      service.register({
        owner_name: 'Dono',
        email: 'dono@gmail.com',
        password: 'ab12345',
        tenant_name: 'Studio',
        slug: 'studio-novo',
        recaptcha_token: 'token',
      }),
    ).rejects.toMatchObject({
      message:
        'A senha deve ter pelo menos 8 caracteres, com letras e números.',
    });

    expect(createUser).not.toHaveBeenCalled();
  });

  it('rejects passwords without both letters and numbers', async () => {
    const createUser = jest.fn();
    const service = new TenantsService(
      { getClient: () => ({ auth: { admin: { createUser } } }) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      buildConfig(),
      { sendCompleteRegistration: jest.fn() } as never,
    );

    await expect(
      service.register({
        owner_name: 'Dono',
        email: 'dono@gmail.com',
        password: 'somenteletras',
        tenant_name: 'Studio',
        slug: 'studio-novo',
        recaptcha_token: 'token',
      }),
    ).rejects.toMatchObject({
      message:
        'A senha deve ter pelo menos 8 caracteres, com letras e números.',
    });

    expect(createUser).not.toHaveBeenCalled();
  });

  it('rejects changing a pending signup to a disposable email', async () => {
    const generateLink = jest.fn();
    const updateUserById = jest.fn();
    const service = new TenantsService(
      {
        getClient: () => ({
          auth: { admin: { generateLink, updateUserById } },
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      buildConfig(),
      { sendCompleteRegistration: jest.fn() } as never,
    );

    await expect(
      service.changeEstablishmentSignupEmail(
        'dono@gmail.com',
        'errado@mailinator.com',
      ),
    ).rejects.toMatchObject({ message: DISPOSABLE_EMAIL_MESSAGE });

    expect(generateLink).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('rejects a verification code that is not 6 digits', async () => {
    const generateLink = jest.fn();
    const service = new TenantsService(
      {
        getClient: () => ({
          auth: { admin: { generateLink } },
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      buildConfig(),
      { sendCompleteRegistration: jest.fn() } as never,
    );

    await expect(
      service.verifyEstablishmentEmailCode('dono@gmail.com', '12345678'),
    ).rejects.toMatchObject({
      message:
        'Código inválido ou expirado. Solicite um novo código e tente de novo.',
    });

    expect(generateLink).not.toHaveBeenCalled();
  });

  it('blocks panel access while establishment email is pending', () => {
    const service = buildService('production');

    expect(() =>
      service.assertEstablishmentEmailVerified({
        email_confirmed_at: null,
        user_metadata: { requires_email_verification: true },
      }),
    ).toThrow(ESTABLISHMENT_EMAIL_NOT_CONFIRMED_MESSAGE);

    expect(() =>
      service.assertEstablishmentEmailVerified({
        email_confirmed_at: null,
        user_metadata: {},
      }),
    ).not.toThrow();
  });

  it('skips establishment email verification outside production', () => {
    const service = buildService('hml');

    expect(() =>
      service.assertEstablishmentEmailVerified({
        email_confirmed_at: null,
        user_metadata: { requires_email_verification: true },
      }),
    ).not.toThrow();
  });

  it('normalizes first_visit_at to ISO before tracking data is stored', () => {
    const service = buildService();

    const trackingData = (
      service as unknown as {
        normalizeTrackingData: (dto: {
          first_visit_at?: string | number;
          utm_source?: string;
        }) => { firstVisitAt: string | null; utmSource: string | null };
      }
    ).normalizeTrackingData({
      utm_source: 'facebook',
      first_visit_at: 1794425797521,
    });

    expect(trackingData.firstVisitAt).toBe('2026-11-11T19:36:37.521Z');
    expect(trackingData.utmSource).toBe('facebook');
    expect(Number.isNaN(new Date(trackingData.firstVisitAt!).getTime())).toBe(
      false,
    );
  });

  it('drops invalid first_visit_at in tracking data instead of keeping raw input', () => {
    const service = buildService();

    const trackingData = (
      service as unknown as {
        normalizeTrackingData: (dto: { first_visit_at?: string | number }) => {
          firstVisitAt: string | null;
        };
      }
    ).normalizeTrackingData({
      first_visit_at: 'not-a-timestamp',
    });

    expect(trackingData.firstVisitAt).toBeNull();
  });
});

describe('TenantsService trial welcome timing', () => {
  const registerDto = {
    owner_name: 'Dono',
    email: 'dono@gmail.com',
    password: 'senha1234',
    tenant_name: 'Studio',
    slug: 'studio-novo',
    recaptcha_token: 'token',
  };

  function buildRegistration(appEnv: string) {
    const sendWelcomeForNewTenant = jest.fn().mockResolvedValue(undefined);
    const sendEstablishmentEmailVerification = jest
      .fn()
      .mockResolvedValue(undefined);
    const createUser = jest.fn().mockResolvedValue({
      data: { user: { id: 'user-1', email: 'dono@gmail.com' } },
      error: null,
    });
    const generateLink = jest.fn().mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'dono@gmail.com',
          email_confirmed_at: null,
          user_metadata: {
            requires_email_verification: true,
            full_name: 'Dono',
          },
        },
        properties: {
          hashed_token: 'hashed-token',
          verification_type: 'magiclink',
        },
      },
      error: null,
    });
    const updateUserById = jest.fn().mockResolvedValue({ error: null });
    const from = jest.fn((table: string) => {
      if (table === 'tenants') {
        const tenant = {
          id: 'tenant-1',
          name: 'Studio',
          slug: 'studio-novo',
          owner_id: 'user-1',
          created_at: '2026-11-13T00:00:00.000Z',
          updated_at: '2026-11-13T00:00:00.000Z',
        };
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: tenant, error: null }),
            }),
          }),
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: tenant, error: null }),
            }),
          }),
        };
      }

      const skipped = Promise.resolve({ error: { message: 'skip seed' } });
      return {
        insert: () => skipped,
      };
    });

    const service = new TenantsService(
      {
        getClient: () => ({
          auth: { admin: { createUser, generateLink, updateUserById } },
          from,
        }),
      } as never,
      {
        createOwnerMembership: jest.fn().mockResolvedValue(undefined),
      } as never,
      {} as never,
      {
        resolveAttributionForSignup: jest.fn().mockResolvedValue(null),
      } as never,
      { sendWelcomeForNewTenant } as never,
      { sendEstablishmentEmailVerification } as never,
      buildConfig(appEnv),
      {
        sendCompleteRegistration: jest.fn().mockResolvedValue(undefined),
      } as never,
    );
    jest.spyOn(service, 'findBySlug').mockResolvedValue(null);

    return {
      service,
      sendWelcomeForNewTenant,
      sendEstablishmentEmailVerification,
    };
  }

  it('does not send welcome on register when email verification is required', async () => {
    const {
      service,
      sendWelcomeForNewTenant,
      sendEstablishmentEmailVerification,
    } = buildRegistration('production');

    const result = await service.register(registerDto);

    expect(result.requiresEmailConfirmation).toBe(true);
    expect(sendEstablishmentEmailVerification).toHaveBeenCalledTimes(1);
    expect(sendWelcomeForNewTenant).not.toHaveBeenCalled();
  });

  it('sends welcome right after register when verification is skipped', async () => {
    const {
      service,
      sendWelcomeForNewTenant,
      sendEstablishmentEmailVerification,
    } = buildRegistration('hml');

    const result = await service.register(registerDto);

    expect(result.requiresEmailConfirmation).toBe(false);
    expect(sendEstablishmentEmailVerification).not.toHaveBeenCalled();
    expect(sendWelcomeForNewTenant).toHaveBeenCalledTimes(1);
    expect(sendWelcomeForNewTenant).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      ownerEmail: 'dono@gmail.com',
    });
  });

  it('sends welcome once when the 6 digit code is confirmed', async () => {
    const code = '123456';
    const sendWelcomeForNewTenant = jest.fn().mockResolvedValue(undefined);
    const user = {
      id: 'user-1',
      email: 'dono@gmail.com',
      email_confirmed_at: null,
      user_metadata: {
        requires_email_verification: true,
        establishment_otp_hash: hashEstablishmentOtp('user-1', code),
        establishment_otp_expires_at: new Date(
          Date.now() + 60_000,
        ).toISOString(),
        establishment_otp_attempts: 0,
      },
    };
    const generateLink = jest.fn().mockResolvedValue({
      data: {
        user,
        properties: {
          hashed_token: 'session-hash',
          verification_type: 'magiclink',
        },
      },
      error: null,
    });
    const updateUserById = jest.fn().mockResolvedValue({ error: null });
    const from = jest.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: { id: 'tenant-1', owner_id: 'user-1' },
              error: null,
            }),
        }),
      }),
    }));
    const service = new TenantsService(
      {
        getClient: () => ({
          auth: { admin: { generateLink, updateUserById } },
          from,
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      { sendWelcomeForNewTenant } as never,
      {} as never,
      buildConfig('production'),
      { sendCompleteRegistration: jest.fn() } as never,
    );

    const result = await service.verifyEstablishmentEmailCode(
      'dono@gmail.com',
      code,
    );

    expect(result).toEqual({
      hashedToken: 'session-hash',
      otpType: 'magiclink',
    });
    expect(sendWelcomeForNewTenant).toHaveBeenCalledTimes(1);
    expect(sendWelcomeForNewTenant).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      ownerEmail: 'dono@gmail.com',
    });
  });

  it('sends welcome once when the magic link session opens the panel', () => {
    const sendWelcomeForNewTenant = jest.fn().mockResolvedValue(undefined);
    const service = new TenantsService(
      { getClient: () => ({}) } as never,
      {} as never,
      {} as never,
      {} as never,
      { sendWelcomeForNewTenant } as never,
      {} as never,
      buildConfig('production'),
      { sendCompleteRegistration: jest.fn() } as never,
    );

    service.scheduleTrialWelcomeForConfirmedOwner({
      tenantId: 'tenant-1',
      role: 'OWNER',
      ownerUserId: 'user-1',
      ownerEmail: 'dono@gmail.com',
      emailConfirmedAt: '2026-11-13T18:00:00.000Z',
    });
    service.scheduleTrialWelcomeForConfirmedOwner({
      tenantId: 'tenant-1',
      role: 'PROFESSIONAL',
      ownerUserId: 'user-2',
      ownerEmail: 'pro@gmail.com',
      emailConfirmedAt: '2026-11-13T18:00:00.000Z',
    });
    service.scheduleTrialWelcomeForConfirmedOwner({
      tenantId: 'tenant-1',
      role: 'OWNER',
      ownerUserId: 'user-1',
      ownerEmail: 'dono@gmail.com',
      emailConfirmedAt: null,
    });

    expect(sendWelcomeForNewTenant).toHaveBeenCalledTimes(1);
    expect(sendWelcomeForNewTenant).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      ownerEmail: 'dono@gmail.com',
    });
  });

  it('requests welcome from the code path and again from the magic link path', async () => {
    const code = '123456';
    const sendWelcomeForNewTenant = jest.fn().mockResolvedValue(undefined);
    const user = {
      id: 'user-1',
      email: 'dono@gmail.com',
      email_confirmed_at: null,
      user_metadata: {
        requires_email_verification: true,
        establishment_otp_hash: hashEstablishmentOtp('user-1', code),
        establishment_otp_expires_at: new Date(
          Date.now() + 60_000,
        ).toISOString(),
        establishment_otp_attempts: 0,
      },
    };
    const generateLink = jest.fn().mockResolvedValue({
      data: {
        user,
        properties: {
          hashed_token: 'session-hash',
          verification_type: 'magiclink',
        },
      },
      error: null,
    });
    const service = new TenantsService(
      {
        getClient: () => ({
          auth: {
            admin: {
              generateLink,
              updateUserById: jest.fn().mockResolvedValue({ error: null }),
            },
          },
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: { id: 'tenant-1', owner_id: 'user-1' },
                    error: null,
                  }),
              }),
            }),
          }),
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      { sendWelcomeForNewTenant } as never,
      {} as never,
      buildConfig('production'),
      { sendCompleteRegistration: jest.fn() } as never,
    );

    await service.verifyEstablishmentEmailCode('dono@gmail.com', code);
    service.scheduleTrialWelcomeForConfirmedOwner({
      tenantId: 'tenant-1',
      role: 'OWNER',
      ownerUserId: 'user-1',
      ownerEmail: 'dono@gmail.com',
      emailConfirmedAt: '2026-11-13T18:00:00.000Z',
    });

    expect(sendWelcomeForNewTenant).toHaveBeenCalledTimes(2);
    expect(sendWelcomeForNewTenant).toHaveBeenNthCalledWith(1, {
      tenantId: 'tenant-1',
      ownerEmail: 'dono@gmail.com',
    });
    expect(sendWelcomeForNewTenant).toHaveBeenNthCalledWith(2, {
      tenantId: 'tenant-1',
      ownerEmail: 'dono@gmail.com',
    });
  });
});
