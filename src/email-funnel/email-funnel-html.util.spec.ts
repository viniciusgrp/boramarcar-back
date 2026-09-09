import { buildEmailFunnelHtml, resolveMediaUrl } from './email-funnel-html.util';
import type { EmailFunnelStepRow } from './email-funnel.types';

describe('resolveMediaUrl', () => {
  it('keeps absolute URLs and prefixes relative paths with the frontend origin', () => {
    expect(
      resolveMediaUrl(
        'https://www.instagram.com/boramarcarapp/p/DcG_MG4RtRd/',
        'https://boramarcar.com.br',
      ),
    ).toBe('https://www.instagram.com/boramarcarapp/p/DcG_MG4RtRd/');

    expect(
      resolveMediaUrl('/email-funnel/agenda-bora-marcar.png', 'https://boramarcar.com.br/'),
    ).toBe('https://boramarcar.com.br/email-funnel/agenda-bora-marcar.png');
  });

  it('renders an email-safe video block with thumbnail and Instagram button', () => {
    const step: EmailFunnelStepRow = {
      step_key: 'video_agenda',
      step_number: 5,
      subject: 'Sua agenda pode estar organizada assim',
      title: 'Sua agenda pode estar organizada assim:',
      body_text: 'Dá uma olhada no vídeo.',
      body_if_setup: null,
      steps_json: null,
      cta_label: '',
      cta_path: '',
      trigger_type: 'days_after_signup',
      trigger_offset: 4,
      send_hour: 10,
      window_start_hour: null,
      window_end_hour: null,
      skip_if_setup_complete: false,
      is_active: true,
      image_url: '/email-funnel/agenda-video-preview.jpg',
      video_url: 'https://www.instagram.com/boramarcarapp/p/DcG_MG4RtRd/',
      updated_at: '2026-09-08T00:00:00.000Z',
    };

    const html = buildEmailFunnelHtml({
      step,
      frontendUrl: 'https://boramarcar.com.br',
      ctaUrl: 'https://boramarcar.com.br/admin/agenda',
      optOutUrl: 'https://boramarcar.com.br/descadastrar-emails-trial?token=x',
      useSetupCopy: false,
    });

    expect(html).toContain('https://www.instagram.com/boramarcarapp/p/DcG_MG4RtRd/');
    expect(html).toContain(
      'https://boramarcar.com.br/email-funnel/agenda-video-preview.jpg',
    );
    expect(html).toMatch(
      /<a href="https:\/\/www\.instagram\.com\/boramarcarapp\/p\/DcG_MG4RtRd\/"[^>]*>[\s\S]*?<img src="https:\/\/boramarcar\.com\.br\/email-funnel\/agenda-video-preview\.jpg"/,
    );
    expect(html).toContain('Assistir no Instagram');
    expect(html).toContain('width="416" height="234"');
  });
});
