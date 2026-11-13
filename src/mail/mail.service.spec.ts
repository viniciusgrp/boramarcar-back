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
    (
      service as unknown as { transporter: { sendMail: typeof sendMail } }
    ).transporter = { sendMail };

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
      service as unknown as {
        transporter: { options: { host: string; auth: { user: string } } };
      }
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
        transporter: {
          options: { host: string; port: number; requireTLS: boolean };
        };
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
      (
        service as unknown as { transporter: { sendMail: typeof sendMail } }
      ).transporter = { sendMail };
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
        verifyUrl:
          'https://app.example.com/verify?token_hash=abc&type=magiclink',
      });

      expect(sendMail).toHaveBeenCalledTimes(1);
      const payload = getPayload();
      expect(payload.html).toContain('Olá, QA Marketing!');
      expect(payload.html).toContain(
        'Use o código abaixo para confirmar o e-mail <strong style="color:#111827;">dono@gmail.com</strong>. O código expira em 1 hora.',
      );
      expect(payload.html).not.toContain('olá,');
      expect(payload.text).toContain('Olá, QA Marketing!');
      expect(payload.text).toContain(
        'Use o código abaixo para confirmar o e-mail dono@gmail.com. O código expira em 1 hora.',
      );
      expect(payload.text).toContain('123456');
      expect(payload.text).toContain(
        'https://app.example.com/verify?token_hash=abc&type=magiclink',
      );
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
      expect(payload.html).toContain('>Olá!</p>');
      expect(payload.html).toContain(
        'Use o código abaixo para confirmar o e-mail <strong style="color:#111827;">dono@gmail.com</strong>',
      );
      expect(payload.html).not.toContain('olá,');
      expect(payload.text).toContain('Olá!');
      expect(payload.text).toContain(
        'Use o código abaixo para confirmar o e-mail dono@gmail.com. O código expira em 1 hora.',
      );
      expect(payload.text).toContain('654321');
    });

    it('renders the petróleo card, logo, code box and magic link button', async () => {
      const service = buildService({
        APP_ENV: 'production',
        FRONTEND_URL: 'https://horariocerto.app',
        SMTP_HOST: 'smtp.example.com',
        SMTP_USER: 'user',
        SMTP_PASS: 'pass',
        SMTP_FROM: 'Horário Certo <noreply@example.com>',
        SMTP_PORT: '587',
      });
      const { getPayload } = mockSendMail(service);
      const verifyUrl =
        'https://horariocerto.app/auth/callback?token_hash=abc%2Bhash&type=magiclink&intent=tenant-register';

      await service.sendEstablishmentEmailVerification({
        recipientEmail: 'dono@gmail.com',
        ownerName: 'Maria Souza',
        code: '123456',
        verifyUrl,
      });

      const payload = getPayload();
      const html = payload.html;
      expect(html).toContain('name="color-scheme" content="light only"');
      expect(html).toContain(
        'name="supported-color-schemes" content="light only"',
      );
      expect(html).toContain('role="presentation"');
      expect(html).toContain('bgcolor="#f9fafb"');
      expect(html).toContain('bgcolor="#ffffff"');
      expect(html).toContain('bgcolor="#0F5F58"');
      expect(html).toContain('bgcolor="#E7F4F2"');
      expect(html).toContain('bgcolor="#fafafa"');
      expect(html).toContain(
        'src="https://horariocerto.app/email/logo-horariocerto-400x67.png"',
      );
      expect(html).toContain('alt="Horário Certo"');
      expect(html).toContain('>123456</p>');
      expect(html).not.toMatch(/>\s*1\s+2\s+3\s+4\s+5\s+6\s*</);
      expect(html).toContain('Confirmar e entrar');
      expect(html).toContain(
        'Ou clique no botão para confirmar automaticamente e entrar no painel.',
      );
      expect(html).toContain('Se não foi você, ignore este e-mail.');
      expect(html).toContain(
        'Horário Certo · Agendamento online para barbearias e salões',
      );
      expect(html).toContain('token_hash=abc%2Bhash');
      expect(html).not.toContain('BoraMarcar');
      expect(html).not.toMatch(/[\u2013\u2014]/);
      expect(payload.text).not.toContain('BoraMarcar');
      expect(payload.text).not.toMatch(/[\u2013\u2014]/);
      expect(payload.text).toContain(
        'Ou clique no botão para confirmar automaticamente e entrar no painel:',
      );
    });
  });
});
