import {
  buildEmailFunnelContent,
  buildEmailFunnelHtml,
  resolveMediaUrl,
} from './email-funnel-html.util';
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

  it('renders video_agenda with environment-relative image, width 520, and design alt', () => {
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
      image_url: '/email/agenda-timeline-equipe-1040.png',
      video_url: null,
      updated_at: '2026-09-08T00:00:00.000Z',
    };

    const html = buildEmailFunnelHtml({
      step,
      frontendUrl: 'https://hml.horariocerto.app',
      ctaUrl: 'https://hml.horariocerto.app/admin/agenda',
      optOutUrl: 'https://hml.horariocerto.app/descadastrar-emails-trial?token=x',
      useSetupCopy: false,
      trialEndsAt: null,
      ownerFirstName: 'Maria',
      tenantName: 'Salão Exemplo',
      tenantSlug: 'salao-exemplo',
      companyAddress: null,
    });

    expect(html).toContain(
      'https://hml.horariocerto.app/email/agenda-timeline-equipe-1040.png',
    );
    expect(html).not.toContain(
      'src="https://horariocerto.app/email/agenda-timeline-equipe-1040.png"',
    );
    expect(html).toContain('width="520"');
    expect(html).toContain(
      'alt="Agenda do Horário Certo com o dia de Lucas e Rafael, com horários de corte e barba confirmados de manhã e à tarde"',
    );
    expect(html).toContain('utm_source=email');
    expect(html).toContain('utm_medium=lifecycle');
    expect(html).toContain('utm_campaign=trial');
    expect(html).toContain('utm_content=video_agenda');
    expect(html).toContain('ses:no-track');
  });

  it('interpolates dias_restantes in subject/preheader with Portuguese agreement', () => {
    const step: EmailFunnelStepRow = {
      step_key: 'trial_mid',
      step_number: 6,
      subject: 'Você ainda tem {{dias_restantes}} {{dias_label}} para testar',
      preheader:
        '{{dias_restantes}} {{dias_label}} do Pro pela frente. Agenda, caixa, fidelidade e cupons no mesmo painel.',
      title: 'Você está no meio do teste de 14 dias.',
      body_text:
        'Ainda {{restam_ou_resta}} {{dias_restantes}} {{dias_label}} do plano Pro, sem cartão.',
      body_if_setup: null,
      steps_json: null,
      cta_label: 'Continuar pelo Início',
      cta_path: '/admin/dashboard',
      trigger_type: 'days_after_signup',
      trigger_offset: 7,
      send_hour: 10,
      window_start_hour: null,
      window_end_hour: null,
      skip_if_setup_complete: false,
      send_only_if: null,
      is_active: true,
      image_url: null,
      video_url: null,
      updated_at: '2026-11-10T00:00:00.000Z',
    };

    const sevenDays = buildEmailFunnelContent({
      step,
      frontendUrl: 'https://hml.horariocerto.app',
      ctaUrl: 'https://hml.horariocerto.app/admin/dashboard',
      optOutUrl: 'https://hml.horariocerto.app/descadastrar-emails-trial?token=x',
      useSetupCopy: false,
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      ownerFirstName: 'Maria',
      tenantName: 'Estabelecimento Exemplo',
      tenantSlug: 'exemplo',
      companyAddress: null,
    });

    expect(sevenDays.subject).toBe('Você ainda tem 7 dias para testar');
    expect(sevenDays.html).toContain('7 dias do Pro pela frente');
    expect(sevenDays.html).toContain('Ainda restam 7 dias do plano Pro');
    expect(sevenDays.html).toContain(
      'https://hml.horariocerto.app/email/logo-horariocerto-400x67.png',
    );

    const oneDay = buildEmailFunnelContent({
      step,
      frontendUrl: 'https://horariocerto.app',
      ctaUrl: 'https://horariocerto.app/admin/dashboard',
      optOutUrl: 'https://horariocerto.app/descadastrar-emails-trial?token=x',
      useSetupCopy: false,
      trialEndsAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
      ownerFirstName: 'Maria',
      tenantName: 'Estabelecimento Exemplo',
      tenantSlug: 'exemplo',
      companyAddress: null,
    });

    expect(oneDay.subject).toBe('Você ainda tem 1 dia para testar');
    expect(oneDay.html).toContain('Ainda resta 1 dia do plano Pro');
  });
});
