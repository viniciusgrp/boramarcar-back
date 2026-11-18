import { MailService } from '../mail/mail.service';
import {
  EmailFunnelService,
  isSendReclaimable,
  resolvePreviewTrialEndsAt,
} from './email-funnel.service';
import type { EmailFunnelStepRow } from './email-funnel.types';

interface FakeSendRow {
  tenant_id: string;
  step_key: string;
  status: string;
  error_message: string | null;
  sent_at: string;
  skipped_reason?: string | null;
  recipient_email?: string | null;
}

/** Minimal in-memory stand-in for the `email_funnel_sends` Supabase table. */
function createFakeSendsQuery(rows: FakeSendRow[]) {
  type Filter = (row: FakeSendRow) => boolean;
  const filters: Filter[] = [];
  let mode: 'select' | 'update' | 'delete' = 'select';
  let patch: Partial<FakeSendRow> = {};
  let orderBy: { column: string; ascending: boolean } | null = null;
  let max: number | null = null;

  const matching = (): FakeSendRow[] => {
    let result = rows.filter((row) => filters.every((fn) => fn(row)));
    if (orderBy) {
      const { column, ascending } = orderBy;
      result = [...result].sort((a, b) => {
        const left = String((a as unknown as Record<string, unknown>)[column]);
        const right = String((b as unknown as Record<string, unknown>)[column]);
        return ascending
          ? left.localeCompare(right)
          : right.localeCompare(left);
      });
    }
    return max === null ? result : result.slice(0, max);
  };

  const run = () => {
    const hit = matching();
    if (mode === 'update') {
      hit.forEach((row) => Object.assign(row, patch));
    }
    if (mode === 'delete') {
      hit.forEach((row) => rows.splice(rows.indexOf(row), 1));
    }
    return hit;
  };

  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push(
        (row) => (row as unknown as Record<string, unknown>)[column] === value,
      );
      return builder;
    },
    neq: (column: string, value: unknown) => {
      filters.push(
        (row) => (row as unknown as Record<string, unknown>)[column] !== value,
      );
      return builder;
    },
    in: (column: string, values: unknown[]) => {
      filters.push((row) =>
        values.includes((row as unknown as Record<string, unknown>)[column]),
      );
      return builder;
    },
    gte: (column: string, value: string) => {
      filters.push(
        (row) =>
          String((row as unknown as Record<string, unknown>)[column]) >= value,
      );
      return builder;
    },
    order: (column: string, options?: { ascending?: boolean }) => {
      orderBy = { column, ascending: options?.ascending ?? true };
      return builder;
    },
    limit: (value: number) => {
      max = value;
      return builder;
    },
    update: (value: Partial<FakeSendRow>) => {
      mode = 'update';
      patch = value;
      return builder;
    },
    delete: () => {
      mode = 'delete';
      return builder;
    },
    insert: (row: FakeSendRow) => {
      const duplicate = rows.some(
        (existing) =>
          existing.tenant_id === row.tenant_id &&
          existing.step_key === row.step_key,
      );
      if (duplicate) {
        return {
          select: () =>
            Promise.resolve({
              data: null,
              error: { code: '23505', message: 'duplicate key' },
            }),
        };
      }
      rows.push({ ...row });
      return {
        select: () => Promise.resolve({ data: [{ id: 'x' }], error: null }),
      };
    },
    upsert: (row: FakeSendRow) => {
      const existing = rows.find(
        (item) =>
          item.tenant_id === row.tenant_id && item.step_key === row.step_key,
      );
      if (existing) {
        Object.assign(existing, row);
      } else {
        rows.push({ ...row });
      }
      return Promise.resolve({ error: null });
    },
    maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
    then: (
      resolve: (value: { data: FakeSendRow[]; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve({ data: run(), error: null }).then(resolve, reject),
  };
  return builder;
}
describe('resolvePreviewTrialEndsAt', () => {
  const now = new Date('2026-11-11T13:00:00.000Z');

  it('uses remaining trial days for days_after_signup (trial_mid = 7)', () => {
    const endsAt = resolvePreviewTrialEndsAt(
      { trigger_type: 'days_after_signup', trigger_offset: 7 },
      now,
    );
    const days =
      (new Date(endsAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(7);
  });

  it('uses trigger offset for days_before_trial_end', () => {
    const endsAt = resolvePreviewTrialEndsAt(
      { trigger_type: 'days_before_trial_end', trigger_offset: 2 },
      now,
    );
    const days =
      (new Date(endsAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(2);
  });
});

describe('EmailFunnelService.sendPreview', () => {
  it('renders the step and sends HTML mail to the requested address', async () => {
    const step: EmailFunnelStepRow = {
      step_key: 'welcome',
      step_number: 1,
      subject: 'Sua conta do Horário Certo está pronta 🎉',
      preheader:
        'Cadastre os serviços, revise os horários e compartilhe o link.',
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
    const maybeSingle = jest
      .fn()
      .mockResolvedValue({ data: step, error: null });

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
    const calls = sendHtmlEmail.mock.calls as Array<[{ html: string }]>;
    const html = calls[0][0].html;
    expect(html).toContain('Configurar minha agenda');
    expect(html).toContain(
      'https://horariocerto.app/admin/configuracoes?tab=hours',
    );
  });
});

describe('EmailFunnelService.sendWelcomeForNewTenant', () => {
  const welcomeStep: EmailFunnelStepRow = {
    step_key: 'welcome',
    step_number: 1,
    subject: 'Sua conta do Horário Certo está pronta',
    preheader: 'Cadastre os serviços, revise os horários e compartilhe o link.',
    title: 'Sua conta está pronta',
    body_text: 'Olá, {{nome}}.',
    body_if_setup: null,
    steps_json: null,
    cta_label: 'Abrir o Início',
    cta_path: '/admin/dashboard',
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
    updated_at: '2026-11-13T00:00:00.000Z',
  };

  const tenant = {
    id: 'tenant-1',
    name: 'Studio',
    slug: 'studio-novo',
    owner_id: 'user-1',
    subscription_status: 'INACTIVE',
    trial_starts_at: '2026-11-13T12:00:00.000Z',
    trial_ends_at: '2026-11-27T12:00:00.000Z',
    created_at: '2026-11-13T12:00:00.000Z',
    trial_email_funnel_opted_out_at: null,
    trial_email_funnel_opt_out_token: 'opt-out',
    initial_setup_booking_link_shared_at: null,
  };

  function buildService(options?: {
    emailConfirmedAt?: string | null;
    steps?: EmailFunnelStepRow[];
    alreadySent?: string[];
    lastSentAt?: string | null;
    extraSends?: FakeSendRow[];
  }) {
    const sends: FakeSendRow[] = (options?.alreadySent ?? []).map((key) => ({
      tenant_id: 'tenant-1',
      step_key: key,
      status: 'sent',
      error_message: null,
      sent_at: options?.lastSentAt ?? '2026-11-01T00:00:00.000Z',
    }));
    if (options?.lastSentAt && !options.alreadySent?.length) {
      sends.push({
        tenant_id: 'tenant-1',
        step_key: 'previous',
        status: 'sent',
        error_message: null,
        sent_at: options.lastSentAt,
      });
    }
    sends.push(...(options?.extraSends ?? []));
    const sendHtmlEmail = jest.fn().mockResolvedValue(undefined);
    const from = jest.fn((table: string) => {
      if (table === 'email_funnel_sends') {
        return createFakeSendsQuery(sends);
      }

      if (table === 'email_funnel_steps') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: welcomeStep, error: null }),
            }),
            order: () =>
              Promise.resolve({
                data: options?.steps ?? [welcomeStep],
                error: null,
              }),
          }),
        };
      }

      if (table === 'tenants') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: tenant, error: null }),
            }),
            is: () => Promise.resolve({ data: [tenant], error: null }),
          }),
        };
      }

      const countResult = { count: 0, error: null };
      const countQuery = {
        select: () => countQuery,
        eq: () => countQuery,
        limit: () => countQuery,
        then: (
          resolve: (value: typeof countResult) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => Promise.resolve(countResult).then(resolve, reject),
      };
      return countQuery;
    });

    const service = new EmailFunnelService(
      {
        getClient: () => ({
          from,
          auth: {
            admin: {
              getUserById: () =>
                Promise.resolve({
                  data: {
                    user: {
                      email: 'dono@gmail.com',
                      email_confirmed_at: options?.emailConfirmedAt ?? null,
                      user_metadata: { full_name: 'Dono Silva' },
                    },
                  },
                  error: null,
                }),
            },
          },
        }),
      } as never,
      { sendHtmlEmail } as unknown as MailService,
      {
        get: (key: string) =>
          key === 'FRONTEND_URL' ? 'https://horariocerto.app' : undefined,
      } as never,
    );

    return { service, sendHtmlEmail, sends };
  }

  it('sends welcome once when the code path and the magic link path both trigger it', async () => {
    const { service, sendHtmlEmail } = buildService({
      emailConfirmedAt: '2026-11-13T18:00:00.000Z',
    });

    await service.sendWelcomeForNewTenant({
      tenantId: 'tenant-1',
      ownerEmail: 'dono@gmail.com',
    });
    await service.sendWelcomeForNewTenant({
      tenantId: 'tenant-1',
      ownerEmail: 'dono@gmail.com',
    });

    expect(sendHtmlEmail).toHaveBeenCalledTimes(1);
    expect(sendHtmlEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'dono@gmail.com',
        subject: 'Sua conta do Horário Certo está pronta',
      }),
    );
  });

  it('does not let the scheduler send welcome before the owner email is confirmed', async () => {
    const { service, sendHtmlEmail } = buildService({
      emailConfirmedAt: null,
    });

    const processed = await service.processDueEmails(
      new Date('2026-11-13T18:00:00.000Z'),
    );

    expect(processed).toBe(0);
    expect(sendHtmlEmail).not.toHaveBeenCalled();
  });

  it('does not send the rest of the sequence in the same evening as welcome', async () => {
    const nudge: EmailFunnelStepRow = {
      ...welcomeStep,
      step_key: 'nudge_agenda',
      step_number: 2,
      subject: 'Já configurou sua agenda?',
    };
    const tutorial: EmailFunnelStepRow = {
      ...welcomeStep,
      step_key: 'tutorial',
      step_number: 4,
      subject: 'Vamos configurar sua agenda juntos',
    };
    const { service, sendHtmlEmail } = buildService({
      emailConfirmedAt: '2026-11-16T22:33:00.000Z',
      steps: [welcomeStep, nudge, tutorial],
      alreadySent: ['welcome'],
      lastSentAt: '2026-11-16T22:33:00.000Z',
    });

    const processed = await service.processDueEmails(
      new Date('2026-11-16T23:00:00.000Z'),
    );

    expect(processed).toBe(0);
    expect(sendHtmlEmail).not.toHaveBeenCalled();
  });

  it('sends only the next due step once the gap has passed', async () => {
    const nudge: EmailFunnelStepRow = {
      ...welcomeStep,
      step_key: 'nudge_agenda',
      step_number: 2,
      subject: 'Já configurou sua agenda?',
    };
    const tutorial: EmailFunnelStepRow = {
      ...welcomeStep,
      step_key: 'tutorial',
      step_number: 4,
      subject: 'Vamos configurar sua agenda juntos',
    };
    const { service, sendHtmlEmail } = buildService({
      emailConfirmedAt: '2026-11-15T20:00:00.000Z',
      steps: [welcomeStep, nudge, tutorial],
      alreadySent: ['welcome'],
      lastSentAt: '2026-11-15T20:00:00.000Z',
    });

    await service.processDueEmails(new Date('2026-11-16T23:00:00.000Z'));

    expect(sendHtmlEmail).toHaveBeenCalledTimes(1);
    expect(sendHtmlEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Já configurou sua agenda?' }),
    );
  });

  it('sends the welcome only once when two triggers fire at the same time', async () => {
    const { service, sendHtmlEmail } = buildService({
      emailConfirmedAt: '2026-11-13T18:00:00.000Z',
    });

    await Promise.all([
      service.sendWelcomeForNewTenant({
        tenantId: 'tenant-1',
        ownerEmail: 'dono@gmail.com',
      }),
      service.sendWelcomeForNewTenant({
        tenantId: 'tenant-1',
        ownerEmail: 'dono@gmail.com',
      }),
      service.sendWelcomeForNewTenant({
        tenantId: 'tenant-1',
        ownerEmail: 'dono@gmail.com',
      }),
    ]);

    expect(sendHtmlEmail).toHaveBeenCalledTimes(1);
  });

  it('never runs two scheduler passes at the same time', async () => {
    const { service, sendHtmlEmail } = buildService({
      emailConfirmedAt: '2026-11-13T18:00:00.000Z',
    });
    const now = new Date('2026-11-13T18:00:00.000Z');

    await Promise.all([
      service.processDueEmails(now),
      service.processDueEmails(now),
    ]);

    expect(sendHtmlEmail).toHaveBeenCalledTimes(1);
  });

  it('does not send when another funnel e-mail is being sent for the same tenant', async () => {
    const nudge: EmailFunnelStepRow = {
      ...welcomeStep,
      step_key: 'nudge_agenda',
      step_number: 2,
    };
    const { service, sendHtmlEmail, sends } = buildService({
      emailConfirmedAt: '2026-11-16T10:00:00.000Z',
      steps: [welcomeStep, nudge],
      extraSends: [
        {
          tenant_id: 'tenant-1',
          step_key: 'tutorial',
          status: 'sending',
          error_message: null,
          sent_at: '2026-11-16T22:59:00.000Z',
        },
      ],
    });

    await service.processDueEmails(new Date('2026-11-16T23:00:00.000Z'));

    expect(sendHtmlEmail).not.toHaveBeenCalled();
    expect(sends.map((row) => row.step_key)).toEqual(['tutorial']);
  });

  it('does not retry a failed step before the backoff window', async () => {
    const { service, sendHtmlEmail } = buildService({
      emailConfirmedAt: '2026-11-16T10:00:00.000Z',
      extraSends: [
        {
          tenant_id: 'tenant-1',
          step_key: 'welcome',
          status: 'failed',
          error_message: 'SES timeout',
          sent_at: '2026-11-16T22:55:00.000Z',
        },
      ],
    });

    await service.processDueEmails(new Date('2026-11-16T23:00:00.000Z'));
    expect(sendHtmlEmail).not.toHaveBeenCalled();

    await service.processDueEmails(new Date('2026-11-16T23:40:00.000Z'));
    expect(sendHtmlEmail).toHaveBeenCalledTimes(1);
  });
});

describe('isSendReclaimable', () => {
  const now = new Date('2026-11-16T12:00:00.000Z');
  const ago = (minutes: number) =>
    new Date(now.getTime() - minutes * 60_000).toISOString();

  it('never reclaims sent or skipped rows', () => {
    expect(
      isSendReclaimable(
        { status: 'sent', error_message: null, sent_at: ago(999) },
        now,
      ),
    ).toBe(false);
    expect(
      isSendReclaimable(
        { status: 'skipped', error_message: null, sent_at: ago(999) },
        now,
      ),
    ).toBe(false);
  });

  it('reclaims failed after 30 min and stale sending after 15 min', () => {
    expect(
      isSendReclaimable(
        { status: 'failed', error_message: 'x', sent_at: ago(10) },
        now,
      ),
    ).toBe(false);
    expect(
      isSendReclaimable(
        { status: 'failed', error_message: 'x', sent_at: ago(31) },
        now,
      ),
    ).toBe(true);
    expect(
      isSendReclaimable(
        { status: 'sending', error_message: null, sent_at: ago(5) },
        now,
      ),
    ).toBe(false);
    expect(
      isSendReclaimable(
        { status: 'sending', error_message: null, sent_at: ago(16) },
        now,
      ),
    ).toBe(true);
  });
});
