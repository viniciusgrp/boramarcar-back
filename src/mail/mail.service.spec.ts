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
