import { buildEmailFunnelHtml, resolveMediaUrl } from './email-funnel-html.util';
import type { EmailFunnelStepRow } from './email-funnel.types';

describe('resolveMediaUrl', () => {
  it('keeps absolute URLs and prefixes relative paths with the frontend origin', () => {
    expect(
      resolveMediaUrl(
        'https://www.instagram.com/boramarcarapp/p/DcG_MG4RtRd/',
        'https://horariocerto.app',
      ),
    ).toBe('https://www.instagram.com/boramarcarapp/p/DcG_MG4RtRd/');

    expect(
      resolveMediaUrl('/email-funnel/agenda-bora-marcar.png', 'https://horariocerto.app/'),
    ).toBe('https://horariocerto.app/email-funnel/agenda-bora-marcar.png');
  });

  it('renders an email with image and UTM parameters', () => {
    const step: EmailFunnelStepRow = {
      step_key: 'video_agenda',
      step_number: 5,
      subject: 'Sua agenda pode estar organizada assim',
      preheader: 'Cada pessoa da equipe na própria linha.',
      title: 'Sua agenda pode estar organizada assim:',
      body_text: 'Dá uma olhada na imagem da agenda.',
      body_if_setup: null,
      steps_json: null,
      cta_label: 'Abrir a agenda',
      cta_path: '/admin/agenda',
      trigger_type: 'days_after_signup',
      trigger_offset: 4,
      send_hour: 10,
      window_start_hour: null,
      window_end_hour: null,
      skip_if_setup_complete: false,
      send_only_if: null,
      is_active: true,
      image_url: '/email-funnel/agenda-preview.jpg',
      video_url: null,
      updated_at: '2026-09-08T00:00:00.000Z',
    };

    const html = buildEmailFunnelHtml({
      step,
      frontendUrl: 'https://horariocerto.app',
      ctaUrl: 'https://horariocerto.app/admin/agenda',
      optOutUrl: 'https://horariocerto.app/descadastrar-emails-trial?token=x',
      useSetupCopy: false,
      trialEndsAt: null,
      ownerFirstName: 'Maria',
      tenantName: 'Salão Exemplo',
      tenantSlug: 'salao-exemplo',
      companyAddress: null,
    });

    expect(html).toContain('https://horariocerto.app/email-funnel/agenda-preview.jpg');
    expect(html).toContain('utm_source=email');
    expect(html).toContain('utm_medium=lifecycle');
    expect(html).toContain('utm_campaign=trial');
    expect(html).toContain('utm_content=video_agenda');
  });
});
