import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { Appointment } from './entities/appointment.entity';
import {
  DEPOSIT_CONFIRMABLE_STATUS,
  type DepositConfirmOutcome,
  resolveDepositConfirmOutcome,
} from './utils/deposit-payment-policy';

export interface ConfirmDepositPaymentResult {
  outcome: DepositConfirmOutcome;
  appointment: Appointment | null;
}

@Injectable()
export class DepositPaymentService {
  private readonly logger = new Logger(DepositPaymentService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async confirmDepositPayment(
    appointmentId: string,
  ): Promise<ConfirmDepositPaymentResult> {
    const existing = await this.findById(appointmentId);

    if (!existing) {
      return { outcome: 'not_found', appointment: null };
    }

    const outcome = resolveDepositConfirmOutcome(
      existing.status,
      existing.payment_status,
      existing.deposit_paid,
    );

    if (outcome === 'already_confirmed') {
      return { outcome, appointment: existing };
    }

    if (outcome === 'late_payment_needs_refund') {
      return { outcome, appointment: existing };
    }

    if (outcome !== 'confirmed') {
      this.logger.warn(
        `Ignoring deposit confirmation for appointment ${appointmentId} in status ${existing.status}`,
      );
      return { outcome: 'ignored', appointment: existing };
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .update({
        status: 'CONFIRMED',
        payment_status: 'PAID',
        deposit_paid: true,
        hold_expires_at: null,
      })
      .eq('id', appointmentId)
      .eq('status', DEPOSIT_CONFIRMABLE_STATUS)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      const refreshed = await this.findById(appointmentId);
      const refreshedOutcome = resolveDepositConfirmOutcome(
        refreshed?.status,
        refreshed?.payment_status,
        refreshed?.deposit_paid,
      );

      return {
        outcome: refreshedOutcome === 'confirmed' ? 'ignored' : refreshedOutcome,
        appointment: refreshed,
      };
    }

    return {
      outcome: 'confirmed',
      appointment: data as Appointment,
    };
  }

  async markDepositRefunded(appointmentId: string): Promise<Appointment | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .update({
        payment_status: 'REFUNDED',
        deposit_paid: false,
      })
      .eq('id', appointmentId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data as Appointment | null) ?? null;
  }

  async releasePendingDepositHold(appointmentId: string): Promise<boolean> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .update({ status: 'CANCELLED' })
      .eq('id', appointmentId)
      .eq('status', DEPOSIT_CONFIRMABLE_STATUS)
      .select('id')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return Boolean(data);
  }

  async expireAbandonedDepositHolds(): Promise<number> {
    const now = new Date().toISOString();

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .update({ status: 'CANCELLED' })
      .eq('status', DEPOSIT_CONFIRMABLE_STATUS)
      .not('hold_expires_at', 'is', null)
      .lt('hold_expires_at', now)
      .select('id');

    if (error) {
      throw new InternalServerErrorException(
        `Deposit hold expiration failed: ${error.message}`,
      );
    }

    return (data ?? []).length;
  }

  private async findById(appointmentId: string): Promise<Appointment | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data as Appointment | null) ?? null;
  }
}
