import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TenantAccessContext } from '../tenants/entities/tenant-access-context.entity';
import { USER_ROLE_LABELS } from '../tenants/entities/user-role.type';
import { MailService } from '../mail/mail.service';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';

@Injectable()
export class SupportService {
  constructor(
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async sendRequest(
    context: TenantAccessContext,
    dto: CreateSupportRequestDto,
  ): Promise<void> {
    const name = dto.name.trim();
    const email = dto.email.trim().toLowerCase();
    const subject = dto.subject.trim();
    const message = dto.message.trim();

    if (!name) {
      throw new BadRequestException('Informe seu nome.');
    }

    if (!email) {
      throw new BadRequestException('Informe seu e-mail.');
    }

    if (!subject) {
      throw new BadRequestException('Informe o assunto.');
    }

    if (!message) {
      throw new BadRequestException('Informe a mensagem.');
    }

    if (!this.mailService.isConfigured()) {
      throw new ServiceUnavailableException(
        'O envio de e-mail não está disponível no momento. Tente novamente mais tarde.',
      );
    }

    const recipientEmail =
      this.configService.get<string>('SUPPORT_EMAIL')?.trim() ||
      'support@example.com';

    await this.mailService.sendSupportRequest({
      recipientEmail,
      tenantName: context.tenant.name,
      tenantId: context.tenant.id,
      userRole: USER_ROLE_LABELS[context.tenantUser.role],
      senderName: name,
      senderEmail: email,
      subject,
      message,
    });
  }
}
