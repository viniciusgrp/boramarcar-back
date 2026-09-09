import { TenantsService } from './tenants.service';
import { DISPOSABLE_EMAIL_MESSAGE } from '../security/signup-security.messages';
import { ESTABLISHMENT_EMAIL_NOT_CONFIRMED_MESSAGE } from '../security/signup-security.messages';

function buildService() {
  return new TenantsService(
    { getClient: () => ({ auth: { admin: { createUser: jest.fn() } } }) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
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
      {} as never,
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

  it('blocks panel access while establishment email is pending', () => {
    const service = buildService();

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
});
