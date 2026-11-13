import { MailService } from '../mail/mail.service';
import {
  EmailFunnelService,
  resolvePreviewTrialEndsAt,
} from './email-funnel.service';
import type { EmailFunnelStepRow } from './email-funnel.types';

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

  function buildService(options?: { emailConfirmedAt?: string | null }) {
    const sentKeys = new Set<string>();
    const sendHtmlEmail = jest.fn().mockResolvedValue(undefined);
    const from = jest.fn((table: string) => {
      if (table === 'email_funnel_sends') {
        const filters: Record<string, string> = {};
        const builder = {
          select: () => builder,
          eq: (column: string, value: string) => {
            filters[column] = value;
            return builder;
          },
          in: () => builder,
          maybeSingle: () =>
            Promise.resolve({
              data: sentKeys.has(filters.step_key)
                ? { id: filters.step_key }
                : null,
              error: null,
            }),
          upsert: (row: { step_key: string; status: string }) => {
            if (row.status === 'sent' || row.status === 'skipped') {
              sentKeys.add(row.step_key);
            }
            return Promise.resolve({ error: null });
          },
        };
        return builder;
      }

      if (table === 'email_funnel_steps') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: welcomeStep, error: null }),
            }),
            order: () => Promise.resolve({ data: [welcomeStep], error: null }),
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

    return { service, sendHtmlEmail };
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
});
