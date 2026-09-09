import type { EmailFunnelStepRow } from './email-funnel.types';

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
  trialEndsLabel?: string | null;
}): string {
  const bodySource =
    params.useSetupCopy && params.step.body_if_setup?.trim()
      ? params.step.body_if_setup
      : params.step.body_text;
  const imageUrl = resolveMediaUrl(params.step.image_url, params.frontendUrl);
  const videoUrl = params.step.video_url?.trim() || null;
  const ctaLabel = params.step.cta_label.trim();
  const tutorialSteps = Array.isArray(params.step.steps_json)
    ? params.step.steps_json
    : [];

  const mediaHtml = videoUrl
    ? buildVideoPreviewHtml(videoUrl, imageUrl)
    : imageUrl
      ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
        <tr>
          <td style="border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;line-height:0;">
            <img src="${escapeHtml(imageUrl)}" alt="Agenda do Bora Marcar" width="416" style="display:block;width:100%;max-width:416px;height:auto;border:0;" />
          </td>
        </tr>
      </table>`
      : '';

  const ctaHtml = ctaLabel
    ? `
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 0;">
        <tr>
          <td style="border-radius:12px;background-color:#111827;">
            <a href="${escapeHtml(params.ctaUrl)}" style="display:inline-block;padding:14px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
              ${escapeHtml(ctaLabel)}
            </a>
          </td>
        </tr>
      </table>`
    : '';

  const trialBanner = params.trialEndsLabel
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
        <tr>
          <td style="padding:12px 14px;background-color:#f9fafb;border-radius:10px;">
            <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">
              Fim do teste previsto: ${escapeHtml(params.trialEndsLabel)}
            </p>
          </td>
        </tr>
      </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(params.step.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f9fafb;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f9fafb;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 24px;">
                <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">
                  BoraMarcar
                </p>
                <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;line-height:1.3;color:#111827;">
                  ${escapeHtml(params.step.title)}
                </h1>
                ${paragraphsHtml(bodySource)}
                ${stepsHtml(tutorialSteps)}
                ${mediaHtml}
                ${trialBanner}
                ${ctaHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #f3f4f6;background-color:#fafafa;">
                <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#9ca3af;text-align:center;">
                  Você recebeu este e-mail porque criou uma conta no Bora Marcar.
                </p>
                <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;text-align:center;">
                  <a href="${escapeHtml(params.optOutUrl)}" style="color:#9ca3af;text-decoration:underline;">Não quero receber estes avisos</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
