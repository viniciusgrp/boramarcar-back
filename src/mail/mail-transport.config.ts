export type MailProvider = 'resend' | 'ses';

export type MailTransportConfig = {
  provider: MailProvider;
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  user: string;
  pass: string;
  from: string | null;
};

export type MailTransportResolution =
  | { status: 'ready'; config: MailTransportConfig }
  | { status: 'invalid_provider'; raw: string }
  | { status: 'incomplete'; provider: MailProvider };

type EnvReader = {
  get(key: string): string | undefined;
};

function read(env: EnvReader, key: string): string | undefined {
  const value = env.get(key)?.trim();
  return value ? value : undefined;
}

function parsePort(raw: string | undefined, fallback: number): number | null {
  if (!raw) {
    return fallback;
  }

  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port <= 0) {
    return null;
  }

  return port;
}

export function resolveMailProvider(raw: string | undefined): MailProvider | null {
  const value = (raw ?? 'resend').trim().toLowerCase();
  if (value === '' || value === 'resend') {
    return 'resend';
  }
  if (value === 'ses') {
    return 'ses';
  }
  return null;
}

export function resolveMailTransport(env: EnvReader): MailTransportResolution {
  const rawProvider = read(env, 'MAIL_PROVIDER');
  const provider = resolveMailProvider(rawProvider);
  if (!provider) {
    return { status: 'invalid_provider', raw: rawProvider ?? '' };
  }

  if (provider === 'ses') {
    const host = read(env, 'SES_SMTP_HOST');
    const user = read(env, 'SES_SMTP_USER');
    const pass = read(env, 'SES_SMTP_PASS');
    const from = read(env, 'SES_SMTP_FROM') ?? null;
    const port = parsePort(read(env, 'SES_SMTP_PORT'), 587);

    if (!host || !user || !pass || !from || port === null) {
      return { status: 'incomplete', provider };
    }

    return {
      status: 'ready',
      config: {
        provider,
        host,
        port,
        secure: port === 465,
        requireTls: port === 587,
        user,
        pass,
        from,
      },
    };
  }

  const host = read(env, 'SMTP_HOST');
  const user = read(env, 'SMTP_USER');
  const pass = read(env, 'SMTP_PASS');
  const port = parsePort(read(env, 'SMTP_PORT'), 587);

  if (!host || !user || !pass || port === null) {
    return { status: 'incomplete', provider: 'resend' };
  }

  return {
    status: 'ready',
    config: {
      provider: 'resend',
      host,
      port,
      secure: port === 465,
      requireTls: port === 587,
      user,
      pass,
      from: read(env, 'SMTP_FROM') ?? null,
    },
  };
}
