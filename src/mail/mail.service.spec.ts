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
      SMTP_FROM: 'BoraMarcar <noreply@example.com>',
      SMTP_PORT: '587',
    });
    const sendMail = jest.fn();
    (service as unknown as { transporter: { sendMail: typeof sendMail } }).transporter =
      { sendMail };

    await expect(
      service.sendHtmlEmail({
        to: 'dono@gmail.com',
        subject: 'Confirme seu e-mail no BoraMarcar',
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
      SMTP_FROM: 'BoraMarcar <noreply@example.com>',
      SES_SMTP_HOST: 'email-smtp.sa-east-1.amazonaws.com',
      SES_SMTP_PORT: '587',
      SES_SMTP_USER: 'ses-user',
      SES_SMTP_PASS: 'ses-pass',
      SES_SMTP_FROM: 'BoraMarcar <noreply@example.com>',
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
      SES_SMTP_FROM: 'BoraMarcar <noreply@example.com>',
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
});
