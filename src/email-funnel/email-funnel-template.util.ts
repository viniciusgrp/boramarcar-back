import Handlebars from 'handlebars';
import {
  BRAND_CONTACT_EMAIL,
  BRAND_NAME,
  BRAND_SITE_DOMAIN,
} from '../common/brand.constants';

/**
 * Escapes HTML special characters to prevent XSS
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Adds or merges UTM parameters to a URL
 */
export function addUtmParams(
  url: string,
  utmParams: Record<string, string>,
): string {
  try {
    const urlObj = new URL(url, 'https://placeholder.com');
    for (const [key, value] of Object.entries(utmParams)) {
      if (!urlObj.searchParams.has(key)) {
        urlObj.searchParams.set(key, value);
      }
    }
    return url.startsWith('http')
      ? urlObj.toString()
      : `${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
  } catch {
    return url;
  }
}

/**
 * Gets the trial days remaining from trial_ends_at date
 */
export function getTrialDaysRemaining(trialEndsAt: string | null): number {
  if (!trialEndsAt) {
    return 0;
  }
  const now = new Date();
  const endsAt = new Date(trialEndsAt);
  const diffMs = endsAt.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/** Portuguese singular/plural for "dia" / "dias". */
export function formatDiasLabel(days: number): 'dia' | 'dias' {
  return days === 1 ? 'dia' : 'dias';
}

/** Verb agreement for "resta(m) N dia(s)". */
export function formatRestamLabel(days: number): 'resta' | 'restam' {
  return days === 1 ? 'resta' : 'restam';
}

export function resolveBrandHomeUrl(frontendUrl: string): string {
  return frontendUrl.replace(/\/$/, '') || `https://${BRAND_SITE_DOMAIN}`;
}

export function resolveBrandDomainLabel(frontendUrl: string): string {
  const origin = resolveBrandHomeUrl(frontendUrl);
  try {
    return new URL(origin).hostname || BRAND_SITE_DOMAIN;
  } catch {
    return BRAND_SITE_DOMAIN;
  }
}

/**
 * Safely interpolates variables in text, escaping HTML and handling missing values
 */
export function interpolateVariables(
  text: string,
  variables: Record<string, string>,
  options?: { escapeHtml?: boolean },
): string {
  const shouldEscape = options?.escapeHtml !== false;
  return text.replace(/\{\{([^}]+)\}\}/g, (_match, key) => {
    const trimmedKey = key.trim();
    const value = variables[trimmedKey];
    if (value === undefined) {
      return '';
    }
    return shouldEscape ? escapeHtml(value) : value;
  });
}

const EMAIL_TEMPLATE = `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>{{assunto}}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <style>table,td,p,a,h1,span{font-family:Arial,Helvetica,sans-serif !important;}</style>
  <![endif]-->
  <!--[if !mso]><!-->
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700&amp;family=Inter:wght@400;600;700&amp;display=swap" rel="stylesheet">
  <!--<![endif]-->
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body { margin:0 !important; padding:0 !important; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
    a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
    .hc-link { color:#0F5F58; }
    @media screen and (max-width:480px) {
      .hc-pad { padding-left:20px !important; padding-right:20px !important; }
      .hc-head { padding:24px 20px 16px 20px !important; }
      .hc-h1 { font-size:24px !important; line-height:31px !important; }
      .hc-btn-wrap { width:100% !important; }
      .hc-btn-a { display:block !important; min-width:0 !important; }
      .hc-outer { padding:12px 8px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .hc-body, .hc-outer { background-color:#0B1513 !important; }
      .hc-card, .hc-head { background-color:#12201D !important; border-color:#2F4A44 !important; }
      .hc-txt, .hc-h1 { color:#E8F1EE !important; }
      .hc-muted { color:#A9BDB8 !important; }
      .hc-destaque { background-color:#1C302B !important; border-color:#2F4A44 !important; border-left-color:#F5A524 !important; }
      .hc-num { background-color:#4FD1C0 !important; color:#0B1513 !important; }
      .hc-btn, .hc-btn-a { background-color:#4FD1C0 !important; color:#0B1513 !important; }
      .hc-link { color:#4FD1C0 !important; }
      .hc-foot { border-top-color:#2F4A44 !important; }
      .hc-logo-light { display:none !important; max-height:0 !important; overflow:hidden !important; }
      .hc-logo-dark { display:block !important; max-height:none !important; width:200px !important; height:auto !important; }
    }
    [data-ogsc] .hc-txt, [data-ogsc] .hc-h1 { color:#E8F1EE !important; }
    [data-ogsc] .hc-muted { color:#A9BDB8 !important; }
    [data-ogsc] .hc-logo-light { display:none !important; }
    [data-ogsc] .hc-logo-dark { display:block !important; max-height:none !important; }
  </style>
</head>
<body class="hc-body" style="margin:0;padding:0;background-color:#FAF8F3;">
  {{#if preheader}}
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;font-family:sans-serif;">{{{preheader}}}&#8203;&#847;&zwnj;&nbsp;&#8203;&#847;&zwnj;&nbsp;&#8203;&#847;&zwnj;&nbsp;&#8203;&#847;&zwnj;&nbsp;&#8203;&#847;&zwnj;&nbsp;&#8203;&#847;&zwnj;&nbsp;&#8203;&#847;&zwnj;&nbsp;&#8203;&#847;&zwnj;&nbsp;&#8203;&#847;&zwnj;&nbsp;&#8203;&#847;&zwnj;&nbsp;&#8203;&#847;&zwnj;&nbsp;&#8203;&#847;&zwnj;&nbsp;&#8203;&#847;&zwnj;&nbsp;&#8203;&#847;&zwnj;&nbsp;&#8203;&#847;&zwnj;&nbsp;&#8203;&#847;&zwnj;&nbsp;</div>
  {{/if}}

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="hc-outer" style="background-color:#FAF8F3;">
    <tr>
      <td align="center" class="hc-outer" style="padding:32px 16px;">
        <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="hc-card" style="max-width:600px;background-color:#FFFFFF;border:1px solid #E7E3DA;border-radius:16px;border-collapse:separate;">

          <tr>
            <td class="hc-head" align="left" style="padding:32px 40px 20px 40px;background-color:#FFFFFF;border-radius:16px 16px 0 0;">
              <a href="{{{brand_home_url}}}" target="_blank" style="text-decoration:none;">
                <img class="hc-logo-light" src="{{{logo_light_url}}}" width="200" height="33" alt="${BRAND_NAME}" style="display:block;width:200px;height:33px;border:0;font-family:Inter, Arial, Helvetica, sans-serif;font-size:18px;font-weight:700;color:#0F5F58;">
                <!--[if !mso]><!-->
                <img class="hc-logo-dark" src="{{{logo_dark_url}}}" width="200" height="33" alt="${BRAND_NAME}" style="display:none;max-height:0;overflow:hidden;width:200px;height:33px;border:0;mso-hide:all;font-family:Inter, Arial, Helvetica, sans-serif;font-size:18px;font-weight:700;color:#4FD1C0;">
                <!--<![endif]-->
              </a>
            </td>
          </tr>

          <tr>
            <td class="hc-pad" style="padding:4px 40px 16px 40px;">
              <h1 class="hc-h1" style="margin:0;font-family:'Bricolage Grotesque', Inter, Arial, Helvetica, sans-serif;font-size:28px;line-height:35px;font-weight:700;color:#0E1A17;mso-line-height-rule:exactly;">{{{titulo}}}</h1>
            </td>
          </tr>

          <tr>
            <td class="hc-pad" style="padding:0 40px 24px 40px;">
              {{{corpo}}}
            </td>
          </tr>

          {{#if passos}}
          <tr>
            <td class="hc-pad" style="padding:0 40px 24px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
                <tr>
                  <td class="hc-destaque" style="background-color:#F1F8F6;border:1px solid #E3F1EE;border-left:4px solid #F5A524;border-radius:12px;padding:20px 20px 20px 20px;">
                    {{#if passos_intro}}
                    <p class="hc-txt" style="margin:0 0 16px 0;font-family:Inter, Arial, Helvetica, sans-serif;font-size:16px;line-height:26px;font-weight:600;color:#0E1A17;">{{{passos_intro}}}</p>
                    {{/if}}
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    {{#each passos}}<tr>
                      <td valign="top" width="40" style="width:40px;padding:0 12px 12px 0;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                          <td class="hc-num" align="center" valign="middle" width="28" height="28" style="width:28px;height:28px;background-color:#0F5F58;border-radius:14px;font-family:Inter, Arial, Helvetica, sans-serif;font-size:14px;line-height:28px;font-weight:700;color:#FFFFFF;mso-line-height-rule:exactly;">{{numero}}</td>
                        </tr></table>
                      </td>
                      <td valign="top" class="hc-txt" style="padding:3px 0 12px 0;font-family:Inter, Arial, Helvetica, sans-serif;font-size:16px;line-height:24px;color:#0E1A17;"><strong>{{{titulo}}}</strong><br>{{{corpo}}}</td>
                    </tr>{{/each}}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          {{/if}}

          {{#if image_url}}
          <tr>
            <td class="hc-pad" style="padding:0 40px 24px 40px;">
              {{#if media_link_url}}
              <a href="{{{media_link_url}}}" target="_blank" style="text-decoration:none;">
              {{/if}}
                <img src="{{{image_url}}}" width="520" alt="{{image_alt}}" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:12px;outline:none;text-decoration:none;font-family:Inter, Arial, Helvetica, sans-serif;font-size:14px;color:#5E625D;">
              {{#if media_link_url}}
              </a>
              {{/if}}
            </td>
          </tr>
          {{/if}}

          {{#if cta_label}}
          <tr>
            <td class="hc-pad" align="left" style="padding:8px 40px 32px 40px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{{cta_url}}}" style="height:52px;v-text-anchor:middle;width:280px;" arcsize="20%" stroke="f" fillcolor="#0F5F58">
                <w:anchorlock/>
                <center style="color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;">{{{cta_label}}}</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-->
              <table role="presentation" class="hc-btn-wrap" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
                <tr>
                  <td class="hc-btn" align="center" bgcolor="#0F5F58" style="background-color:#0F5F58;border-radius:10px;">
                    <a class="hc-btn-a" href="{{{cta_url}}}" target="_blank" style="display:inline-block;min-width:200px;padding:15px 28px;font-family:Inter, Arial, Helvetica, sans-serif;font-size:16px;line-height:22px;font-weight:700;color:#FFFFFF;text-decoration:none;text-align:center;border-radius:10px;mso-padding-alt:0;">{{{cta_label}}}</a>
                  </td>
                </tr>
              </table>
              <!--<![endif]-->
            </td>
          </tr>
          {{/if}}

          <tr>
            <td class="hc-pad hc-foot" style="padding:24px 40px 32px 40px;border-top:1px solid #E7E3DA;">
              <p class="hc-muted" style="margin:0 0 8px 0;font-family:Inter, Arial, Helvetica, sans-serif;font-size:13px;line-height:20px;color:#5E625D;"><strong>${BRAND_NAME}</strong> &middot; <a class="hc-link" href="{{{brand_home_url}}}" target="_blank" style="color:#0F5F58;text-decoration:underline;">{{brand_domain_label}}</a> &middot; <a class="hc-link" href="mailto:{{contact_email}}" style="color:#0F5F58;text-decoration:underline;">{{contact_email}}</a></p>
              {{#if empresa_endereco}}<p class="hc-muted" style="margin:0 0 8px 0;font-family:Inter, Arial, Helvetica, sans-serif;font-size:13px;line-height:20px;color:#5E625D;">{{{empresa_endereco}}}</p>{{/if}}
              <p class="hc-muted" style="margin:0 0 12px 0;font-family:Inter, Arial, Helvetica, sans-serif;font-size:13px;line-height:20px;color:#5E625D;">Você recebeu este e-mail porque criou uma conta de teste no ${BRAND_NAME}.</p>
              <p style="margin:0;font-family:Inter, Arial, Helvetica, sans-serif;font-size:13px;line-height:20px;"><a class="hc-link" href="{{{unsubscribe_url}}}" ses:no-track target="_blank" style="color:#0F5F58;text-decoration:underline;display:inline-block;padding:12px 0;">Não quero mais receber estes e-mails</a></p>
            </td>
          </tr>

        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;

const compiledTemplate = Handlebars.compile(EMAIL_TEMPLATE);

/**
 * Converts plain text body to HTML paragraphs
 */
function bodyTextToHtml(bodyText: string): string {
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return paragraphs
    .map((para) => {
      const withBreaks = para.replace(/\n/g, '<br>');
      return `<p class="hc-txt" style="margin:0 0 16px 0;font-family:Inter, Arial, Helvetica, sans-serif;font-size:16px;line-height:26px;color:#0E1A17;">${withBreaks}</p>`;
    })
    .join('');
}

export interface RenderEmailTemplateParams {
  assunto: string;
  preheader: string | null;
  titulo: string;
  corpo: string;
  passos?: Array<{ numero: number; titulo: string; corpo: string }>;
  passos_intro?: string;
  image_url?: string;
  image_alt?: string;
  media_link_url?: string;
  cta_label: string;
  cta_url: string;
  unsubscribe_url: string;
  empresa_endereco?: string;
  /** Frontend origin for the current environment (logo + brand link). */
  frontendUrl: string;
}

function resolveTemplateBrandUrls(frontendUrl: string): {
  brand_home_url: string;
  logo_light_url: string;
  logo_dark_url: string;
  brand_domain_label: string;
  contact_email: string;
} {
  const brandHomeUrl = resolveBrandHomeUrl(frontendUrl);
  return {
    brand_home_url: brandHomeUrl,
    logo_light_url: `${brandHomeUrl}/email/logo-horariocerto-400x67.png`,
    logo_dark_url: `${brandHomeUrl}/email/logo-horariocerto-dark-400x67.png`,
    brand_domain_label: resolveBrandDomainLabel(frontendUrl),
    contact_email: BRAND_CONTACT_EMAIL,
  };
}

/**
 * Renders the email HTML using the new Handlebars template
 */
export function renderEmailTemplate(params: RenderEmailTemplateParams): string {
  const corpo = bodyTextToHtml(params.corpo);

  return compiledTemplate({
    ...params,
    ...resolveTemplateBrandUrls(params.frontendUrl),
    corpo,
  });
}

/**
 * Generates a plain text version of the email
 */
export function renderEmailPlainText(params: RenderEmailTemplateParams): string {
  const brand = resolveTemplateBrandUrls(params.frontendUrl);
  let text = `${BRAND_NAME}\n\n`;
  text += `${params.titulo}\n\n`;
  text += `${params.corpo}\n\n`;

  if (params.passos && params.passos.length > 0) {
    if (params.passos_intro) {
      text += `${params.passos_intro}\n\n`;
    }
    params.passos.forEach((passo) => {
      text += `${passo.numero}. ${passo.titulo}\n`;
      text += `${passo.corpo}\n\n`;
    });
  }

  if (params.cta_label && params.cta_url) {
    text += `${params.cta_label}: ${params.cta_url}\n\n`;
  }

  text += `---\n\n`;
  text += `${BRAND_NAME}\n`;
  text += `${brand.brand_home_url}\n`;
  text += `${brand.contact_email}\n\n`;

  if (params.empresa_endereco) {
    text += `${params.empresa_endereco}\n\n`;
  }

  text += `Você recebeu este e-mail porque criou uma conta de teste no ${BRAND_NAME}.\n\n`;
  text += `Descadastrar: ${params.unsubscribe_url}\n`;

  return text;
}
