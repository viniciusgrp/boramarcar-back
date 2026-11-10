import {
  escapeHtml,
  addUtmParams,
  getTrialDaysRemaining,
  interpolateVariables,
  renderEmailTemplate,
  renderEmailPlainText,
} from './email-funnel-template.util';

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<script>alert("XSS")</script>')).toBe(
      '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;',
    );
    expect(escapeHtml("Test & 'string' \"with\" <tags>")).toBe(
      'Test &amp; &#39;string&#39; &quot;with&quot; &lt;tags&gt;',
    );
  });
});

describe('addUtmParams', () => {
  it('adds UTM parameters to URL without query string', () => {
    const url = '/admin/dashboard';
    const params = {
      utm_source: 'email',
      utm_medium: 'lifecycle',
      utm_campaign: 'trial',
      utm_content: 'welcome',
    };
    const result = addUtmParams(url, params);
    expect(result).toContain('utm_source=email');
    expect(result).toContain('utm_medium=lifecycle');
    expect(result).toContain('utm_campaign=trial');
    expect(result).toContain('utm_content=welcome');
  });

  it('merges UTM parameters with existing query string', () => {
    const url = '/admin/dashboard?existing=param';
    const params = {
      utm_source: 'email',
      utm_campaign: 'trial',
    };
    const result = addUtmParams(url, params);
    expect(result).toContain('existing=param');
    expect(result).toContain('utm_source=email');
    expect(result).toContain('utm_campaign=trial');
  });

  it('does not duplicate existing UTM parameters', () => {
    const url = '/admin/dashboard?utm_source=existing';
    const params = {
      utm_source: 'email',
      utm_campaign: 'trial',
    };
    const result = addUtmParams(url, params);
    expect(result).toContain('utm_source=existing');
    expect(result).toContain('utm_campaign=trial');
    expect((result.match(/utm_source=/g) || []).length).toBe(1);
  });

  it('handles absolute URLs', () => {
    const url = 'https://horariocerto.app/admin/dashboard';
    const params = {
      utm_source: 'email',
      utm_campaign: 'trial',
    };
    const result = addUtmParams(url, params);
    expect(result).toContain('https://horariocerto.app/admin/dashboard');
    expect(result).toContain('utm_source=email');
    expect(result).toContain('utm_campaign=trial');
  });
});

describe('getTrialDaysRemaining', () => {
  it('returns 0 when trial_ends_at is null', () => {
    expect(getTrialDaysRemaining(null)).toBe(0);
  });

  it('calculates days remaining correctly', () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const daysRemaining = getTrialDaysRemaining(futureDate.toISOString());
    expect(daysRemaining).toBeGreaterThanOrEqual(6);
    expect(daysRemaining).toBeLessThanOrEqual(8);
  });

  it('returns 0 for past dates', () => {
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const daysRemaining = getTrialDaysRemaining(pastDate.toISOString());
    expect(daysRemaining).toBe(0);
  });

  it('rounds up partial days', () => {
    const futureDate = new Date(Date.now() + 1.5 * 24 * 60 * 60 * 1000);
    const daysRemaining = getTrialDaysRemaining(futureDate.toISOString());
    expect(daysRemaining).toBe(2);
  });
});

describe('interpolateVariables', () => {
  it('interpolates single variable', () => {
    const text = 'Olá, {{nome}}.';
    const variables = { nome: 'Maria' };
    expect(interpolateVariables(text, variables)).toBe('Olá, Maria.');
  });

  it('interpolates multiple variables', () => {
    const text = '{{nome}}, seu estabelecimento {{nome_negocio}} está pronto.';
    const variables = { nome: 'João', nome_negocio: 'Salão Exemplo' };
    expect(interpolateVariables(text, variables)).toBe(
      'João, seu estabelecimento Salão Exemplo está pronto.',
    );
  });

  it('handles missing variables by replacing with empty string', () => {
    const text = 'Olá, {{nome}}. Link: {{link_agendamento}}';
    const variables = { nome: 'Maria' };
    expect(interpolateVariables(text, variables)).toBe('Olá, Maria. Link: ');
  });

  it('escapes HTML in variable values', () => {
    const text = 'Nome: {{nome}}';
    const variables = { nome: '<script>alert("XSS")</script>' };
    expect(interpolateVariables(text, variables)).toBe(
      'Nome: &lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;',
    );
  });

  it('handles variables with spaces around braces', () => {
    const text = '{{ nome }} está aqui';
    const variables = { nome: 'Maria' };
    expect(interpolateVariables(text, variables)).toBe('Maria está aqui');
  });
});

describe('renderEmailTemplate', () => {
  it('renders a complete email with all fields', () => {
    const html = renderEmailTemplate({
      assunto: 'Teste',
      preheader: 'Preheader de teste',
      titulo: 'Título do Email',
      corpo: 'Corpo do email com parágrafo.',
      cta_label: 'Clique aqui',
      cta_url: 'https://example.com',
      unsubscribe_url: 'https://example.com/unsubscribe',
    });

    expect(html).toContain('<title>Teste</title>');
    expect(html).toContain('Preheader de teste');
    expect(html).toContain('Título do Email');
    expect(html).toContain('Corpo do email com parágrafo.');
    expect(html).toContain('Clique aqui');
    expect(html).toContain('https://example.com');
    expect(html).toContain('https://example.com/unsubscribe');
  });

  it('renders email with tutorial steps', () => {
    const html = renderEmailTemplate({
      assunto: 'Tutorial',
      preheader: null,
      titulo: 'Siga os passos',
      corpo: 'Aqui estão os passos:',
      passos: [
        { numero: 1, titulo: 'Primeiro passo', corpo: 'Descrição do primeiro' },
        { numero: 2, titulo: 'Segundo passo', corpo: 'Descrição do segundo' },
      ],
      passos_intro: 'Siga as instruções:',
      cta_label: 'Começar',
      cta_url: '/admin/dashboard',
      unsubscribe_url: '/unsubscribe',
    });

    expect(html).toContain('Siga as instruções:');
    expect(html).toContain('Primeiro passo');
    expect(html).toContain('Descrição do primeiro');
    expect(html).toContain('Segundo passo');
    expect(html).toContain('Descrição do segundo');
  });

  it('renders email with image', () => {
    const html = renderEmailTemplate({
      assunto: 'Com imagem',
      preheader: null,
      titulo: 'Veja a imagem',
      corpo: 'Texto antes da imagem.',
      image_url: 'https://example.com/image.png',
      image_alt: 'Imagem de exemplo',
      cta_label: 'Ver mais',
      cta_url: '/admin/dashboard',
      unsubscribe_url: '/unsubscribe',
    });

    expect(html).toContain('https://example.com/image.png');
    expect(html).toContain('Imagem de exemplo');
  });

  it('renders email with company address', () => {
    const html = renderEmailTemplate({
      assunto: 'Com endereço',
      preheader: null,
      titulo: 'Teste',
      corpo: 'Corpo',
      cta_label: 'OK',
      cta_url: '/',
      unsubscribe_url: '/unsubscribe',
      empresa_endereco: 'Rua Exemplo, 123 - CNPJ 00.000.000/0000-00',
    });

    expect(html).toContain('Rua Exemplo, 123 - CNPJ 00.000.000/0000-00');
  });

  it('omits preheader when null', () => {
    const html = renderEmailTemplate({
      assunto: 'Sem preheader',
      preheader: null,
      titulo: 'Teste',
      corpo: 'Corpo',
      cta_label: 'OK',
      cta_url: '/',
      unsubscribe_url: '/unsubscribe',
    });

    expect(html).not.toMatch(/display:none[^>]*Preheader/);
  });
});

describe('renderEmailPlainText', () => {
  it('renders plain text version', () => {
    const text = renderEmailPlainText({
      assunto: 'Teste',
      preheader: 'Preheader',
      titulo: 'Título',
      corpo: 'Corpo do email',
      cta_label: 'Clique',
      cta_url: 'https://example.com',
      unsubscribe_url: 'https://example.com/unsubscribe',
    });

    expect(text).toContain('Horário Certo');
    expect(text).toContain('Título');
    expect(text).toContain('Corpo do email');
    expect(text).toContain('Clique: https://example.com');
    expect(text).toContain('Descadastrar: https://example.com/unsubscribe');
  });

  it('includes tutorial steps in plain text', () => {
    const text = renderEmailPlainText({
      assunto: 'Tutorial',
      preheader: null,
      titulo: 'Passos',
      corpo: 'Siga:',
      passos: [
        { numero: 1, titulo: 'Primeiro', corpo: 'Desc 1' },
        { numero: 2, titulo: 'Segundo', corpo: 'Desc 2' },
      ],
      passos_intro: 'Instruções:',
      cta_label: 'Começar',
      cta_url: '/start',
      unsubscribe_url: '/unsubscribe',
    });

    expect(text).toContain('Instruções:');
    expect(text).toContain('1. Primeiro');
    expect(text).toContain('Desc 1');
    expect(text).toContain('2. Segundo');
    expect(text).toContain('Desc 2');
  });

  it('includes company address when provided', () => {
    const text = renderEmailPlainText({
      assunto: 'Teste',
      preheader: null,
      titulo: 'Título',
      corpo: 'Corpo',
      cta_label: 'OK',
      cta_url: '/',
      unsubscribe_url: '/unsubscribe',
      empresa_endereco: 'Endereço da Empresa',
    });

    expect(text).toContain('Endereço da Empresa');
  });
});
