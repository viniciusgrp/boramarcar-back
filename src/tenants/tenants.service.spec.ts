import { TenantsService } from './tenants.service';
import { DISPOSABLE_EMAIL_MESSAGE } from '../security/signup-security.messages';
import { ESTABLISHMENT_EMAIL_NOT_CONFIRMED_MESSAGE } from '../security/signup-security.messages';

function buildConfig(appEnv?: string) {
  return {
    get: (key: string) => (key === 'APP_ENV' ? appEnv : undefined),
  } as never;
}

function buildService(appEnv?: string) {
  return new TenantsService(
    { getClient: () => ({ auth: { admin: { createUser: jest.fn() } } }) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    buildConfig(appEnv),
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

    await expect(service.checkSlugAvailability('barbearia-nova')).resolves.toEqual({
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
});
