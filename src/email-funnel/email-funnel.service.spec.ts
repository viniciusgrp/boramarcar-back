import { MailService } from '../mail/mail.service';
import { EmailFunnelService } from './email-funnel.service';
import type { EmailFunnelStepRow } from './email-funnel.types';

describe('EmailFunnelService.sendPreview', () => {
  it('renders the step and sends HTML mail to the requested address', async () => {
    const step: EmailFunnelStepRow = {
      step_key: 'welcome',
      step_number: 1,
      subject: 'Sua conta do Bora Marcar está pronta 🎉',
      title: 'Sua conta do Bora Marcar está pronta 🎉',
      body_text: 'Você acabou de criar sua conta no Bora Marcar.',
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
        key === 'FRONTEND_URL' ? 'https://boramarcar.com.br' : undefined,
    };

    const service = new EmailFunnelService(
      supabaseService as never,
      mailService,
      configService as never,
    );

    const result = await service.sendPreview({
      stepKey: 'welcome',
      to: 'socio@boramarcar.com.br',
    });

    expect(result.sentTo).toBe('socio@boramarcar.com.br');
    expect(sendHtmlEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'socio@boramarcar.com.br',
        subject: '[Teste] Sua conta do Bora Marcar está pronta 🎉',
        failIfUnconfigured: true,
      }),
    );
    const html = (sendHtmlEmail.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain('Configurar minha agenda');
    expect(html).toContain(
      'https://boramarcar.com.br/admin/configuracoes?tab=hours',
    );
  });
});
