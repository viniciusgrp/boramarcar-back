import { IsEnum, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import {
  APPOINTMENT_STATUSES,
  type AppointmentStatus,
} from '../entities/appointment.entity';
import {
  APPOINTMENT_PAYMENT_METHODS,
  type AppointmentPaymentMethod,
} from '../entities/payment-status.type';

export class UpdateAppointmentStatusDto {
  @IsEnum(APPOINTMENT_STATUSES)
  status!: AppointmentStatus;

  /** When completing, optionally redeem loyalty points for a reward. */
  @IsOptional()
  @IsUUID()
  loyaltyRewardId?: string;

  /** Forma de pagamento do valor que ainda falta. Obrigatória quando o saldo é maior que zero. */
  @IsOptional()
  @IsEnum(APPOINTMENT_PAYMENT_METHODS)
  paymentMethod?: AppointmentPaymentMethod;

  /** Valor recebido agora. Se omitido, usa o saldo (total com cupom menos o sinal pago). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  paymentAmount?: number;

  /** Caixa aberto que recebe o lançamento. Se omitido, usa o único caixa aberto. */
  @IsOptional()
  @IsUUID()
  cashRegisterId?: string;
}
