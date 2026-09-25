import { resolveMailTransport } from './mail-transport.config';

const resendEnv = {
  SMTP_HOST: 'smtp.resend.com',
  SMTP_PORT: '465',
  SMTP_USER: 'resend',
  SMTP_PASS: 're_test',
  SMTP_FROM: 'BoraMarcar <noreply@boramarcar.com.br>',
};

const sesEnv = {
  SES_SMTP_HOST: 'email-smtp.sa-east-1.amazonaws.com',
  SES_SMTP_PORT: '587',
  SES_SMTP_USER: 'ses-user',
  SES_SMTP_PASS: 'ses-pass',
  SES_SMTP_FROM: 'BoraMarcar <noreply@boramarcar.com.br>',
};

function env(values: Record<string, string | undefined>) {
  return {
    get: (key: string) => values[key],
  };
}

describe('resolveMailTransport', () => {
  it('keeps Resend SMTP when MAIL_PROVIDER is omitted, even if SES is filled', () => {
    const resolution = resolveMailTransport(env({ ...resendEnv, ...sesEnv }));

    expect(resolution).toEqual({
      status: 'ready',
      config: expect.objectContaining({
        provider: 'resend',
        host: 'smtp.resend.com',
        port: 465,
        secure: true,
        requireTls: false,
        from: 'BoraMarcar <noreply@boramarcar.com.br>',
      }),
    });
  });

  it('uses SES credentials only when MAIL_PROVIDER=ses', () => {
    const resolution = resolveMailTransport(
      env({ ...resendEnv, ...sesEnv, MAIL_PROVIDER: 'ses' }),
    );

    expect(resolution).toEqual({
      status: 'ready',
      config: expect.objectContaining({
        provider: 'ses',
        host: 'email-smtp.sa-east-1.amazonaws.com',
        port: 587,
        secure: false,
        requireTls: true,
        user: 'ses-user',
        from: 'BoraMarcar <noreply@boramarcar.com.br>',
      }),
    });
  });

  it('does not fall back to Resend when SES is selected but incomplete', () => {
    const resolution = resolveMailTransport(
      env({ ...resendEnv, MAIL_PROVIDER: 'SES', SES_SMTP_HOST: 'email-smtp.sa-east-1.amazonaws.com' }),
    );

    expect(resolution).toEqual({ status: 'incomplete', provider: 'ses' });
  });

  it('rejects an unknown provider', () => {
    const resolution = resolveMailTransport(env({ ...resendEnv, MAIL_PROVIDER: 'sendgrid' }));

    expect(resolution).toEqual({ status: 'invalid_provider', raw: 'sendgrid' });
  });
});
