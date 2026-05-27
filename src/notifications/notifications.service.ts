import { Injectable } from '@nestjs/common';
import { format, parseISO } from 'date-fns';
import { Appointment } from '../appointments/entities/appointment.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { WhatsAppAppointment } from './types/whatsapp-appointment.type';

@Injectable()
export class NotificationsService {
  formatWhatsAppMessage(appointment: Appointment, tenant: Tenant): string {
    void tenant;

    const serviceName =
      (appointment as WhatsAppAppointment).service_name ?? 'serviço';
    const startTime = parseISO(appointment.start_time);
    const dateLabel = format(startTime, 'dd/MM');
    const timeLabel = format(startTime, 'HH:mm');
    const plainText = `Olá! Gostaria de confirmar meu agendamento: ${serviceName}, dia ${dateLabel} às ${timeLabel}.`;

    return encodeURIComponent(plainText);
  }
}
