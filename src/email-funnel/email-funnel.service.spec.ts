import { MailService } from '../mail/mail.service';
import { EmailFunnelService } from './email-funnel.service';
import type { EmailFunnelStepRow } from './email-funnel.types';

describe('EmailFunnelService.sendPreview', () => {
  it('renders the step and sends HTML mail to the requested address', async () => {
    const step: EmailFunnelStepRow = {
      step_key: 'welcome',
      step_number: 1,
      subject: 'Sua conta do Horário Certo está pronta 🎉',
      preheader: 'Cadastre os serviços, revise os horários e compartilhe o link.',
      title: 'Sua conta do Horário Certo está pronta 🎉',
      body_text: 'Você acabou de criar sua conta no Horário Certo.',
      body_if_setup: null,
      steps_json: null,
      cta_label: 'Configurar minha agenda',
      cta_path: '/admin/configuracoes?tab=hours',
      trigger_type: 'immediate',
      trigger_offset: 0,
      send_hour: null,
      window_start_hour: null,
      window_end_hour: null,
      skip_if_setup_complete: false,
      send_only_if: null,
      is_active: true,
      image_url: null,
      video_url: null,
      updated_at: '2026-09-08T00:00:00.000Z',
    };

    const sendHtmlEmail = jest.fn().mockResolvedValue(undefined);
    const maybeSingle = jest.fn().mockResolvedValue({ data: step, error: null });

    const supabaseService = {
      getClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle,
            }),
          }),
        }),
      }),
    };

    const mailService = { sendHtmlEmail } as unknown as MailService;
    const configService = {
      get: (key: string) =>
        key === 'FRONTEND_URL' ? 'https://horariocerto.app' : undefined,
    };

    const service = new EmailFunnelService(
      supabaseService as never,
      mailService,
      configService as never,
    );

    const result = await service.sendPreview({
      stepKey: 'welcome',
      to: 'socio@horariocerto.app',
    });

    expect(result.sentTo).toBe('socio@horariocerto.app');
    expect(sendHtmlEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'socio@horariocerto.app',
        subject: '[Teste] Sua conta do Horário Certo está pronta 🎉',
        failIfUnconfigured: true,
      }),
    );
    const html = (sendHtmlEmail.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain('Configurar minha agenda');
    expect(html).toContain(
      'https://horariocerto.app/admin/configuracoes?tab=hours',
    );
  });
});
