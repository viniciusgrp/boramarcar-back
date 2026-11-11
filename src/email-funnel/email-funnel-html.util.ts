import { BRAND_NAME } from '../common/brand.constants';
import type { EmailFunnelStepRow } from './email-funnel.types';
import {
  renderEmailTemplate,
  renderEmailPlainText,
  interpolateVariables,
  addUtmParams,
  getTrialDaysRemaining,
  formatDiasLabel,
  formatRestamLabel,
  type RenderEmailTemplateParams,
} from './email-funnel-template.util';

/** Per-step image alt text when the asset is more specific than the generic brand label. */
export const EMAIL_FUNNEL_IMAGE_ALTS: Record<string, string> = {
  video_agenda:
    'Agenda do Horário Certo com o dia de Lucas e Rafael, com horários de corte e barba confirmados de manhã e à tarde',
};

export function resolveImageAlt(stepKey: string): string {
  return EMAIL_FUNNEL_IMAGE_ALTS[stepKey] ?? `Agenda do ${BRAND_NAME}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function resolveMediaUrl(
  value: string | null | undefined,
  frontendUrl: string,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const origin = frontendUrl.replace(/\/$/, '');
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${origin}${path}`;
}

export function buildFunnelTemplateVariables(params: {
  trialEndsAt: string | null;
  ownerFirstName: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
  frontendUrl: string;
}): Record<string, string> {
  const bookingUrl = params.tenantSlug
    ? `${params.frontendUrl.replace(/\/$/, '')}/${params.tenantSlug}`
    : params.frontendUrl;

  const diasRestantes = getTrialDaysRemaining(params.trialEndsAt);

  return {
    nome: params.ownerFirstName || 'olá',
    nome_negocio: params.tenantName || 'seu estabelecimento',
    link_agendamento: bookingUrl,
    dias_restantes: String(diasRestantes),
    dias_label: formatDiasLabel(diasRestantes),
    restam_ou_resta: formatRestamLabel(diasRestantes),
  };
}

export interface BuiltEmailFunnelContent {
  subject: string;
  html: string;
  text: string;
}

export function buildEmailFunnelContent(params: {
  step: EmailFunnelStepRow;
  frontendUrl: string;
  ctaUrl: string;
  optOutUrl: string;
  useSetupCopy: boolean;
  trialEndsAt: string | null;
  ownerFirstName: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
  companyAddress: string | null;
}): BuiltEmailFunnelContent {
  const bodySource =
    params.useSetupCopy && params.step.body_if_setup?.trim()
      ? params.step.body_if_setup
      : params.step.body_text;

  const variables = buildFunnelTemplateVariables({
    trialEndsAt: params.trialEndsAt,
    ownerFirstName: params.ownerFirstName,
    tenantName: params.tenantName,
    tenantSlug: params.tenantSlug,
    frontendUrl: params.frontendUrl,
  });

  const subject = interpolateVariables(params.step.subject, variables, {
    escapeHtml: false,
  });
  const preheader = params.step.preheader
    ? interpolateVariables(params.step.preheader, variables)
    : null;
  const title = interpolateVariables(params.step.title, variables);
  const body = interpolateVariables(bodySource, variables);

  const imageUrl = resolveMediaUrl(params.step.image_url, params.frontendUrl);
  const ctaLabel = params.step.cta_label
    ? interpolateVariables(params.step.cta_label, variables)
    : '';

  const ctaUrl = addUtmParams(params.ctaUrl, {
    utm_source: 'email',
    utm_medium: 'lifecycle',
    utm_campaign: 'trial',
    utm_content: params.step.step_key,
  });

  const passos = Array.isArray(params.step.steps_json)
    ? params.step.steps_json.map((step, index) => ({
        numero: index + 1,
        titulo: interpolateVariables(step.title, variables),
        corpo: interpolateVariables(step.body, variables),
      }))
    : undefined;

  const templateParams: RenderEmailTemplateParams = {
    assunto: subject,
    preheader,
    titulo: title,
    corpo: body,
    passos,
    image_url: imageUrl || undefined,
    image_alt: resolveImageAlt(params.step.step_key),
    cta_label: ctaLabel,
    cta_url: ctaUrl,
    unsubscribe_url: params.optOutUrl,
    empresa_endereco: params.companyAddress || undefined,
    frontendUrl: params.frontendUrl,
  };

  return {
    subject,
    html: renderEmailTemplate(templateParams),
    text: renderEmailPlainText({
      ...templateParams,
      // Plain text should not carry HTML-escaped body/title.
      titulo: interpolateVariables(params.step.title, variables, {
        escapeHtml: false,
      }),
      corpo: interpolateVariables(bodySource, variables, { escapeHtml: false }),
      cta_label: params.step.cta_label
        ? interpolateVariables(params.step.cta_label, variables, {
            escapeHtml: false,
          })
        : '',
      passos: Array.isArray(params.step.steps_json)
        ? params.step.steps_json.map((step, index) => ({
            numero: index + 1,
            titulo: interpolateVariables(step.title, variables, {
              escapeHtml: false,
            }),
            corpo: interpolateVariables(step.body, variables, {
              escapeHtml: false,
            }),
          }))
        : undefined,
    }),
  };
}

/** @deprecated Prefer buildEmailFunnelContent for subject + html. */
export function buildEmailFunnelHtml(params: {
  step: EmailFunnelStepRow;
  frontendUrl: string;
  ctaUrl: string;
  optOutUrl: string;
  useSetupCopy: boolean;
  trialEndsAt: string | null;
  ownerFirstName: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
  companyAddress: string | null;
}): string {
  return buildEmailFunnelContent(params).html;
}
