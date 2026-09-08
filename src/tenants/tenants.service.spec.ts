import { TenantsService } from './tenants.service';

describe('TenantsService', () => {
  it('rejects invalid slugs as unavailable', async () => {
    const service = new TenantsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.checkSlugAvailability('---')).resolves.toEqual({
      slug: '',
      available: false,
    });
  });

  it('marks a valid unused slug as available', async () => {
    const service = new TenantsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(service, 'findBySlug').mockResolvedValue(null);

    await expect(service.checkSlugAvailability('barbearia-nova')).resolves.toEqual({
      slug: 'barbearia-nova',
      available: true,
    });
  });
});
