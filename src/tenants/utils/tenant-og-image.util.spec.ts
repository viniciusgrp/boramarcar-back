import { escapeXml, buildTenantOgSvg } from './tenant-og-image.util';

describe('tenant-og-image.util', () => {
  it('escapes XML special characters', () => {
    expect(escapeXml(`A & B <C> "D" 'E'`)).toBe(
      'A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos;',
    );
  });

  it('builds an SVG with the tenant name', () => {
    const svg = buildTenantOgSvg({
      name: escapeXml('Barbearia do Zé'),
      primaryColor: '#111827',
      textColor: '#ffffff',
      hasBanner: false,
      hasLogo: true,
    });

    expect(svg).toContain('Barbearia do Zé');
    expect(svg).toContain('Agendar online');
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="630"');
  });
});
