import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Tenant } from '../tenants/entities/tenant.entity';
import type { MailAppointment } from './entities/mail-appointment.entity';
import { formatTenantAddress } from './utils/format-tenant-address.util';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;

  constructor(private readonly configService: ConfigService) {
    this.transporter = this.createTransporter();
  }

  async sendAppointmentConfirmation(
    appointment: MailAppointment,
    tenant: Tenant,
  ): Promise<void> {
    await this.sendMail({
      to: appointment.customerEmail,
      subject: `Confirmação de Agendamento - ${tenant.name}`,
      html: this.buildAppointmentEmailHtml({
        title: 'Seu agendamento foi confirmado',
        intro:
          'Recebemos sua solicitação com sucesso. Confira os detalhes abaixo:',
        appointment,
        tenant,
      }),
    });
  }

  async sendAppointmentReminder(
    appointment: MailAppointment,
    tenant: Tenant,
  ): Promise<void> {
    await this.sendMail({
      to: appointment.customerEmail,
      subject: 'Lembrete: Seu agendamento é amanhã!',
      html: this.buildAppointmentEmailHtml({
        title: 'Lembrete de agendamento',
        intro: 'Este é um lembrete do seu atendimento marcado para amanhã:',
        appointment,
        tenant,
      }),
    });
  }

  async sendAppointmentPendingReview(
    appointment: MailAppointment,
    tenant: Tenant,
  ): Promise<void> {
    await this.sendMail({
      to: appointment.customerEmail,
      subject: `Agendamento em análise - ${tenant.name}`,
      html: this.buildAppointmentEmailHtml({
        title: 'Seu agendamento está em análise',
        intro:
          'Recebemos sua solicitação e ela será analisada pelo estabelecimento. Você receberá um e-mail assim que for confirmada.',
        appointment,
        tenant,
      }),
    });
  }

  async sendAppointmentPendingApprovalOwner(
    ownerEmail: string,
    appointment: MailAppointment,
    tenant: Tenant,
  ): Promise<void> {
    await this.sendMail({
      to: ownerEmail,
      subject: `Novo agendamento aguardando aprovação - ${tenant.name}`,
      html: this.buildAppointmentEmailHtml({
        title: 'Novo agendamento aguardando aprovação',
        intro:
          'Um cliente solicitou um horário que precisa da sua aprovação. Acesse o painel para aprovar ou recusar.',
        appointment,
        tenant,
      }),
    });
  }

  async sendAppointmentRejection(
    appointment: MailAppointment,
    tenant: Tenant,
  ): Promise<void> {
    await this.sendMail({
      to: appointment.customerEmail,
      subject: `Agendamento não confirmado - ${tenant.name}`,
      html: this.buildAppointmentEmailHtml({
        title: 'Seu agendamento não foi confirmado',
        intro:
          'Infelizmente o estabelecimento não pôde confirmar este horário. Entre em contato para escolher outro momento.',
        appointment,
        tenant,
      }),
    });
  }

  async sendAppointmentCancellationRequestOwner(
    ownerEmail: string,
    appointment: MailAppointment,
    tenant: Tenant,
  ): Promise<void> {
    await this.sendMail({
      to: ownerEmail,
      subject: `Cliente solicitou cancelamento - ${tenant.name}`,
      html: this.buildAppointmentEmailHtml({
        title: 'Cancelamento solicitado pelo cliente',
        intro:
          'Um cliente pediu o cancelamento do agendamento abaixo. Acesse o painel para confirmar o cancelamento ou entrar em contato.',
        appointment,
        tenant,
      }),
    });
  }

  async sendAppointmentCancelledByCustomerOwner(
    ownerEmail: string,
    appointment: MailAppointment,
    tenant: Tenant,
  ): Promise<void> {
    await this.sendMail({
      to: ownerEmail,
      subject: `Agendamento cancelado pelo cliente - ${tenant.name}`,
      html: this.buildAppointmentEmailHtml({
        title: 'Agendamento cancelado pelo cliente',
        intro:
          'Um cliente cancelou o agendamento abaixo. O horário já foi liberado na agenda.',
        appointment,
        tenant,
      }),
    });
  }

  async sendTeamInvite(params: {
    recipientEmail: string;
    tenantName: string;
    inviteUrl: string;
    roleLabel: string;
  }): Promise<void> {
    await this.sendMail({
      to: params.recipientEmail,
      subject: `Convite para a equipe - ${params.tenantName}`,
      html: `
        <div style="font-family: Inter, Arial, sans-serif; line-height: 1.6; color: #111827;">
          <h1 style="font-size: 20px; margin-bottom: 12px;">Você foi convidado para o painel</h1>
          <p style="margin: 0 0 16px;">
            Você recebeu um convite para acessar <strong>${params.tenantName}</strong> como
            <strong>${params.roleLabel}</strong>.
          </p>
          <p style="margin: 0 0 16px;">
            Clique no botão abaixo e entre com sua conta Google para aceitar o convite.
          </p>
          <a
            href="${params.inviteUrl}"
            style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 12px; font-weight: 600;"
          >
            Aceitar convite
          </a>
        </div>
      `,
    });
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  async sendSupportRequest(params: {
    recipientEmail: string;
    tenantName: string;
    tenantId: string;
    userRole: string;
    senderName: string;
    senderEmail: string;
    subject: string;
    message: string;
  }): Promise<void> {
    const escapedMessage = params.message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br />');

    await this.sendMail({
      to: params.recipientEmail,
      subject: `[Suporte BoraMarcar] ${params.subject}`,
      replyTo: params.senderEmail,
      html: `
        <div style="font-family: Inter, Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 560px;">
          <h1 style="font-size: 20px; margin: 0 0 12px;">Nova solicitação de suporte</h1>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280; width: 140px;">Estabelecimento</td>
              <td style="padding: 8px 0; font-weight: 600;">${params.tenantName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">ID do tenant</td>
              <td style="padding: 8px 0; font-weight: 600;">${params.tenantId}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Função</td>
              <td style="padding: 8px 0; font-weight: 600;">${params.userRole}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Nome</td>
              <td style="padding: 8px 0; font-weight: 600;">${params.senderName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">E-mail</td>
              <td style="padding: 8px 0; font-weight: 600;">${params.senderEmail}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Assunto</td>
              <td style="padding: 8px 0; font-weight: 600;">${params.subject}</td>
            </tr>
          </table>
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Mensagem</p>
          <div style="padding: 16px; border-radius: 12px; background: #f9fafb; color: #111827;">
            ${escapedMessage}
          </div>
        </div>
      `,
    });
  }

  async sendReferralBonusEarned(params: {
    recipientEmail: string | null;
    recipientName: string;
    points: number;
    tenantName: string;
    role: 'referrer' | 'referee';
  }): Promise<void> {
    const recipient = params.recipientEmail?.trim();

    if (!recipient) {
      return;
    }

    const isReferrer = params.role === 'referrer';
    const title = isReferrer
      ? 'Você ganhou pontos por indicar um amigo!'
      : 'Você ganhou pontos no seu primeiro atendimento!';
    const intro = isReferrer
      ? `Parabéns, ${params.recipientName}! Seu amigo concluiu o primeiro atendimento em ${params.tenantName} e você recebeu ${params.points} pontos de fidelidade.`
      : `Parabéns, ${params.recipientName}! Você concluiu seu primeiro atendimento em ${params.tenantName} e recebeu ${params.points} pontos de fidelidade por ter sido indicado.`;

    await this.sendMail({
      to: recipient,
      subject: `${title} - ${params.tenantName}`,
      html: `
        <div style="font-family: Inter, Arial, sans-serif; line-height: 1.6; color: #111827;">
          <h1 style="font-size: 20px; margin-bottom: 12px;">${title}</h1>
          <p style="margin: 0 0 16px;">${intro}</p>
          <p style="margin: 0; color: #6B7280;">Continue acumulando pontos e aproveite as recompensas do programa de fidelidade.</p>
        </div>
      `,
    });
  }

  private createTransporter(): Transporter | null {
    const host = this.configService.get<string>('SMTP_HOST')?.trim();
    const user = this.configService.get<string>('SMTP_USER')?.trim();
    const pass = this.configService.get<string>('SMTP_PASS')?.trim();
    const portValue = this.configService.get<string>('SMTP_PORT')?.trim();
    const port = portValue ? Number.parseInt(portValue, 10) : 587;

    if (!host || !user || !pass || Number.isNaN(port)) {
      this.logger.warn(
        'SMTP is not fully configured. Appointment emails will be skipped.',
      );
      return null;
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  private async sendMail(params: {
    to: string;
    subject: string;
    html: string;
    replyTo?: string;
  }): Promise<void> {
    const recipient = params.to.trim().toLowerCase();

    if (!recipient) {
      return;
    }

    if (!this.transporter) {
      this.logger.warn(
        `Skipped email "${params.subject}" because SMTP is not configured.`,
      );
      return;
    }

    const from =
      this.configService.get<string>('SMTP_FROM')?.trim() ||
      this.configService.get<string>('SMTP_USER')?.trim();

    if (!from) {
      this.logger.warn(
        `Skipped email "${params.subject}" because SMTP_FROM is not configured.`,
      );
      return;
    }

    const replyTo = params.replyTo?.trim().toLowerCase();

    await this.transporter.sendMail({
      from,
      to: recipient,
      subject: params.subject,
      html: params.html,
      ...(replyTo ? { replyTo } : {}),
    });
  }

  private buildAppointmentEmailHtml(params: {
    title: string;
    intro: string;
    appointment: MailAppointment;
    tenant: Tenant;
  }): string {
    const startTime = parseISO(params.appointment.startTime);
    const formattedDate = format(startTime, "EEEE, dd 'de' MMMM 'de' yyyy", {
      locale: ptBR,
    });
    const formattedTime = format(startTime, 'HH:mm');
    const formattedAddress = formatTenantAddress(params.tenant);

    return `
      <div style="font-family: Inter, Arial, sans-serif; color: #111827; line-height: 1.6; max-width: 560px;">
        <h1 style="font-size: 20px; margin: 0 0 12px;">${params.title}</h1>
        <p style="margin: 0 0 20px; color: #4b5563;">${params.intro}</p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; width: 120px;">Local</td>
            <td style="padding: 8px 0; font-weight: 600;">${params.tenant.name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Data</td>
            <td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Horário</td>
            <td style="padding: 8px 0; font-weight: 600;">${formattedTime}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Serviço</td>
            <td style="padding: 8px 0; font-weight: 600;">${params.appointment.serviceName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Profissional</td>
            <td style="padding: 8px 0; font-weight: 600;">${params.appointment.professionalName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; vertical-align: top;">Endereço</td>
            <td style="padding: 8px 0; font-weight: 600;">${formattedAddress}</td>
          </tr>
        </table>
        <p style="margin: 0; color: #6b7280; font-size: 14px;">
          Cliente: ${params.appointment.customerName}
        </p>
      </div>
    `;
  }
}
