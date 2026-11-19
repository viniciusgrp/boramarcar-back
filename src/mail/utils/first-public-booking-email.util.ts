import { BRAND_NAME } from '../../common/brand.constants';
import {
  addUtmParams,
  interpolateVariables,
  normalizeOwnerGreeting,
  renderEmailPlainText,
  renderEmailTemplate,
} from '../../email-funnel/email-funnel-template.util';
import {
  formatAppointmentWallClockDateTime,
  resolveCustomerFirstName,
} from './format-appointment-wall-clock.util';

export const FIRST_PUBLIC_BOOKING_EMAIL_SUBJECT =
  'Seu primeiro agendamento chegou pelo link';

export const FIRST_PUBLIC_BOOKING_EMAIL_PREHEADER =
  'Um cliente marcou sozinho. Veja como divulgar o link para receber mais.';

export const FIRST_PUBLIC_BOOKING_EMAIL_TITLE =
  'Seu primeiro cliente marcou pelo link.';

export const FIRST_PUBLIC_BOOKING_EMAIL_FOOTER =
  `Você recebeu este e-mail porque um cliente fez um agendamento pela página do seu estabelecimento no ${BRAND_NAME}.`;

const BODY_WITH_DETAILS = `Olá, {{nome}}.

{{nome_cliente}} marcou {{servico}} para {{data_hora}}, pela página de {{nome_negocio}}. O horário já está na sua agenda.

Foi o primeiro cliente a marcar sozinho pelo seu link. Vale mostrar esse link para mais gente.

Três jeitos simples de divulgar:
1. Bio do Instagram: cole o link no campo de link do perfil. Quem chamar no direct já vê onde marcar.
2. Status do WhatsApp: publique o link no status de vez em quando e mande para quem perguntar "tem horário?".
3. QR Code no balcão: no Início, no bloco Divulgação, imprima o QR Code e deixe à vista. Quem está na casa marca o próximo horário na hora.

Seu link: {{link_agendamento}}`;

const BODY_FALLBACK = `Olá, {{nome}}.

Um cliente marcou um horário pela página de {{nome_negocio}}. Ele já está na sua agenda.

Foi o primeiro cliente a marcar sozinho pelo seu link. Vale mostrar esse link para mais gente.

Três jeitos simples de divulgar:
1. Bio do Instagram: cole o link no campo de link do perfil. Quem chamar no direct já vê onde marcar.
2. Status do WhatsApp: publique o link no status de vez em quando e mande para quem perguntar "tem horário?".
3. QR Code no balcão: no Início, no bloco Divulgação, imprima o QR Code e deixe à vista. Quem está na casa marca o próximo horário na hora.

Seu link: {{link_agendamento}}`;

export function buildFirstPublicBookingEmailContent(params: {
  ownerFirstName: string | null;
  tenantName: string;
  tenantSlug: string | null;
  frontendUrl: string;
  customerName: string | null;
  serviceName: string | null;
  startTimeIso: string | null;
}): { subject: string; html: string; text: string } {
  const frontendUrl = params.frontendUrl.replace(/\/$/, '');
  const bookingUrl = params.tenantSlug
    ? `${frontendUrl}/${params.tenantSlug}`
    : frontendUrl;
  const dataHora = params.startTimeIso
    ? formatAppointmentWallClockDateTime(params.startTimeIso)
    : null;
  const servico = params.serviceName?.trim() || '';
  const useDetailedBody = Boolean(dataHora && servico);

  const variables: Record<string, string> = {
    nome: params.ownerFirstName?.trim() || '',
    nome_negocio: params.tenantName || 'seu estabelecimento',
    link_agendamento: bookingUrl,
    nome_cliente: resolveCustomerFirstName(params.customerName),
    servico: servico || 'serviços',
    data_hora: dataHora || '',
  };

  const bodySource = useDetailedBody ? BODY_WITH_DETAILS : BODY_FALLBACK;
  const corpo = normalizeOwnerGreeting(
    interpolateVariables(bodySource, variables, { escapeHtml: false }),
  );
  const titulo = normalizeOwnerGreeting(
    interpolateVariables(FIRST_PUBLIC_BOOKING_EMAIL_TITLE, variables, {
      escapeHtml: false,
    }),
  );
  const preheader = normalizeOwnerGreeting(
    interpolateVariables(FIRST_PUBLIC_BOOKING_EMAIL_PREHEADER, variables, {
      escapeHtml: false,
    }),
  );

  const ctaUrl = addUtmParams(`${frontendUrl}/admin/agenda`, {
    utm_source: 'email',
    utm_medium: 'lifecycle',
    utm_campaign: 'lifecycle',
    utm_content: 'first_booking_received',
  });

  const templateParams = {
    assunto: FIRST_PUBLIC_BOOKING_EMAIL_SUBJECT,
    preheader,
    titulo,
    corpo,
    cta_label: 'Ver na agenda',
    cta_url: ctaUrl,
    transactional_footer: FIRST_PUBLIC_BOOKING_EMAIL_FOOTER,
    frontendUrl,
  };

  return {
    subject: FIRST_PUBLIC_BOOKING_EMAIL_SUBJECT,
    html: renderEmailTemplate(templateParams),
    text: renderEmailPlainText(templateParams),
  };
}
