import { BRAND_NAME } from '../common/brand.constants';
import type { EmailFunnelStepRow } from './email-funnel.types';
import {
  renderEmailTemplate,
  interpolateVariables,
  addUtmParams,
  getTrialDaysRemaining,
  type RenderEmailTemplateParams,
} from './email-funnel-template.util';

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

function paragraphsHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index, all) => {
      const isLast = index === all.length - 1;
      const emphasize =
        isLast && !block.includes('\n') && block.length < 80
          ? 'color:#111827;font-weight:500;'
          : 'color:#6b7280;';
      const withBreaks = escapeHtml(block).replace(/\n/g, '<br />');
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;${emphasize}">${withBreaks}</p>`;
    })
    .join('');
}

function stepsHtml(
  steps: Array<{ title: string; body: string }>,
): string {
  return steps
    .map((step, index) => {
      const body = step.body.trim()
        ? `<p style="margin:6px 0 0;font-size:14px;line-height:1.55;color:#6b7280;">${escapeHtml(step.body)}</p>`
        : '';
      return `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 12px;background-color:#f9fafb;border-radius:12px;">
          <tr>
            <td style="padding:16px 18px;vertical-align:top;width:36px;">
              <p style="margin:0;font-size:13px;font-weight:600;color:#111827;">${index + 1}</p>
            </td>
            <td style="padding:16px 18px 16px 0;">
              <p style="margin:0;font-size:15px;line-height:1.5;font-weight:500;color:#111827;">${escapeHtml(step.title)}</p>
              ${body}
            </td>
          </tr>
        </table>`;
    })
    .join('');
}

function videoWatchLabel(videoUrl: string): string {
  try {
    const host = new URL(videoUrl).hostname.replace(/^www\./, '');
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
      return 'Assistir no Instagram';
    }
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') {
      return 'Assistir no YouTube';
    }
  } catch {
    // ignore invalid URLs
  }
  return 'Assistir o vídeo';
}

function buildVideoPreviewHtml(
  videoUrl: string,
  imageUrl: string | null,
): string {
  const safeVideoUrl = escapeHtml(videoUrl);
  const watchLabel = escapeHtml(videoWatchLabel(videoUrl));
  const thumbnail = imageUrl
    ? `
      <a href="${safeVideoUrl}" target="_blank" style="display:block;text-decoration:none;line-height:0;">
        <img src="${escapeHtml(imageUrl)}" alt="${watchLabel}" width="416" height="234" border="0" style="display:block;width:100%;max-width:416px;height:auto;border:0;outline:none;" />
      </a>`
    : '';

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 8px;">
      <tr>
        <td style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;line-height:0;background-color:#111827;">
          ${thumbnail}
        </td>
      </tr>
      <tr>
        <td style="padding:16px 0 8px;">
          <table role="presentation" cellspacing="0" cellpadding="0">
            <tr>
              <td style="border-radius:12px;background-color:#111827;">
                <a href="${safeVideoUrl}" style="display:inline-block;padding:14px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
                  ${watchLabel}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

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
  const bodySource =
    params.useSetupCopy && params.step.body_if_setup?.trim()
      ? params.step.body_if_setup
      : params.step.body_text;

  const bookingUrl = params.tenantSlug
    ? `${params.frontendUrl.replace(/\/$/, '')}/${params.tenantSlug}`
    : params.frontendUrl;

  const diasRestantes = getTrialDaysRemaining(params.trialEndsAt);

  const variables: Record<string, string> = {
    nome: params.ownerFirstName || 'olá',
    nome_negocio: params.tenantName || 'seu estabelecimento',
    link_agendamento: bookingUrl,
    dias_restantes: String(diasRestantes),
  };

  const subject = interpolateVariables(params.step.subject, variables);
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
    image_alt: `Agenda do ${BRAND_NAME}`,
    cta_label: ctaLabel,
    cta_url: ctaUrl,
    unsubscribe_url: params.optOutUrl,
    empresa_endereco: params.companyAddress || undefined,
  };

  return renderEmailTemplate(templateParams);
}
