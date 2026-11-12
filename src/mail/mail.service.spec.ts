import type { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

function buildService(env: Record<string, string | undefined>) {
  return new MailService({
    get: (key: string) => env[key],
  } as unknown as ConfigService);
}

describe('MailService', () => {
  it('does not send email outside production even if SMTP is configured', async () => {
    const service = buildService({
      APP_ENV: 'hml',
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
      SMTP_FROM: 'Horário Certo <noreply@example.com>',
      SMTP_PORT: '587',
    });
    const sendMail = jest.fn();
    (service as unknown as { transporter: { sendMail: typeof sendMail } }).transporter =
      { sendMail };

    await expect(
      service.sendHtmlEmail({
        to: 'dono@gmail.com',
        subject: 'Confirme seu e-mail no Horário Certo',
        html: '<p>ok</p>',
        failIfUnconfigured: true,
      }),
    ).resolves.toBeUndefined();

    expect(sendMail).not.toHaveBeenCalled();
  });

  it('keeps the Resend host when SES credentials are also present', () => {
    const service = buildService({
      MAIL_PROVIDER: 'resend',
      SMTP_HOST: 'smtp.resend.com',
      SMTP_PORT: '465',
      SMTP_USER: 'resend',
      SMTP_PASS: 're_test',
      SMTP_FROM: 'Horário Certo <noreply@example.com>',
      SES_SMTP_HOST: 'email-smtp.sa-east-1.amazonaws.com',
      SES_SMTP_PORT: '587',
      SES_SMTP_USER: 'ses-user',
      SES_SMTP_PASS: 'ses-pass',
      SES_SMTP_FROM: 'Horário Certo <noreply@example.com>',
    });

    const options = (
      service as unknown as { transporter: { options: { host: string; auth: { user: string } } } }
    ).transporter.options;

    expect(options.host).toBe('smtp.resend.com');
    expect(options.auth.user).toBe('resend');
  });

  it('switches the transporter to SES when MAIL_PROVIDER=ses', () => {
    const service = buildService({
      MAIL_PROVIDER: 'ses',
      SMTP_HOST: 'smtp.resend.com',
      SMTP_USER: 'resend',
      SMTP_PASS: 're_test',
      SES_SMTP_HOST: 'email-smtp.sa-east-1.amazonaws.com',
      SES_SMTP_PORT: '587',
      SES_SMTP_USER: 'ses-user',
      SES_SMTP_PASS: 'ses-pass',
      SES_SMTP_FROM: 'Horário Certo <noreply@example.com>',
    });

    const options = (
      service as unknown as {
        transporter: { options: { host: string; port: number; requireTLS: boolean } };
      }
    ).transporter.options;

    expect(options.host).toBe('email-smtp.sa-east-1.amazonaws.com');
    expect(options.port).toBe(587);
    expect(options.requireTLS).toBe(true);
  });

  it('skips SMTP in development without throwing', async () => {
    const service = buildService({ APP_ENV: 'development' });

    await expect(
      service.sendHtmlEmail({
        to: 'dono@gmail.com',
        subject: 'Teste',
        html: '<p>ok</p>',
        failIfUnconfigured: true,
      }),
    ).resolves.toBeUndefined();
  });

  describe('sendEstablishmentEmailVerification greeting', () => {
    type MailPayload = { html: string; text: string };

    function buildProductionService() {
      return buildService({
        APP_ENV: 'production',
        SMTP_HOST: 'smtp.example.com',
        SMTP_USER: 'user',
        SMTP_PASS: 'pass',
        SMTP_FROM: 'Horário Certo <noreply@example.com>',
        SMTP_PORT: '587',
      });
    }

    function mockSendMail(service: MailService) {
      let lastPayload: MailPayload | undefined;
      const sendMail = jest.fn((options: MailPayload) => {
        lastPayload = options;
        return Promise.resolve();
      });
      (service as unknown as { transporter: { sendMail: typeof sendMail } }).transporter =
        { sendMail };
      return {
        sendMail,
        getPayload: (): MailPayload => {
          if (!lastPayload) {
            throw new Error('sendMail was not called');
          }
          return lastPayload;
        },
      };
    }

    it('greets with name when ownerName is present', async () => {
      const service = buildProductionService();
      const { sendMail, getPayload } = mockSendMail(service);

      await service.sendEstablishmentEmailVerification({
        recipientEmail: 'dono@gmail.com',
        ownerName: 'QA Marketing',
        code: '123456',
        verifyUrl: 'https://app.example.com/verify',
      });

      expect(sendMail).toHaveBeenCalledTimes(1);
      const payload = getPayload();
      expect(payload.html).toContain(
        'Olá, QA Marketing! Use o código abaixo para ativar o estabelecimento cadastrado com',
      );
      expect(payload.html).not.toContain('olá,');
      expect(payload.text).toContain(
        'Olá, QA Marketing! Use o código abaixo para ativar o estabelecimento cadastrado com dono@gmail.com.',
      );
      expect(payload.text).toContain('123456');
      expect(payload.text).toContain('https://app.example.com/verify');
    });

    it('greets without name when ownerName is empty', async () => {
      const service = buildProductionService();
      const { sendMail, getPayload } = mockSendMail(service);

      await service.sendEstablishmentEmailVerification({
        recipientEmail: 'dono@gmail.com',
        ownerName: '   ',
        code: '654321',
        verifyUrl: 'https://app.example.com/verify',
      });

      expect(sendMail).toHaveBeenCalledTimes(1);
      const payload = getPayload();
      expect(payload.html).toContain(
        'Olá! Use o código abaixo para ativar o estabelecimento cadastrado com',
      );
      expect(payload.html).not.toContain('olá,');
      expect(payload.text).toContain(
        'Olá! Use o código abaixo para ativar o estabelecimento cadastrado com dono@gmail.com.',
      );
      expect(payload.text).toContain('654321');
    });
  });
});
