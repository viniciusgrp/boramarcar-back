import {
  buildTenantOpenGraphFallbackDescription,
  buildTenantOpenGraphPayload,
  resolveTenantOpenGraphDescription,
} from './tenant-open-graph.util';

describe('tenant-open-graph.util', () => {
  const urls = {
    appOrigin: 'https://boramarcar.com.br/',
    apiOrigin: 'https://api.boramarcar.com.br/',
  };

  it('uses custom description when present', () => {
    expect(
      resolveTenantOpenGraphDescription(
        '  Cortes clássicos e barba.  ',
        'Barbearia do Zé',
        'São Paulo',
      ),
    ).toBe('Cortes clássicos e barba.');
  });

  it('falls back to generated description with city', () => {
    expect(
      buildTenantOpenGraphFallbackDescription('Barbearia do Zé', 'São Paulo'),
    ).toBe(
      'Agende online em Barbearia do Zé em São Paulo. Horários disponíveis 24h.',
    );
  });

  it('falls back without city when city is empty', () => {
    expect(buildTenantOpenGraphFallbackDescription('Studio X', '  ')).toBe(
      'Agende online em Studio X. Horários disponíveis 24h.',
    );
  });

  it('builds absolute canonical and og-image URLs', () => {
    const payload = buildTenantOpenGraphPayload(
      {
        name: 'Barbearia do Zé',
        slug: 'barbearia-do-ze',
        description: null,
        addressCity: 'Curitiba',
        logoUrl: 'https://cdn.example/logo.png',
      },
      urls,
    );

    expect(payload).toEqual({
      title: 'Barbearia do Zé | Agendar online',
      description:
        'Agende online em Barbearia do Zé em Curitiba. Horários disponíveis 24h.',
      canonicalUrl: 'https://boramarcar.com.br/barbearia-do-ze',
      imageUrl:
        'https://api.boramarcar.com.br/tenants/barbearia-do-ze/og-image',
      imageAlt: 'Barbearia do Zé',
      siteName: 'Barbearia do Zé',
      faviconUrl: 'https://cdn.example/logo.png',
    });
  });

  it('truncates long custom descriptions', () => {
    const long = 'a'.repeat(320);
    const resolved = resolveTenantOpenGraphDescription(long, 'X', null);
    expect(resolved.length).toBe(300);
    expect(resolved.endsWith('…')).toBe(true);
  });
});
