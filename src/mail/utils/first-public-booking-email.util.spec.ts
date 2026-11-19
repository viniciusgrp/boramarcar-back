import {
  buildFirstPublicBookingEmailContent,
  FIRST_PUBLIC_BOOKING_EMAIL_FOOTER,
  FIRST_PUBLIC_BOOKING_EMAIL_SUBJECT,
} from './first-public-booking-email.util';

describe('buildFirstPublicBookingEmailContent', () => {
  it('renders detailed body with wall-clock time and transactional footer', () => {
    const content = buildFirstPublicBookingEmailContent({
      ownerFirstName: 'Ana',
      tenantName: 'Estúdio Exemplo',
      tenantSlug: 'estudio-exemplo',
      frontendUrl: 'https://hml.horariocerto.app',
      customerName: 'Carla Souza',
      serviceName: 'Corte feminino',
      startTimeIso: '2026-11-20T14:00:00.000Z',
    });

    expect(content.subject).toBe(FIRST_PUBLIC_BOOKING_EMAIL_SUBJECT);
    expect(content.html).toContain('Carla marcou Corte feminino para sexta, 20/11, às 14h');
    expect(content.html).toContain('Estúdio Exemplo');
    expect(content.html).toContain(FIRST_PUBLIC_BOOKING_EMAIL_FOOTER);
    expect(content.html).not.toContain('Não quero mais receber estes e-mails');
    expect(content.html).not.toContain('conta de teste');
    expect(content.html).toContain('utm_content=first_booking_received');
    expect(content.html).toContain('utm_campaign=lifecycle');
    expect(content.text).toContain(FIRST_PUBLIC_BOOKING_EMAIL_FOOTER);
  });

  it('uses Olá. when the owner has no name', () => {
    const content = buildFirstPublicBookingEmailContent({
      ownerFirstName: null,
      tenantName: 'Estúdio Exemplo',
      tenantSlug: 'estudio-exemplo',
      frontendUrl: 'https://hml.horariocerto.app',
      customerName: 'Carla',
      serviceName: 'Corte',
      startTimeIso: '2026-11-20T14:30:00.000Z',
    });

    expect(content.html).toContain('Olá.');
    expect(content.html).not.toContain('Olá, olá');
    expect(content.text).toMatch(/^Horário Certo\n\nSeu primeiro cliente/);
    expect(content.text).toContain('Olá.');
    expect(content.text).not.toContain('Olá, .');
  });

  it('falls back to the alternative paragraph when data_hora cannot be built', () => {
    const content = buildFirstPublicBookingEmailContent({
      ownerFirstName: 'Ana',
      tenantName: 'Estúdio Exemplo',
      tenantSlug: 'estudio-exemplo',
      frontendUrl: 'https://hml.horariocerto.app',
      customerName: 'Carla',
      serviceName: 'Corte',
      startTimeIso: 'not-a-date',
    });

    expect(content.html).toContain(
      'Um cliente marcou um horário pela página de Estúdio Exemplo',
    );
    expect(content.html).not.toContain('Carla marcou');
  });
});
