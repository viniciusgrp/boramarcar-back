import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { randomInt, randomBytes } from 'crypto';
import type { ProfessionalBookingAcceptanceType } from '../booking/entities/booking-acceptance-type.type';
import { resolveEffectiveBookingAcceptance } from '../booking/utils/resolve-booking-acceptance.util';
import {
  addDays,
  addHours,
  addMinutes,
  format,
  isAfter,
  parse,
} from 'date-fns';
import { BillingService } from '../billing/billing.service';
import { CustomersService } from '../customers/customers.service';
import type { Customer } from '../loyalty/entities/customer.entity';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { MailService } from '../mail/mail.service';
import type { Tenant } from '../tenants/entities/tenant.entity';
import { DEFAULT_CALENDAR_CARD_PREFERENCES } from '../tenants/entities/calendar-card-preferences.type';
import { calculateAppointmentCommissionAmount } from '../services/utils/service-commission.util';
import { buildAppointmentCommissionServiceLines } from './utils/appointment-commission.util';
import { buildAppointmentLoyaltyServiceLines } from './utils/appointment-loyalty.util';
import { BusinessHoursService } from '../business-hours/business-hours.service';
import { ProfessionalHoursService } from '../professional-hours/professional-hours.service';
import { ProfessionalAbsencesService } from '../professional-absences/professional-absences.service';
import type { ProfessionalAbsenceRangeDto } from '../professional-absences/dto/professional-absence-range.dto';
import { ProfessionalsService } from '../professionals/professionals.service';
import { normalizeBookingSlotIntervalMinutes } from '../booking/utils/booking-slot-interval.util';
import {
  formatWallClockDate,
  getWallClockNow,
  isSameWallClockDay,
  parseWallClockDateTime,
  wallClockToStorageIso,
} from '../schedule/utils/wall-clock-datetime.util';
import { SupabaseService } from '../supabase/supabase.service';
import { TenantsService } from '../tenants/tenants.service';
import {
  assertProfessionalScope,
  assertProfessionalScopeForMutation,
} from '../tenants/utils/tenant-user-scope.util';
import { canAccessDepositFeatures } from '../tenants/utils/plan-tier.util';
import { FinanceService } from '../finance/finance.service';
import { CreateInternalAppointmentDto } from './dto/create-internal-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import type { BookingSource } from './entities/booking-source.type';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { AdminAppointment } from './entities/admin-appointment.entity';
import type { AppointmentLoyaltyRedeemOptions } from './entities/appointment-loyalty-redeem-options.entity';
import {
  CustomerAppointment,
  CustomerAppointmentScope,
} from './entities/customer-appointment.entity';
import type { CustomerAppointmentGroup } from './entities/customer-appointment-group.entity';
import {
  APPOINTMENT_STATUSES,
  Appointment,
  AppointmentStatus,
} from './entities/appointment.entity';
import type { CreateAppointmentResponse } from './entities/create-appointment-response.entity';
import type { PaymentStatus } from './entities/payment-status.type';
import { ResolvedBookingServices } from './types/resolved-booking-service.type';
import {
  AppointmentServiceRelation,
  SupabaseAppointmentWithRelations,
} from './types/supabase-appointment-row.type';
import type { ReminderAppointmentRow } from './types/reminder-appointment-row.type';
import { DepositPaymentService } from './deposit-payment.service';
import {
  doTimeRangesOverlap,
  isBookingOverlapConstraintError,
} from './utils/booking-slot-overlap.util';
import { DEPOSIT_HOLD_MINUTES } from './utils/deposit-payment-policy';
import { normalizeServiceIds } from './utils/normalize-service-ids.util';
import { resolveInitialAppointmentStatus } from './utils/resolve-initial-appointment-status.util';

const REMINDER_APPOINTMENT_SELECT = `
  id,
  customer_name,
  start_time,
  tenants (
    id,
    name,
    address_cep,
    address_street,
    address_number,
    address_complement,
    address_neighborhood,
    address_city,
    address_state
  ),
  customers ( email ),
  professionals ( name ),
  services!service_id ( name ),
  appointment_services (
    sort_order,
    services!service_id ( name )
  )
`;

const APPOINTMENT_EMAIL_CONTEXT_SELECT = `
  *,
  tenants (*),
  customers (*),
  professionals ( name ),
  services!service_id ( name ),
  appointment_services (
    sort_order,
    services!service_id ( name )
  )
`;

const ADMIN_APPOINTMENT_SELECT = `
  id,
  customer_id,
  professional_id,
  customer_name,
  customer_phone,
  start_time,
  end_time,
  status,
  booking_source,
  total_duration_minutes,
  total_price,
  loyalty_reward_id,
  cancellation_requested_at,
  professionals ( name ),
  services!service_id ( name, duration_minutes, price ),
  appointment_services (
    sort_order,
    duration_minutes,
    price,
    services!service_id ( name )
  )
`;

const CUSTOMER_CANCELLABLE_STATUSES: AppointmentStatus[] = [
  'PENDING',
  'PENDING_PAYMENT',
  'PENDING_APPROVAL',
  'CONFIRMED',
];

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly professionalHoursService: ProfessionalHoursService,
    private readonly businessHoursService: BusinessHoursService,
    private readonly professionalAbsencesService: ProfessionalAbsencesService,
    private readonly professionalsService: ProfessionalsService,
    private readonly tenantsService: TenantsService,
    @Inject(forwardRef(() => BillingService))
    private readonly billingService: BillingService,
    private readonly loyaltyService: LoyaltyService,
    private readonly customersService: CustomersService,
    private readonly financeService: FinanceService,
    private readonly mailService: MailService,
    private readonly depositPaymentService: DepositPaymentService,
  ) {}

  async getAvailability(
    tenantId: string,
    professionalId: string,
    serviceIds: string[],
    date: string,
  ): Promise<string[]> {
    const booking = await this.resolveBookingServices(tenantId, serviceIds);
    const tenant = await this.tenantsService.findById(tenantId);
    const slotIntervalMinutes = normalizeBookingSlotIntervalMinutes(
      tenant?.booking_slot_interval_minutes,
    );

    return this.computeAvailableSlotsForProfessional(
      tenantId,
      professionalId,
      date,
      booking.totalDurationMinutes,
      slotIntervalMinutes,
    );
  }

  async getAvailabilityForAnyProfessional(
    tenantId: string,
    serviceIds: string[],
    date: string,
  ): Promise<string[]> {
    const professionals =
      await this.professionalsService.findActivePerformingAllServices(
        tenantId,
        serviceIds,
      );

    if (professionals.length === 0) {
      return [];
    }

    const booking = await this.resolveBookingServices(tenantId, serviceIds);
    const tenant = await this.tenantsService.findById(tenantId);
    const slotIntervalMinutes = normalizeBookingSlotIntervalMinutes(
      tenant?.booking_slot_interval_minutes,
    );

    const slotSet = new Set<string>();

    for (const professional of professionals) {
      const slots = await this.computeAvailableSlotsForProfessional(
        tenantId,
        professional.id,
        date,
        booking.totalDurationMinutes,
        slotIntervalMinutes,
      );

      for (const slot of slots) {
        slotSet.add(slot);
      }
    }

    return [...slotSet].sort((left, right) => left.localeCompare(right));
  }

  async getAvailableDays(
    tenantId: string,
    serviceIds: string[],
    options: { professionalId?: string; anyProfessional?: boolean },
    daysToScan = 21,
  ): Promise<string[]> {
    const businessHours =
      await this.businessHoursService.findAllByTenant(tenantId);
    const businessOpenWeekdays = new Set(
      businessHours.filter((hour) => !hour.isClosed).map((hour) => hour.dayOfWeek),
    );

    if (businessOpenWeekdays.size === 0) {
      return [];
    }

    const openWeekdays = new Set<number>();

    if (options.anyProfessional) {
      const professionals =
        await this.professionalsService.findActivePerformingAllServices(
          tenantId,
          serviceIds,
        );

      for (const professional of professionals) {
        const weekdays = await this.resolveProfessionalOpenWeekdays(
          tenantId,
          professional.id,
          businessOpenWeekdays,
        );

        for (const weekday of weekdays) {
          openWeekdays.add(weekday);
        }
      }
    } else if (options.professionalId) {
      const weekdays = await this.resolveProfessionalOpenWeekdays(
        tenantId,
        options.professionalId,
        businessOpenWeekdays,
      );

      for (const weekday of weekdays) {
        openWeekdays.add(weekday);
      }
    }

    if (openWeekdays.size === 0) {
      return [];
    }

    const days: string[] = [];
    let cursor = new Date();

    for (let offset = 0; offset < daysToScan; offset += 1) {
      if (openWeekdays.has(cursor.getDay())) {
        days.push(format(cursor, 'yyyy-MM-dd'));
      }

      cursor = addDays(cursor, 1);
    }

    return days;
  }

  private async resolveProfessionalOpenWeekdays(
    tenantId: string,
    professionalId: string,
    businessOpenWeekdays: Set<number>,
  ): Promise<Set<number>> {
    const professionalHours =
      await this.professionalHoursService.findAllByProfessional(
        tenantId,
        professionalId,
      );

    const closedByProfessional = new Set(
      professionalHours
        .filter((hour) => hour.isClosed)
        .map((hour) => hour.dayOfWeek),
    );

    const open = new Set<number>();

    for (const weekday of businessOpenWeekdays) {
      if (!closedByProfessional.has(weekday)) {
        open.add(weekday);
      }
    }

    return open;
  }

  private async computeAvailableSlotsForProfessional(
    tenantId: string,
    professionalId: string,
    date: string,
    durationMinutes: number,
    slotIntervalMinutes: number,
  ): Promise<string[]> {
    const schedule =
      await this.professionalHoursService.getEffectiveScheduleForDate(
        tenantId,
        professionalId,
        date,
      );

    if (!schedule || schedule.isClosed) {
      return [];
    }

    const businessOpen = schedule.openAt;
    const businessClose = schedule.closeAt;

    const dayStartIso = `${date}T00:00:00`;
    const dayEndIso = `${date}T23:59:59`;

    const { data: appointments, error: appointmentsError } =
      await this.supabaseService
        .getClient()
        .from('appointments')
        .select('start_time, end_time')
        .eq('tenant_id', tenantId)
        .eq('professional_id', professionalId)
        .in('status', [
          'PENDING',
          'PENDING_PAYMENT',
          'PENDING_APPROVAL',
          'CONFIRMED',
        ])
        .gte('start_time', dayStartIso)
        .lte('start_time', dayEndIso);

    if (appointmentsError) {
      throw new InternalServerErrorException(appointmentsError.message);
    }

    const bookedSlots = (appointments ?? []) as Pick<
      Appointment,
      'start_time' | 'end_time'
    >[];

    const dayAbsences =
      await this.professionalAbsencesService.findOverlappingForProfessionalOnDate(
        tenantId,
        professionalId,
        date,
      );

    const dayBase = parse(date, 'yyyy-MM-dd', new Date());
    const now = getWallClockNow();
    const availableSlots: string[] = [];
    let slotStart = businessOpen;

    while (!isAfter(addMinutes(slotStart, durationMinutes), businessClose)) {
      const slotEnd = addMinutes(slotStart, durationMinutes);

      const hasConflict = bookedSlots.some((appointment) => {
        const appointmentStart = parseWallClockDateTime(appointment.start_time);
        const appointmentEnd = parseWallClockDateTime(appointment.end_time);
        return slotStart < appointmentEnd && slotEnd > appointmentStart;
      });

      const hasAbsenceConflict = dayAbsences.some((absence) => {
        const absenceStart = parseWallClockDateTime(absence.startsAt);
        const absenceEnd = parseWallClockDateTime(absence.endsAt);
        return slotStart < absenceEnd && slotEnd > absenceStart;
      });

      const isFutureSlot =
        !isSameWallClockDay(dayBase, now) || isAfter(slotStart, now);

      if (!hasConflict && !hasAbsenceConflict && isFutureSlot) {
        availableSlots.push(format(slotStart, 'HH:mm'));
      }

      slotStart = addMinutes(slotStart, slotIntervalMinutes);
    }

    return availableSlots;
  }

  async create(
    dto: CreateAppointmentDto,
    authUserId?: string,
  ): Promise<CreateAppointmentResponse> {
    this.validateCreateDto(dto, authUserId);

    const tenant = await this.tenantsService.findById(dto.tenantId);

    if (!tenant) {
      throw new NotFoundException(
        `Tenant with id "${dto.tenantId}" was not found`,
      );
    }

    if (tenant.require_customer_account && !authUserId) {
      throw new BadRequestException(
        'É necessário entrar ou criar uma conta para agendar neste estabelecimento.',
      );
    }

    if (!authUserId && dto.loyaltyRewardId?.trim()) {
      throw new BadRequestException(
        'Resgate de fidelidade pelo cliente exige conta. O estabelecimento pode aplicar os pontos no atendimento.',
      );
    }

    const serviceIds = normalizeServiceIds(dto);
    const booking = await this.resolveBookingServices(dto.tenantId, serviceIds);

    const startTime = parseWallClockDateTime(dto.startTime);
    const endTime = addMinutes(startTime, booking.totalDurationMinutes);

    let professionalId = dto.professionalId?.trim() ?? '';

    if (dto.assignAnyProfessional) {
      professionalId = await this.assignRandomAvailableProfessional(
        dto.tenantId,
        serviceIds,
        startTime,
        endTime,
      );
    } else {
      if (!professionalId) {
        throw new BadRequestException('Field "professionalId" is required');
      }

      await this.professionalsService.assertProfessionalPerformsAllServices(
        dto.tenantId,
        professionalId,
        serviceIds,
      );
    }

    const hasConflict = await this.hasBookingConflict(
      dto.tenantId,
      professionalId,
      startTime,
      endTime,
    );

    if (hasConflict) {
      throw new ConflictException(
        'Este horário não está mais disponível. Escolha outro horário.',
      );
    }

    const hasAbsenceConflict =
      await this.professionalAbsencesService.hasAbsenceOverlap(
        dto.tenantId,
        professionalId,
        startTime,
        endTime,
      );

    if (hasAbsenceConflict) {
      throw new ConflictException(
        'Este horário não está disponível. O profissional estará ausente.',
      );
    }

    const primaryServiceId = booking.items[0].id;
    const loyaltyRewardId = dto.loyaltyRewardId?.trim() || null;

    const { customer, isNew: isNewCustomer } = authUserId
      ? {
          customer: await this.customersService.resolveForAuthenticatedBooking(
            authUserId,
            dto.tenantId,
            dto.referralCode?.trim() || null,
          ),
          isNew: false,
        }
      : await this.loyaltyService.findOrCreateCustomerForAppointment(
          dto.tenantId,
          dto.customerName?.trim() || '',
          dto.customerPhone?.trim() || '',
          dto.referralCode?.trim() || null,
        );

    if (loyaltyRewardId) {
      await this.loyaltyService.validateRewardForAppointmentBooking({
        tenantId: dto.tenantId,
        customerId: customer.id,
        rewardId: loyaltyRewardId,
        serviceIds,
      });
    }

    const isPaidWithPoints = Boolean(loyaltyRewardId);
    const appointmentTotalPrice = isPaidWithPoints ? 0 : booking.totalPrice;

    const requiresDepositPayment =
      !isPaidWithPoints &&
      canAccessDepositFeatures(
        tenant.plan_tier,
        tenant.deposit_feature_enabled,
      ) &&
      booking.requiresDeposit &&
      booking.totalDepositAmount > 0;

    if (
      requiresDepositPayment &&
      (!tenant.stripe_connect_account_id?.trim() ||
        !tenant.stripe_connect_charges_enabled)
    ) {
      throw new BadRequestException(
        'Este estabelecimento ainda não configurou a conta Stripe para receber sinais.',
      );
    }

    const professionalBookingSettings =
      await this.resolveProfessionalBookingSettings(
        dto.tenantId,
        professionalId,
      );
    const effectiveBookingAcceptance = resolveEffectiveBookingAcceptance(
      tenant.booking_acceptance_type,
      professionalBookingSettings.bookingAcceptanceType,
    );

    const appointmentStatus = resolveInitialAppointmentStatus({
      requiresDepositPayment,
      isPaidWithPoints,
      bookingAcceptanceType: effectiveBookingAcceptance,
    });
    const paymentStatus: PaymentStatus = requiresDepositPayment
      ? 'PENDING'
      : 'PAID';

    const loyaltyFeedback =
      await this.loyaltyService.buildBookingLoyaltyFeedback(
        dto.tenantId,
        appointmentTotalPrice,
        isNewCustomer,
      );

    // Checkout do Stripe expira em 30 min; após isso o slot é liberado pelo cron.
    const holdExpiresAt = requiresDepositPayment
      ? addMinutes(new Date(), DEPOSIT_HOLD_MINUTES).toISOString()
      : null;

    const guestAccessToken = authUserId
      ? null
      : randomBytes(32).toString('hex');

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .insert({
        tenant_id: dto.tenantId,
        professional_id: professionalId,
        service_id: primaryServiceId,
        customer_id: customer.id,
        customer_name: customer.name.trim(),
        customer_phone: customer.phone.trim(),
        start_time: wallClockToStorageIso(startTime),
        end_time: wallClockToStorageIso(endTime),
        status: appointmentStatus,
        deposit_paid: isPaidWithPoints,
        payment_status: paymentStatus,
        booking_source: 'PUBLIC',
        total_duration_minutes: booking.totalDurationMinutes,
        total_price: appointmentTotalPrice,
        loyalty_reward_id: loyaltyRewardId,
        hold_expires_at: holdExpiresAt,
        guest_access_token: guestAccessToken,
      })
      .select('*')
      .single();

    if (error) {
      if (isBookingOverlapConstraintError(error)) {
        throw new ConflictException(
          'Este horário não está mais disponível. Escolha outro horário.',
        );
      }

      throw new InternalServerErrorException(error.message);
    }

    const appointment = this.mapAppointmentRow(data as Appointment);

    await this.insertAppointmentServices(
      appointment.id,
      dto.tenantId,
      booking,
    );

    if (loyaltyRewardId) {
      await this.loyaltyService.redeemRewardForAppointment({
        tenantId: dto.tenantId,
        customerId: customer.id,
        rewardId: loyaltyRewardId,
        appointmentId: appointment.id,
      });
    }

    const serviceName = booking.items.map((item) => item.name).join(' + ');

    this.dispatchAppointmentEmails({
      status: appointmentStatus,
      tenant,
      customer,
      appointment,
      serviceName,
      professionalName: professionalBookingSettings.name,
    });

    if (!requiresDepositPayment) {
      return {
        appointment,
        assignedProfessional: {
          id: professionalId,
          name: professionalBookingSettings.name,
          contact_phone: professionalBookingSettings.contact_phone,
        },
        loyaltyFeedback,
        customerReferralCode:
          await this.loyaltyService.resolveCustomerReferralCodeForAppointment(
            dto.tenantId,
            customer.id,
          ),
        ...(guestAccessToken ? { guestAccessToken } : {}),
      };
    }

    let checkoutUrl: string;

    try {
      checkoutUrl = await this.billingService.createDepositCheckoutSession({
        appointmentId: appointment.id,
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        depositAmountBrl: booking.totalDepositAmount,
      });
    } catch (checkoutError: unknown) {
      await this.depositPaymentService.releasePendingDepositHold(appointment.id);
      this.logger.error(
        `Deposit checkout failed for appointment ${appointment.id}; hold released`,
      );
      throw checkoutError;
    }

    return {
      appointment,
      assignedProfessional: {
        id: professionalId,
        name: professionalBookingSettings.name,
        contact_phone: professionalBookingSettings.contact_phone,
      },
      checkoutUrl,
      loyaltyFeedback,
      customerReferralCode:
        await this.loyaltyService.resolveCustomerReferralCodeForAppointment(
          dto.tenantId,
          customer.id,
        ),
      ...(guestAccessToken ? { guestAccessToken } : {}),
    };
  }

  async confirmDepositPayment(appointmentId: string): Promise<Appointment | null> {
    const result =
      await this.depositPaymentService.confirmDepositPayment(appointmentId);

    if (result.outcome !== 'confirmed' || !result.appointment) {
      return result.appointment;
    }

    const appointment = this.mapAppointmentRow(result.appointment);

    try {
      const context = await this.loadAppointmentEmailContext(
        appointment.tenant_id,
        appointment.id,
      );
      this.dispatchAppointmentConfirmationEmail(context);
    } catch (emailError: unknown) {
      const message =
        emailError instanceof Error
          ? emailError.message
          : 'Unknown deposit confirmation email error';
      this.logger.error(
        `Failed to dispatch confirmation emails after deposit for appointment ${appointment.id}: ${message}`,
      );
    }

    return appointment;
  }

  async confirmDepositPaymentDetailed(appointmentId: string) {
    const result =
      await this.depositPaymentService.confirmDepositPayment(appointmentId);

    if (result.outcome === 'confirmed' && result.appointment) {
      const appointment = this.mapAppointmentRow(result.appointment);

      try {
        const context = await this.loadAppointmentEmailContext(
          appointment.tenant_id,
          appointment.id,
        );
        this.dispatchAppointmentConfirmationEmail(context);
      } catch (emailError: unknown) {
        const message =
          emailError instanceof Error
            ? emailError.message
            : 'Unknown deposit confirmation email error';
        this.logger.error(
          `Failed to dispatch confirmation emails after deposit for appointment ${appointment.id}: ${message}`,
        );
      }

      return { ...result, appointment };
    }

    return result;
  }

  async releasePendingDepositHold(appointmentId: string): Promise<boolean> {
    return this.depositPaymentService.releasePendingDepositHold(appointmentId);
  }

  async markDepositRefunded(appointmentId: string): Promise<Appointment | null> {
    const row =
      await this.depositPaymentService.markDepositRefunded(appointmentId);
    return row ? this.mapAppointmentRow(row) : null;
  }

  async createInternal(
    tenantId: string,
    dto: CreateInternalAppointmentDto,
    scopedProfessionalId?: string,
  ): Promise<AdminAppointment> {
    const serviceIds = normalizeServiceIds(dto);

    if (!dto.professionalId?.trim() || !dto.startTime?.trim()) {
      throw new BadRequestException(
        'Fields "professionalId" and "startTime" are required',
      );
    }

    this.assertAppointmentProfessionalScope(
      scopedProfessionalId,
      dto.professionalId.trim(),
      true,
    );

    if (serviceIds.length === 0) {
      throw new BadRequestException(
        'At least one service must be provided via "serviceIds" or "serviceId"',
      );
    }

    const customer = await this.resolveCustomerForInternal(
      tenantId,
      dto.customerId,
      dto.customerName,
      dto.customerPhone,
    );

    let customerId: string | null = customer.customerId;

    const booking = await this.resolveBookingServices(tenantId, serviceIds);
    const primaryServiceId = booking.items[0].id;

    const startTime = parseWallClockDateTime(dto.startTime);
    const durationMinutes = booking.totalDurationMinutes;
    const endTime = addMinutes(startTime, durationMinutes);
    const dateKey = formatWallClockDate(startTime);

    if (!dto.forceSchedule) {
      const schedule =
        await this.professionalHoursService.getEffectiveScheduleForDate(
          tenantId,
          dto.professionalId,
          dateKey,
        );

      if (!schedule || schedule.isClosed) {
        throw new BadRequestException(
          'O profissional não atende neste dia ou horário. Ative "Forçar agendamento" para emergências.',
        );
      }

      if (startTime < schedule.openAt || endTime > schedule.closeAt) {
        throw new BadRequestException(
          'O horário escolhido está fora da escala do profissional.',
        );
      }
    }

    const hasConflict = await this.hasBookingConflict(
      tenantId,
      dto.professionalId,
      startTime,
      endTime,
    );

    if (hasConflict) {
      throw new ConflictException(
        'Já existe um agendamento neste horário para o profissional.',
      );
    }

    const hasAbsenceConflict =
      await this.professionalAbsencesService.hasAbsenceOverlap(
        tenantId,
        dto.professionalId,
        startTime,
        endTime,
      );

    if (hasAbsenceConflict) {
      throw new BadRequestException(
        'O profissional estará ausente neste horário.',
      );
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .insert({
        tenant_id: tenantId,
        professional_id: dto.professionalId,
        service_id: primaryServiceId,
        customer_id: customerId,
        customer_name: customer.name,
        customer_phone: customer.phone,
        start_time: wallClockToStorageIso(startTime),
        end_time: wallClockToStorageIso(endTime),
        status: 'CONFIRMED',
        deposit_paid: false,
        payment_status: 'PAID',
        booking_source: 'INTERNAL',
        total_duration_minutes: booking.totalDurationMinutes,
        total_price: booking.totalPrice,
      })
      .select(ADMIN_APPOINTMENT_SELECT)
      .single();

    if (error) {
      if (isBookingOverlapConstraintError(error)) {
        throw new ConflictException(
          'Este horário não está mais disponível. Escolha outro horário.',
        );
      }

      throw new InternalServerErrorException(error.message);
    }

    const row = data as SupabaseAppointmentWithRelations;

    await this.insertAppointmentServices(row.id, tenantId, booking);

    return this.mapAdminAppointmentRow(row);
  }

  async findAllByDate(
    tenantId: string,
    date: string,
    scopedProfessionalId?: string,
  ): Promise<AdminAppointment[]> {
    const dayStartIso = `${date}T00:00:00`;
    const dayEndIso = `${date}T23:59:59`;

    let query = this.supabaseService
      .getClient()
      .from('appointments')
      .select(ADMIN_APPOINTMENT_SELECT)
      .eq('tenant_id', tenantId)
      .gte('start_time', dayStartIso)
      .lte('start_time', dayEndIso);

    if (scopedProfessionalId) {
      query = query.eq('professional_id', scopedProfessionalId);
    }

    const { data, error } = await query.order('start_time', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as SupabaseAppointmentWithRelations[];

    return rows.map((row) => this.mapAdminAppointmentRow(row));
  }

  async findConflictingAppointmentsForAbsenceRange(
    tenantId: string,
    professionalId: string,
    dto: ProfessionalAbsenceRangeDto,
    scopedProfessionalId?: string,
  ): Promise<AdminAppointment[]> {
    assertProfessionalScope(scopedProfessionalId, professionalId);

    const { startsAt, endsAt } =
      this.professionalAbsencesService.parseAndValidateRange(dto);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(ADMIN_APPOINTMENT_SELECT)
      .eq('tenant_id', tenantId)
      .eq('professional_id', professionalId)
      .in('status', [...CUSTOMER_CANCELLABLE_STATUSES])
      .lt('start_time', endsAt.toISOString())
      .gt('end_time', startsAt.toISOString())
      .order('start_time', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as SupabaseAppointmentWithRelations[];

    return rows.map((row) => this.mapAdminAppointmentRow(row));
  }

  async findPendingApprovalForAdmin(
    tenantId: string,
    scopedProfessionalId?: string,
  ): Promise<AdminAppointment[]> {
    let query = this.supabaseService
      .getClient()
      .from('appointments')
      .select(ADMIN_APPOINTMENT_SELECT)
      .eq('tenant_id', tenantId)
      .eq('status', 'PENDING_APPROVAL');

    if (scopedProfessionalId) {
      query = query.eq('professional_id', scopedProfessionalId);
    }

    const { data, error } = await query.order('start_time', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as SupabaseAppointmentWithRelations[];

    return rows.map((row) => this.mapAdminAppointmentRow(row));
  }

  async approveAppointmentForTenant(
    tenantId: string,
    appointmentId: string,
    scopedProfessionalId?: string,
  ): Promise<AdminAppointment> {
    const context = await this.loadAppointmentEmailContext(
      tenantId,
      appointmentId,
    );

    this.assertAppointmentProfessionalScope(
      scopedProfessionalId,
      context.appointment.professional_id,
    );

    if (context.appointment.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(
        'Only appointments pending approval can be approved',
      );
    }

    const { error: updateError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .update({ status: 'CONFIRMED' })
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      throw new InternalServerErrorException(updateError.message);
    }

    this.dispatchAppointmentConfirmationEmail(context);

    const appointment = await this.findAdminById(tenantId, appointmentId);

    if (!appointment) {
      throw new NotFoundException(
        `Appointment with id "${appointmentId}" was not found for this tenant`,
      );
    }

    return appointment;
  }

  async rejectAppointmentForTenant(
    tenantId: string,
    appointmentId: string,
    scopedProfessionalId?: string,
  ): Promise<AdminAppointment> {
    const context = await this.loadAppointmentEmailContext(
      tenantId,
      appointmentId,
    );

    this.assertAppointmentProfessionalScope(
      scopedProfessionalId,
      context.appointment.professional_id,
    );

    if (context.appointment.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(
        'Only appointments pending approval can be rejected',
      );
    }

    const { error: updateError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .update({ status: 'CANCELLED' })
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      throw new InternalServerErrorException(updateError.message);
    }

    if (context.appointment.loyalty_reward_id) {
      await this.loyaltyService.refundRedeemedPointsForAppointment({
        tenantId,
        appointmentId,
      });
    }

    this.dispatchAppointmentRejectionEmail(context);

    const appointment = await this.findAdminById(tenantId, appointmentId);

    if (!appointment) {
      throw new NotFoundException(
        `Appointment with id "${appointmentId}" was not found for this tenant`,
      );
    }

    return appointment;
  }

  async findByCustomerForTenant(
    tenantId: string,
    customerId: string,
    scope: CustomerAppointmentScope,
  ): Promise<AdminAppointment[]> {
    const trimmedTenantId = tenantId.trim();
    const trimmedCustomerId = customerId.trim();

    if (!trimmedTenantId || !trimmedCustomerId) {
      throw new BadRequestException(
        'Tenant and customer identifiers are required.',
      );
    }

    await this.customersService.findByIdForTenant(
      trimmedTenantId,
      trimmedCustomerId,
    );

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(ADMIN_APPOINTMENT_SELECT)
      .eq('tenant_id', trimmedTenantId)
      .eq('customer_id', trimmedCustomerId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as SupabaseAppointmentWithRelations[];
    const now = new Date();
    const filtered = rows.filter((row) =>
      this.matchesCustomerAppointmentScope(row, scope, now),
    );

    filtered.sort((left, right) => {
      const leftTime = new Date(left.start_time).getTime();
      const rightTime = new Date(right.start_time).getTime();
      return scope === 'upcoming' ? leftTime - rightTime : rightTime - leftTime;
    });

    return filtered.map((row) => this.mapAdminAppointmentRow(row));
  }

  async findForCustomer(
    authUserId: string,
    tenantId: string,
    scope: CustomerAppointmentScope,
  ): Promise<CustomerAppointment[]> {
    const trimmedTenantId = tenantId.trim();

    if (!trimmedTenantId) {
      throw new BadRequestException('Query parameter "tenantId" is required');
    }

    const customer = await this.customersService.getMe(authUserId, trimmedTenantId);

    if (!customer.customer?.id || !customer.isProfileComplete) {
      throw new BadRequestException(
        'Complete seu perfil antes de visualizar agendamentos.',
      );
    }

    const tenant = await this.tenantsService.findById(trimmedTenantId);

    if (!tenant) {
      throw new NotFoundException('Estabelecimento não encontrado.');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(ADMIN_APPOINTMENT_SELECT)
      .eq('tenant_id', trimmedTenantId)
      .eq('customer_id', customer.customer.id);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as (SupabaseAppointmentWithRelations & {
      cancellation_requested_at?: string | null;
    })[];

    const now = new Date();
    const filtered = rows.filter((row) =>
      this.matchesCustomerAppointmentScope(row, scope, now),
    );

    filtered.sort((left, right) => {
      const leftTime = new Date(left.start_time).getTime();
      const rightTime = new Date(right.start_time).getTime();
      return scope === 'upcoming' ? leftTime - rightTime : rightTime - leftTime;
    });

    return filtered.map((row) =>
      this.mapCustomerAppointmentRow(row, now, {
        id: tenant.id,
        slug: tenant.slug,
        allowCustomerSelfCancellation: tenant.allow_customer_self_cancellation,
      }),
    );
  }

  async findAllForCustomer(
    authUserId: string,
    scope: CustomerAppointmentScope,
  ): Promise<CustomerAppointmentGroup[]> {
    const customerContexts =
      await this.customersService.findAllByAuthUserId(authUserId);

    const eligibleCustomers = customerContexts.filter(
      (context) => context.isProfileComplete,
    );

    if (eligibleCustomers.length === 0) {
      return [];
    }

    const customerIds = eligibleCustomers.map((context) => context.customer.id);
    const tenantByCustomerId = new Map(
      eligibleCustomers.map((context) => [
        context.customer.id,
        {
          id: context.tenantId,
          name: context.tenantName,
          slug: context.tenantSlug,
          allowCustomerSelfCancellation: context.allowCustomerSelfCancellation,
        },
      ]),
    );

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(ADMIN_APPOINTMENT_SELECT)
      .in('customer_id', customerIds);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as (SupabaseAppointmentWithRelations & {
      cancellation_requested_at?: string | null;
      customer_id?: string;
    })[];

    const now = new Date();
    const grouped = new Map<string, CustomerAppointmentGroup>();

    for (const row of rows) {
      if (!this.matchesCustomerAppointmentScope(row, scope, now)) {
        continue;
      }

      const customerId = row.customer_id as string | undefined;
      const tenant = customerId ? tenantByCustomerId.get(customerId) : undefined;

      if (!tenant) {
        continue;
      }

      const existingGroup = grouped.get(tenant.id) ?? {
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        appointments: [],
      };

      existingGroup.appointments.push(
        this.mapCustomerAppointmentRow(row, now, {
          id: tenant.id,
          slug: tenant.slug,
          allowCustomerSelfCancellation: tenant.allowCustomerSelfCancellation,
        }),
      );
      grouped.set(tenant.id, existingGroup);
    }

    const groups = Array.from(grouped.values());

    for (const group of groups) {
      group.appointments.sort((left, right) => {
        const leftTime = new Date(left.startTime).getTime();
        const rightTime = new Date(right.startTime).getTime();
        return scope === 'upcoming' ? leftTime - rightTime : rightTime - leftTime;
      });
    }

    groups.sort((left, right) => {
      const leftTime = left.appointments[0]
        ? new Date(left.appointments[0].startTime).getTime()
        : 0;
      const rightTime = right.appointments[0]
        ? new Date(right.appointments[0].startTime).getTime()
        : 0;

      return scope === 'upcoming' ? leftTime - rightTime : rightTime - leftTime;
    });

    return groups;
  }

  async requestCancellationForCustomer(
    authUserId: string,
    tenantId: string,
    appointmentId: string,
  ): Promise<CustomerAppointment> {
    const trimmedTenantId = tenantId.trim();
    const trimmedAppointmentId = appointmentId.trim();

    if (!trimmedTenantId || !trimmedAppointmentId) {
      throw new BadRequestException(
        'Tenant and appointment identifiers are required.',
      );
    }

    const customer = await this.customersService.getMe(authUserId, trimmedTenantId);

    if (!customer.customer?.id || !customer.isProfileComplete) {
      throw new BadRequestException(
        'Complete seu perfil antes de solicitar cancelamento.',
      );
    }

    const tenant = await this.tenantsService.findById(trimmedTenantId);

    if (!tenant) {
      throw new NotFoundException('Estabelecimento não encontrado.');
    }

    const { data: existing, error: fetchError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(ADMIN_APPOINTMENT_SELECT)
      .eq('id', trimmedAppointmentId)
      .eq('tenant_id', trimmedTenantId)
      .eq('customer_id', customer.customer.id)
      .maybeSingle();

    if (fetchError) {
      throw new InternalServerErrorException(fetchError.message);
    }

    if (!existing) {
      throw new NotFoundException('Agendamento não encontrado.');
    }

    const row = existing as SupabaseAppointmentWithRelations & {
      cancellation_requested_at?: string | null;
    };
    const now = new Date();

    if (!this.canCustomerRequestCancellation(row, now)) {
      if (row.cancellation_requested_at) {
        throw new BadRequestException(
          'O cancelamento deste agendamento já foi solicitado.',
        );
      }

      throw new BadRequestException(
        'Este agendamento não pode mais ser cancelado por aqui.',
      );
    }

    if (tenant.allow_customer_self_cancellation) {
      await this.updateStatusForTenant(
        trimmedTenantId,
        trimmedAppointmentId,
        'CANCELLED',
      );

      const { data: updated, error: reloadError } = await this.supabaseService
        .getClient()
        .from('appointments')
        .select(ADMIN_APPOINTMENT_SELECT)
        .eq('id', trimmedAppointmentId)
        .eq('tenant_id', trimmedTenantId)
        .eq('customer_id', customer.customer.id)
        .maybeSingle();

      if (reloadError) {
        throw new InternalServerErrorException(reloadError.message);
      }

      if (!updated) {
        throw new NotFoundException('Agendamento não encontrado.');
      }

      const context = await this.loadAppointmentEmailContext(
        trimmedTenantId,
        trimmedAppointmentId,
      );

      this.dispatchCustomerCancelledEmail(context);

      return this.mapCustomerAppointmentRow(
        updated as SupabaseAppointmentWithRelations & {
          cancellation_requested_at?: string | null;
        },
        now,
        {
          id: tenant.id,
          slug: tenant.slug,
          allowCustomerSelfCancellation: true,
        },
      );
    }

    const requestedAt = now.toISOString();

    const { error: updateError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .update({ cancellation_requested_at: requestedAt })
      .eq('id', trimmedAppointmentId)
      .eq('tenant_id', trimmedTenantId)
      .eq('customer_id', customer.customer.id);

    if (updateError) {
      throw new InternalServerErrorException(updateError.message);
    }

    const context = await this.loadAppointmentEmailContext(
      trimmedTenantId,
      trimmedAppointmentId,
    );

    this.dispatchCancellationRequestEmail(context);

    return this.mapCustomerAppointmentRow(
      {
        ...row,
        cancellation_requested_at: requestedAt,
      },
      now,
      {
        id: tenant.id,
        slug: tenant.slug,
        allowCustomerSelfCancellation: false,
      },
    );
  }

  async updateStatusForTenant(
    tenantId: string,
    appointmentId: string,
    status: UpdateAppointmentStatusDto['status'],
    scopedProfessionalId?: string,
    loyaltyRewardId?: string | null,
  ): Promise<AdminAppointment> {
    if (!APPOINTMENT_STATUSES.includes(status)) {
      throw new BadRequestException('Invalid appointment status');
    }

    const trimmedLoyaltyRewardId = loyaltyRewardId?.trim() || null;

    if (trimmedLoyaltyRewardId && status !== 'COMPLETED') {
      throw new BadRequestException(
        'Resgate de fidelidade só pode ser aplicado ao concluir o atendimento.',
      );
    }

    const { data: existing, error: fetchError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(
        `
        id,
        status,
        professional_id,
        total_price,
        service_id,
        customer_id,
        customer_name,
        customer_phone,
        loyalty_reward_id,
        services!service_id ( custom_commission_rate, price, loyalty_points_earned ),
        appointment_services (
          service_id,
          price,
          services ( custom_commission_rate, loyalty_points_earned )
        )
      `,
      )
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (fetchError) {
      throw new InternalServerErrorException(fetchError.message);
    }

    if (!existing) {
      throw new NotFoundException(
        `Appointment with id "${appointmentId}" was not found for this tenant`,
      );
    }

    this.assertAppointmentProfessionalScope(
      scopedProfessionalId,
      existing.professional_id,
    );

    const updatePayload: {
      status: UpdateAppointmentStatusDto['status'];
      commission_amount?: number;
      cancellation_requested_at?: null;
      loyalty_reward_id?: string;
      total_price?: number;
      deposit_paid?: boolean;
      payment_status?: PaymentStatus;
    } = { status };

    const isCompletingAppointment =
      status === 'COMPLETED' && existing.status !== 'COMPLETED';
    const isRevertingCompletion =
      existing.status === 'COMPLETED' && status !== 'COMPLETED';
    const isReactivatingCancelled =
      existing.status === 'CANCELLED' && status === 'PENDING';
    const isCancelling =
      status === 'CANCELLED' && existing.status !== 'CANCELLED';
    const isMarkingNoShow =
      status === 'NO_SHOW' && existing.status !== 'NO_SHOW';
    const isReactivatingFromCancelled =
      existing.status === 'CANCELLED' && status !== 'CANCELLED';

    if (isReactivatingCancelled) {
      updatePayload.cancellation_requested_at = null;
    }

    let appliedLoyaltyRewardId: string | null =
      existing.loyalty_reward_id?.trim() || null;

    if (isCompletingAppointment && trimmedLoyaltyRewardId) {
      if (appliedLoyaltyRewardId) {
        throw new BadRequestException(
          'Este agendamento já foi pago com pontos de fidelidade.',
        );
      }

      if (!existing.customer_id) {
        throw new BadRequestException(
          'Não há cliente vinculado para resgatar fidelidade.',
        );
      }

      const serviceIds = (
        Array.isArray(existing.appointment_services)
          ? existing.appointment_services
          : []
      )
        .map(
          (item: { service_id?: string }) =>
            item.service_id?.trim() || '',
        )
        .filter(Boolean);

      if (serviceIds.length === 0 && existing.service_id) {
        serviceIds.push(existing.service_id as string);
      }

      await this.loyaltyService.validateRewardForAppointmentBooking({
        tenantId,
        customerId: existing.customer_id as string,
        rewardId: trimmedLoyaltyRewardId,
        serviceIds,
      });

      updatePayload.loyalty_reward_id = trimmedLoyaltyRewardId;
      updatePayload.total_price = 0;
      updatePayload.deposit_paid = true;
      updatePayload.payment_status = 'PAID';
      appliedLoyaltyRewardId = trimmedLoyaltyRewardId;
    }

    if (isCompletingAppointment) {
      const { data: professional, error: professionalError } =
        await this.supabaseService
          .getClient()
          .from('professionals')
          .select('commission_percent')
          .eq('id', existing.professional_id)
          .eq('tenant_id', tenantId)
          .maybeSingle();

      if (professionalError) {
        throw new InternalServerErrorException(professionalError.message);
      }

      const commissionPercent = Number(professional?.commission_percent ?? 0);
      const serviceLines = buildAppointmentCommissionServiceLines(
        existing as Parameters<typeof buildAppointmentCommissionServiceLines>[0],
      );

      updatePayload.commission_amount = appliedLoyaltyRewardId
        ? 0
        : calculateAppointmentCommissionAmount(
            serviceLines,
            commissionPercent,
          );
    }

    if (isRevertingCompletion) {
      updatePayload.commission_amount = 0;
    }

    const { error: updateError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .update(updatePayload)
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      throw new InternalServerErrorException(updateError.message);
    }

    if (
      isCompletingAppointment &&
      trimmedLoyaltyRewardId &&
      existing.customer_id
    ) {
      await this.loyaltyService.redeemRewardForAppointment({
        tenantId,
        customerId: existing.customer_id as string,
        rewardId: trimmedLoyaltyRewardId,
        appointmentId,
      });
    }

    if (isCompletingAppointment) {
      const tenant = await this.tenantsService.findById(tenantId);

      if (!tenant) {
        throw new NotFoundException('Estabelecimento não encontrado.');
      }

      await this.financeService.recordCompletedAppointmentCashFlow({
        tenantId,
        appointmentId,
        professionalId: existing.professional_id,
        totalPrice: Number(
          appliedLoyaltyRewardId
            ? 0
            : (updatePayload.total_price ?? existing.total_price ?? 0),
        ),
        commissionAmount: Number(updatePayload.commission_amount ?? 0),
        enablePayoutControl: tenant.enable_payout_control,
      });
    }

    if (isCompletingAppointment && !appliedLoyaltyRewardId) {
      const loyaltyServiceLines = buildAppointmentLoyaltyServiceLines(
        existing as Parameters<typeof buildAppointmentLoyaltyServiceLines>[0],
      );

      await this.loyaltyService.awardPointsForCompletedAppointment({
        tenantId,
        appointmentId,
        customerId: existing.customer_id ?? null,
        customerName: existing.customer_name,
        customerPhone: existing.customer_phone,
        totalPrice: Number(existing.total_price ?? 0),
        serviceLines: loyaltyServiceLines,
      });

      if (existing.customer_id) {
        await this.loyaltyService.awardReferralBonusesForFirstCompletedAppointment(
          {
            tenantId,
            appointmentId,
            customerId: existing.customer_id,
          },
        );
      }
    }

    if (isRevertingCompletion && !existing.loyalty_reward_id) {
      await this.loyaltyService.reverseEarnedPointsForCompletedAppointment({
        tenantId,
        appointmentId,
      });
    }

    if (appliedLoyaltyRewardId || existing.loyalty_reward_id) {
      if (isCancelling) {
        await this.loyaltyService.refundRedeemedPointsForAppointment({
          tenantId,
          appointmentId,
        });
      } else if (isMarkingNoShow) {
        const loyaltySettings =
          await this.loyaltyService.getSettingsForTenant(tenantId);

        if (loyaltySettings.refund_points_on_no_show) {
          await this.loyaltyService.refundRedeemedPointsForAppointment({
            tenantId,
            appointmentId,
          });
        }
      } else if (isReactivatingFromCancelled) {
        await this.loyaltyService.restoreRedeemedPointsForAppointment({
          tenantId,
          appointmentId,
        });
      }
    }

    const appointment = await this.findAdminById(tenantId, appointmentId);

    if (!appointment) {
      throw new NotFoundException(
        `Appointment with id "${appointmentId}" was not found for this tenant`,
      );
    }

    return appointment;
  }

  async getLoyaltyRedeemOptionsForAppointment(
    tenantId: string,
    appointmentId: string,
    scopedProfessionalId?: string,
  ): Promise<AppointmentLoyaltyRedeemOptions> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(ADMIN_APPOINTMENT_SELECT)
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Agendamento não encontrado.');
    }

    const row = data as SupabaseAppointmentWithRelations;
    this.assertAppointmentProfessionalScope(
      scopedProfessionalId,
      row.professional_id,
    );

    const settings = await this.loyaltyService.getSettingsForTenant(tenantId);
    const alreadyPaidWithPoints = Boolean(row.loyalty_reward_id);
    const customerId = row.customer_id?.trim() || null;

    if (!settings.is_active || !customerId || alreadyPaidWithPoints) {
      return {
        customerId,
        customerName: row.customer_name,
        pointsBalance: 0,
        isLoyaltyActive: settings.is_active,
        alreadyPaidWithPoints,
        rewards: [],
        suggestedRewardId: null,
      };
    }

    const profile = await this.loyaltyService.getPublicProfileByCustomerId(
      tenantId,
      customerId,
    );

    const { data: serviceRows } = await this.supabaseService
      .getClient()
      .from('appointment_services')
      .select('service_id')
      .eq('appointment_id', appointmentId)
      .eq('tenant_id', tenantId);

    const resolvedServiceIds = (
      (serviceRows as Array<{ service_id: string }> | null) ?? []
    )
      .map((item) => item.service_id)
      .filter(Boolean);

    if (resolvedServiceIds.length === 0) {
      const { data: appt } = await this.supabaseService
        .getClient()
        .from('appointments')
        .select('service_id')
        .eq('id', appointmentId)
        .maybeSingle();

      if (appt?.service_id) {
        resolvedServiceIds.push(appt.service_id as string);
      }
    }

    const balance = profile.customer?.points_balance ?? 0;
    const rewards = (profile.rewards ?? [])
      .filter((reward) => reward.is_active)
      .filter(
        (reward) =>
          reward.service_id !== null &&
          resolvedServiceIds.includes(reward.service_id) &&
          balance >= reward.points_cost,
      )
      .map((reward) => ({
        id: reward.id,
        title: reward.title,
        pointsCost: reward.points_cost,
        serviceId: reward.service_id,
      }));

    return {
      customerId,
      customerName: row.customer_name,
      pointsBalance: balance,
      isLoyaltyActive: true,
      alreadyPaidWithPoints,
      rewards,
      suggestedRewardId: rewards[0]?.id ?? null,
    };
  }

  async findGuestAppointments(params: {
    tenantId: string;
    entries: Array<{ appointmentId: string; accessToken: string }>;
    scope: CustomerAppointmentScope;
  }): Promise<CustomerAppointment[]> {
    const tenantId = params.tenantId.trim();
    const tenant = await this.tenantsService.findById(tenantId);

    if (!tenant) {
      throw new NotFoundException('Estabelecimento não encontrado.');
    }

    const entries = params.entries
      .map((entry) => ({
        appointmentId: entry.appointmentId?.trim() || '',
        accessToken: entry.accessToken?.trim() || '',
      }))
      .filter((entry) => entry.appointmentId && entry.accessToken)
      .slice(0, 50);

    if (entries.length === 0) {
      return [];
    }

    const ids = entries.map((entry) => entry.appointmentId);
    const tokenById = new Map(
      entries.map((entry) => [entry.appointmentId, entry.accessToken]),
    );

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(`${ADMIN_APPOINTMENT_SELECT}, guest_access_token, cancellation_requested_at`)
      .eq('tenant_id', tenantId)
      .in('id', ids);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const now = new Date();
    const rows = (data ?? []) as Array<
      SupabaseAppointmentWithRelations & {
        guest_access_token?: string | null;
        cancellation_requested_at?: string | null;
      }
    >;

    return rows
      .filter((row) => {
        const expected = tokenById.get(row.id);
        return Boolean(
          expected &&
            row.guest_access_token &&
            row.guest_access_token === expected,
        );
      })
      .filter((row) => this.matchesCustomerAppointmentScope(row, params.scope, now))
      .map((row) =>
        this.mapCustomerAppointmentRow(row, now, {
          id: tenant.id,
          slug: tenant.slug,
          allowCustomerSelfCancellation: tenant.allow_customer_self_cancellation,
        }),
      )
      .sort((left, right) => {
        const leftTime = Date.parse(left.startTime);
        const rightTime = Date.parse(right.startTime);
        return params.scope === 'upcoming'
          ? leftTime - rightTime
          : rightTime - leftTime;
      });
  }

  async requestCancellationForGuest(params: {
    tenantId: string;
    appointmentId: string;
    accessToken: string;
  }): Promise<CustomerAppointment> {
    const tenantId = params.tenantId.trim();
    const appointmentId = params.appointmentId.trim();
    const accessToken = params.accessToken.trim();

    if (!tenantId || !appointmentId || !accessToken) {
      throw new BadRequestException(
        'Tenant, agendamento e token de acesso são obrigatórios.',
      );
    }

    const tenant = await this.tenantsService.findById(tenantId);

    if (!tenant) {
      throw new NotFoundException('Estabelecimento não encontrado.');
    }

    const { data: existing, error: fetchError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(`${ADMIN_APPOINTMENT_SELECT}, guest_access_token, cancellation_requested_at`)
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (fetchError) {
      throw new InternalServerErrorException(fetchError.message);
    }

    if (
      !existing ||
      !(existing as { guest_access_token?: string }).guest_access_token ||
      (existing as { guest_access_token?: string }).guest_access_token !==
        accessToken
    ) {
      throw new NotFoundException('Agendamento não encontrado.');
    }

    const row = existing as SupabaseAppointmentWithRelations & {
      cancellation_requested_at?: string | null;
      guest_access_token?: string | null;
    };
    const now = new Date();

    if (!this.canCustomerRequestCancellation(row, now)) {
      if (row.cancellation_requested_at) {
        throw new BadRequestException(
          'O cancelamento deste agendamento já foi solicitado.',
        );
      }

      throw new BadRequestException(
        'Este agendamento não pode mais ser cancelado por aqui.',
      );
    }

    if (tenant.allow_customer_self_cancellation) {
      await this.updateStatusForTenant(tenantId, appointmentId, 'CANCELLED');

      const { data: updated, error: reloadError } = await this.supabaseService
        .getClient()
        .from('appointments')
        .select(`${ADMIN_APPOINTMENT_SELECT}, cancellation_requested_at`)
        .eq('id', appointmentId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (reloadError) {
        throw new InternalServerErrorException(reloadError.message);
      }

      if (!updated) {
        throw new NotFoundException('Agendamento não encontrado.');
      }

      const context = await this.loadAppointmentEmailContext(
        tenantId,
        appointmentId,
      );
      this.dispatchCustomerCancelledEmail(context);

      return this.mapCustomerAppointmentRow(
        updated as SupabaseAppointmentWithRelations & {
          cancellation_requested_at?: string | null;
        },
        now,
        {
          id: tenant.id,
          slug: tenant.slug,
          allowCustomerSelfCancellation: true,
        },
      );
    }

    const requestedAt = now.toISOString();
    const { error: updateError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .update({ cancellation_requested_at: requestedAt })
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      throw new InternalServerErrorException(updateError.message);
    }

    return this.mapCustomerAppointmentRow(
      {
        ...row,
        cancellation_requested_at: requestedAt,
      },
      now,
      {
        id: tenant.id,
        slug: tenant.slug,
        allowCustomerSelfCancellation: false,
      },
    );
  }

  private async findAdminById(
    tenantId: string,
    appointmentId: string,
  ): Promise<AdminAppointment | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(ADMIN_APPOINTMENT_SELECT)
      .eq('tenant_id', tenantId)
      .eq('id', appointmentId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      return null;
    }

    return this.mapAdminAppointmentRow(data as SupabaseAppointmentWithRelations);
  }

  private extractServiceDuration(
    service:
      | { duration_minutes: number; price?: number }
      | { duration_minutes: number; price?: number }[]
      | null,
  ): number {
    if (!service) return 30;
    if (Array.isArray(service)) return service[0]?.duration_minutes ?? 30;
    return service.duration_minutes;
  }

  private extractServicePrice(
    service:
      | { price: number; duration_minutes?: number }
      | { price: number; duration_minutes?: number }[]
      | null,
  ): number {
    if (!service) return 0;
    if (Array.isArray(service)) return Number(service[0]?.price ?? 0);
    return Number(service.price);
  }

  private extractRelationName(
    relation: { name: string } | { name: string }[] | null,
  ): string {
    if (!relation) return '-';
    if (Array.isArray(relation)) return relation[0]?.name ?? '-';
    return relation.name;
  }

  private async resolveCustomerForInternal(
    tenantId: string,
    customerId?: string,
    customerName?: string,
    customerPhone?: string,
  ): Promise<{ customerId: string | null; name: string; phone: string }> {
    const trimmedCustomerId = customerId?.trim();

    if (trimmedCustomerId) {
      const existingCustomer = await this.customersService.findByIdForTenant(
        tenantId,
        trimmedCustomerId,
      );

      return {
        customerId: existingCustomer.id,
        name: customerName?.trim() || existingCustomer.name,
        phone: customerPhone?.trim() || existingCustomer.phone,
      };
    }

    const trimmedName = customerName?.trim() ?? '';
    const phoneDigits = this.normalizePhoneDigits(customerPhone);

    if (phoneDigits) {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('appointments')
        .select('customer_name, customer_phone')
        .eq('tenant_id', tenantId)
        .order('start_time', { ascending: false })
        .limit(200);

      if (error) {
        throw new InternalServerErrorException(error.message);
      }

      const rows = (data ?? []) as Pick<
        Appointment,
        'customer_name' | 'customer_phone'
      >[];

      const existing = rows.find(
        (row) => this.normalizePhoneDigits(row.customer_phone) === phoneDigits,
      );

      const resolvedName = trimmedName || existing?.customer_name || 'Cliente balcão';
      const resolvedPhone = customerPhone?.trim() || existing?.customer_phone || '';

      const loyaltyCustomer =
        await this.loyaltyService.findOrCreateCustomerForAppointment(
          tenantId,
          resolvedName,
          resolvedPhone,
        );

      return {
        customerId: loyaltyCustomer.customer.id,
        name: resolvedName,
        phone: resolvedPhone,
      };
    }

    if (!trimmedName) {
      throw new BadRequestException(
        'Informe o nome do cliente ou um telefone para identificá-lo.',
      );
    }

    return {
      customerId: null,
      name: trimmedName,
      phone: '',
    };
  }

  private normalizePhoneDigits(phone?: string): string {
    return (phone ?? '').replace(/\D/g, '');
  }

  private async hasBookingConflict(
    tenantId: string,
    professionalId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<boolean> {
    const dayStartIso = `${formatWallClockDate(startTime)}T00:00:00`;
    const dayEndIso = `${formatWallClockDate(startTime)}T23:59:59`;

    const { data: appointments, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('start_time, end_time')
      .eq('tenant_id', tenantId)
      .eq('professional_id', professionalId)
      .in('status', [
        'PENDING',
        'PENDING_PAYMENT',
        'PENDING_APPROVAL',
        'CONFIRMED',
      ])
      .gte('start_time', dayStartIso)
      .lte('start_time', dayEndIso);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const bookedSlots = (appointments ?? []) as Pick<
      Appointment,
      'start_time' | 'end_time'
    >[];

    return bookedSlots.some((appointment) => {
      const appointmentStart = parseWallClockDateTime(appointment.start_time);
      const appointmentEnd = parseWallClockDateTime(appointment.end_time);
      return doTimeRangesOverlap(
        startTime,
        endTime,
        appointmentStart,
        appointmentEnd,
      );
    });
  }

  private mapCustomerAppointmentRow(
    row: SupabaseAppointmentWithRelations & {
      cancellation_requested_at?: string | null;
    },
    now: Date,
    tenant?: {
      id: string;
      slug: string;
      allowCustomerSelfCancellation?: boolean;
    },
  ): CustomerAppointment {
    const adminAppointment = this.mapAdminAppointmentRow(row);

    return {
      id: adminAppointment.id,
      startTime: adminAppointment.startTime,
      endTime: adminAppointment.endTime,
      status: adminAppointment.status,
      professionalName: adminAppointment.professionalName,
      serviceName: adminAppointment.serviceName,
      durationMinutes: adminAppointment.durationMinutes,
      cancellationRequestedAt: row.cancellation_requested_at ?? null,
      canRequestCancellation: this.canCustomerRequestCancellation(row, now),
      allowsAutomaticCancellation: Boolean(tenant?.allowCustomerSelfCancellation),
      tenantId: tenant?.id ?? '',
      tenantSlug: tenant?.slug ?? '',
      customerName: adminAppointment.customerName,
      customerPhone: adminAppointment.customerPhone,
    };
  }

  private matchesCustomerAppointmentScope(
    row: SupabaseAppointmentWithRelations & {
      cancellation_requested_at?: string | null;
    },
    scope: CustomerAppointmentScope,
    now: Date,
  ): boolean {
    const isUpcoming = this.isUpcomingCustomerAppointment(row, now);
    return scope === 'upcoming' ? isUpcoming : !isUpcoming;
  }

  private isUpcomingCustomerAppointment(
    row: Pick<SupabaseAppointmentWithRelations, 'start_time' | 'status'>,
    now: Date,
  ): boolean {
    if (!CUSTOMER_CANCELLABLE_STATUSES.includes(row.status as AppointmentStatus)) {
      return false;
    }

    return !isAfter(now, parseWallClockDateTime(row.start_time));
  }

  private canCustomerRequestCancellation(
    row: SupabaseAppointmentWithRelations & {
      cancellation_requested_at?: string | null;
    },
    now: Date,
  ): boolean {
    if (row.cancellation_requested_at) {
      return false;
    }

    return this.isUpcomingCustomerAppointment(row, now);
  }

  private dispatchCancellationRequestEmail(context: {
    tenant: Tenant;
    customer: Customer;
    appointment: Appointment;
    serviceName: string;
    professionalName: string;
  }): void {
    void this.resolveTenantOwnerEmail(context.tenant.owner_id)
      .then((ownerEmail) => {
        if (!ownerEmail) {
          return;
        }

        return this.mailService.sendAppointmentCancellationRequestOwner(
          ownerEmail,
          {
            customerName: context.appointment.customer_name,
            customerEmail: context.customer.email?.trim() ?? '',
            serviceName: context.serviceName,
            professionalName: context.professionalName,
            startTime: context.appointment.start_time,
          },
          context.tenant,
        );
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown cancellation request email error';
        this.logger.error(
          `Failed to send cancellation request for appointment ${context.appointment.id}: ${message}`,
        );
      });
  }

  private dispatchCustomerCancelledEmail(context: {
    tenant: Tenant;
    customer: Customer;
    appointment: Appointment;
    serviceName: string;
    professionalName: string;
  }): void {
    void this.resolveTenantOwnerEmail(context.tenant.owner_id)
      .then((ownerEmail) => {
        if (!ownerEmail) {
          return;
        }

        return this.mailService.sendAppointmentCancelledByCustomerOwner(
          ownerEmail,
          {
            customerName: context.appointment.customer_name,
            customerEmail: context.customer.email?.trim() ?? '',
            serviceName: context.serviceName,
            professionalName: context.professionalName,
            startTime: context.appointment.start_time,
          },
          context.tenant,
        );
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown customer cancellation email error';
        this.logger.error(
          `Failed to send customer cancellation for appointment ${context.appointment.id}: ${message}`,
        );
      });
  }

  private mapAdminAppointmentRow(
    row: SupabaseAppointmentWithRelations,
  ): AdminAppointment {
    const lineItems = this.extractAppointmentLineItems(row);

    return {
      id: row.id,
      customerId: row.customer_id?.trim() ? row.customer_id : null,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status as AppointmentStatus,
      professionalId: row.professional_id,
      professionalName: this.extractRelationName(row.professionals),
      serviceName: lineItems.serviceName,
      durationMinutes: lineItems.durationMinutes,
      servicePrice: lineItems.servicePrice,
      bookingSource: this.normalizeBookingSource(row.booking_source),
      paidWithPoints: Boolean(row.loyalty_reward_id),
    };
  }

  private extractAppointmentLineItems(row: SupabaseAppointmentWithRelations): {
    serviceName: string;
    durationMinutes: number;
    servicePrice: number;
  } {
    const junctionRows = this.normalizeAppointmentServices(
      row.appointment_services,
    );

    if (junctionRows.length > 0) {
      const sorted = [...junctionRows].sort(
        (a, b) => a.sort_order - b.sort_order,
      );

      const durationFromJunction = sorted.reduce(
        (sum, item) => sum + item.duration_minutes,
        0,
      );
      const priceFromJunction = sorted.reduce(
        (sum, item) => sum + Number(item.price),
        0,
      );

      return {
        serviceName: sorted
          .map((item) => this.extractRelationName(item.services))
          .join(' + '),
        durationMinutes:
          row.total_duration_minutes ?? durationFromJunction,
        servicePrice: Number(row.total_price ?? priceFromJunction),
      };
    }

    return {
      serviceName: this.extractRelationName(row.services),
      durationMinutes: this.extractServiceDuration(row.services),
      servicePrice: this.extractServicePrice(row.services),
    };
  }

  private normalizeAppointmentServices(
    relation: AppointmentServiceRelation | null | undefined,
  ): {
    sort_order: number;
    duration_minutes: number;
    price: number;
    services: { name: string } | { name: string }[] | null;
  }[] {
    if (!relation) {
      return [];
    }

    return Array.isArray(relation) ? relation : [relation];
  }

  private async resolveBookingServices(
    tenantId: string,
    serviceIds: string[],
  ): Promise<ResolvedBookingServices> {
    const uniqueIds = [...new Set(serviceIds.map((id) => id.trim()))].filter(
      Boolean,
    );

    if (uniqueIds.length === 0) {
      throw new BadRequestException('At least one service must be selected');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('services')
      .select(
        'id, name, duration_minutes, price, requires_deposit, deposit_amount',
      )
      .eq('tenant_id', tenantId)
      .in('id', uniqueIds);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as {
      id: string;
      name: string;
      duration_minutes: number;
      price: number;
      requires_deposit: boolean;
      deposit_amount: number | null;
    }[];

    if (rows.length !== uniqueIds.length) {
      const found = new Set(rows.map((row) => row.id));
      const missing = uniqueIds.filter((id) => !found.has(id));
      throw new NotFoundException(
        `Service(s) not found for this tenant: ${missing.join(', ')}`,
      );
    }

    const byId = new Map(rows.map((row) => [row.id, row]));
    const items = uniqueIds.map((id) => {
      const row = byId.get(id)!;
      const requiresDeposit = Boolean(row.requires_deposit);
      const depositAmount =
        requiresDeposit && row.deposit_amount !== null
          ? Number(row.deposit_amount)
          : 0;

      return {
        id: row.id,
        name: row.name,
        durationMinutes: row.duration_minutes,
        price: Number(row.price),
        requiresDeposit,
        depositAmount,
      };
    });

    const totalDepositAmount = items.reduce(
      (sum, item) => sum + (item.requiresDeposit ? item.depositAmount : 0),
      0,
    );

    return {
      items,
      totalDurationMinutes: items.reduce(
        (sum, item) => sum + item.durationMinutes,
        0,
      ),
      totalPrice: items.reduce((sum, item) => sum + item.price, 0),
      totalDepositAmount,
      requiresDeposit: items.some((item) => item.requiresDeposit),
    };
  }

  private mapAppointmentRow(row: Appointment): Appointment {
    return {
      ...row,
      payment_status: (row.payment_status ?? 'PENDING') as PaymentStatus,
      commission_amount: Number(row.commission_amount ?? 0),
    };
  }

  private async insertAppointmentServices(
    appointmentId: string,
    tenantId: string,
    booking: ResolvedBookingServices,
  ): Promise<void> {
    const rows = booking.items.map((item, index) => ({
      appointment_id: appointmentId,
      service_id: item.id,
      tenant_id: tenantId,
      duration_minutes: item.durationMinutes,
      price: item.price,
      sort_order: index,
    }));

    const { error } = await this.supabaseService
      .getClient()
      .from('appointment_services')
      .insert(rows);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  async sendDueAppointmentReminders(): Promise<void> {
    const now = new Date();
    const windowStart = addHours(now, 24);
    const windowEnd = addHours(now, 25);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(REMINDER_APPOINTMENT_SELECT)
      .eq('status', 'CONFIRMED')
      .gte('start_time', windowStart.toISOString())
      .lt('start_time', windowEnd.toISOString());

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as ReminderAppointmentRow[];

    for (const row of rows) {
      const tenant = this.extractReminderTenant(row.tenants);
      const customerEmail = this.extractCustomerEmail(row.customers);

      if (!tenant || !customerEmail) {
        continue;
      }

      const serviceName = this.extractReminderServiceName(row);
      const professionalName = this.extractRelationName(row.professionals);

      try {
        await this.mailService.sendAppointmentReminder(
          {
            customerName: row.customer_name,
            customerEmail,
            serviceName,
            professionalName,
            startTime: row.start_time,
          },
          tenant,
        );
      } catch (sendError) {
        const message =
          sendError instanceof Error
            ? sendError.message
            : 'Unknown reminder email error';
        this.logger.error(
          `Failed to send reminder for appointment ${row.id}: ${message}`,
        );
      }
    }
  }

  async expireAbandonedDepositHolds(): Promise<number> {
    return this.depositPaymentService.expireAbandonedDepositHolds();
  }

  private dispatchAppointmentEmails(params: {
    status: AppointmentStatus;
    tenant: Tenant;
    customer: Customer;
    appointment: Appointment;
    serviceName: string;
    professionalName: string;
  }): void {
    if (params.status === 'PENDING_APPROVAL') {
      this.dispatchAppointmentPendingApprovalEmails(params);
      return;
    }

    if (params.status === 'CONFIRMED') {
      this.dispatchAppointmentConfirmationEmail(params);
    }
  }

  private dispatchAppointmentConfirmationEmail(params: {
    tenant: Tenant;
    customer: Customer;
    appointment: Appointment;
    serviceName: string;
    professionalName: string;
  }): void {
    const mailAppointment = {
      customerName: params.appointment.customer_name,
      customerEmail: params.customer.email?.trim() ?? '',
      customerPhone: params.appointment.customer_phone,
      serviceName: params.serviceName,
      professionalName: params.professionalName,
      startTime: params.appointment.start_time,
    };

    if (mailAppointment.customerEmail) {
      void this.mailService
        .sendAppointmentConfirmation(mailAppointment, params.tenant)
        .catch((error: unknown) => {
          const message =
            error instanceof Error
              ? error.message
              : 'Unknown confirmation email error';
          this.logger.error(
            `Failed to send confirmation for appointment ${params.appointment.id}: ${message}`,
          );
        });
    }

    void this.resolveAppointmentResponsibleEmail(
      params.tenant.id,
      params.appointment.professional_id,
      params.tenant.owner_id,
    )
      .then((responsibleEmail) => {
        if (!responsibleEmail) {
          return;
        }

        return this.mailService.sendAppointmentConfirmedResponsible(
          responsibleEmail,
          mailAppointment,
          params.tenant,
        );
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown responsible confirmation email error';
        this.logger.error(
          `Failed to notify responsible for appointment ${params.appointment.id}: ${message}`,
        );
      });
  }

  private dispatchAppointmentPendingApprovalEmails(params: {
    tenant: Tenant;
    customer: Customer;
    appointment: Appointment;
    serviceName: string;
    professionalName: string;
  }): void {
    const mailAppointment = {
      customerName: params.appointment.customer_name,
      customerEmail: params.customer.email?.trim() ?? '',
      serviceName: params.serviceName,
      professionalName: params.professionalName,
      startTime: params.appointment.start_time,
    };

    if (mailAppointment.customerEmail) {
      void this.mailService
        .sendAppointmentPendingReview(mailAppointment, params.tenant)
        .catch((error: unknown) => {
          const message =
            error instanceof Error
              ? error.message
              : 'Unknown pending review email error';
          this.logger.error(
            `Failed to send pending review for appointment ${params.appointment.id}: ${message}`,
          );
        });
    }

    void this.resolveTenantOwnerEmail(params.tenant.owner_id)
      .then((ownerEmail) => {
        if (!ownerEmail) {
          return;
        }

        return this.mailService.sendAppointmentPendingApprovalOwner(
          ownerEmail,
          mailAppointment,
          params.tenant,
        );
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown owner pending approval email error';
        this.logger.error(
          `Failed to notify owner for appointment ${params.appointment.id}: ${message}`,
        );
      });
  }

  private dispatchAppointmentRejectionEmail(params: {
    tenant: Tenant;
    customer: Customer;
    appointment: Appointment;
    serviceName: string;
    professionalName: string;
  }): void {
    const customerEmail = params.customer.email?.trim();

    if (!customerEmail) {
      return;
    }

    void this.mailService
      .sendAppointmentRejection(
        {
          customerName: params.appointment.customer_name,
          customerEmail,
          serviceName: params.serviceName,
          professionalName: params.professionalName,
          startTime: params.appointment.start_time,
        },
        params.tenant,
      )
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Unknown rejection email error';
        this.logger.error(
          `Failed to send rejection for appointment ${params.appointment.id}: ${message}`,
        );
      });
  }

  private async loadAppointmentEmailContext(
    tenantId: string,
    appointmentId: string,
  ): Promise<{
    tenant: Tenant;
    customer: Customer;
    appointment: Appointment;
    serviceName: string;
    professionalName: string;
  }> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(APPOINTMENT_EMAIL_CONTEXT_SELECT)
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException(
        `Appointment with id "${appointmentId}" was not found for this tenant`,
      );
    }

    const row = data as Appointment &
      SupabaseAppointmentWithRelations & {
        tenants: Tenant | Tenant[] | null;
        customers: Customer | Customer[] | null;
      };

    const tenantRelation = row.tenants;
    const tenantRow = Array.isArray(tenantRelation)
      ? tenantRelation[0]
      : tenantRelation;

    if (!tenantRow) {
      throw new NotFoundException('Tenant not found for this appointment');
    }

    const customerRelation = row.customers;
    const customerRow = Array.isArray(customerRelation)
      ? customerRelation[0]
      : customerRelation;

    const lineItems = this.extractAppointmentLineItems(row);

    return {
      tenant: tenantRow as Tenant,
      customer: (customerRow ?? {
        id: row.customer_id ?? '',
        tenant_id: tenantId,
        name: row.customer_name,
        phone: row.customer_phone,
        email: null,
        loyalty_points: 0,
        created_at: '',
        updated_at: '',
      }) as Customer,
      appointment: this.mapAppointmentRow(row),
      serviceName: lineItems.serviceName,
      professionalName: this.extractRelationName(row.professionals),
    };
  }

  private async resolveProfessionalBookingSettings(
    tenantId: string,
    professionalId: string,
  ): Promise<{
    name: string;
    contact_phone: string | null;
    bookingAcceptanceType: ProfessionalBookingAcceptanceType;
  }> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('professionals')
      .select('name, contact_phone, booking_acceptance_type')
      .eq('id', professionalId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException(
        `Professional with id "${professionalId}" was not found`,
      );
    }

    const bookingAcceptanceType = data.booking_acceptance_type;

    return {
      name: data.name?.trim() || 'Profissional',
      contact_phone: data.contact_phone?.trim() || null,
      bookingAcceptanceType:
        bookingAcceptanceType === 'AUTOMATIC' ||
        bookingAcceptanceType === 'MANUAL'
          ? bookingAcceptanceType
          : 'DEFAULT',
    };
  }

  private async resolveAppointmentResponsibleEmail(
    tenantId: string,
    professionalId: string,
    ownerId: string | null,
  ): Promise<string | null> {
    const trimmedProfessionalId = professionalId?.trim();

    if (trimmedProfessionalId) {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('tenant_users')
        .select('user_id')
        .eq('tenant_id', tenantId)
        .eq('professional_id', trimmedProfessionalId)
        .limit(1);

      if (error) {
        throw new InternalServerErrorException(error.message);
      }

      const linkedUserId = data?.[0]?.user_id?.trim();

      if (linkedUserId) {
        const professionalEmail = await this.resolveAuthUserEmail(linkedUserId);

        if (professionalEmail) {
          return professionalEmail;
        }
      }
    }

    return this.resolveTenantOwnerEmail(ownerId);
  }

  private async resolveTenantOwnerEmail(
    ownerId: string | null,
  ): Promise<string | null> {
    return this.resolveAuthUserEmail(ownerId);
  }

  private async resolveAuthUserEmail(
    userId: string | null | undefined,
  ): Promise<string | null> {
    if (!userId?.trim()) {
      return null;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .auth.admin.getUserById(userId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const email = data.user?.email?.trim();

    return email || null;
  }

  private extractReminderTenant(
    relation: ReminderAppointmentRow['tenants'],
  ): Tenant | null {
    if (!relation) {
      return null;
    }

    const row = Array.isArray(relation) ? relation[0] : relation;

    if (!row?.id || !row.name) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      slug: '',
      logo_url: null,
      banner_url: null,
      banner_overlay_color: '#000000',
      banner_overlay_opacity: 0,
      address_cep: row.address_cep,
      address_street: row.address_street,
      address_number: row.address_number,
      address_complement: row.address_complement,
      address_neighborhood: row.address_neighborhood,
      address_city: row.address_city,
      address_state: row.address_state,
      primary_color: '#111827',
      admin_secondary_color_light: '#b45309',
      admin_secondary_color_dark: '#f59e0b',
      contact_phone: null,
      deposit_feature_enabled: false,
      deposit_application_fee_percent: null,
      require_customer_email_confirmation: false,
      require_customer_account: true,
      allow_customer_self_cancellation: false,
      booking_acceptance_type: 'AUTOMATIC',
      booking_slot_interval_minutes: 15,
      owner_id: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      stripe_connect_account_id: null,
      stripe_connect_charges_enabled: false,
      stripe_connect_details_submitted: false,
      subscription_status: 'INACTIVE',
      subscription_expires_at: null,
      trial_starts_at: null,
      trial_ends_at: null,
      pre_subscription_trial_ends_at: null,
      plan_tier: 'SOLO',
      calendar_card_preferences: { ...DEFAULT_CALENDAR_CARD_PREFERENCES },
      enable_payout_control: false,
      payout_frequency: 'WEEKLY',
      enable_referral_program: false,
      referrer_points_bonus: 0,
      referee_points_bonus: 0,
      initial_setup_completed_at: null,
      initial_setup_version: null,
      initial_setup_settings_visited_at: null,
      initial_setup_customer_account_decided_at: null,
      initial_setup_booking_link_shared_at: null,
      created_at: '',
      updated_at: '',
    };
  }

  private extractCustomerEmail(
    relation: ReminderAppointmentRow['customers'],
  ): string | null {
    if (!relation) {
      return null;
    }

    const row = Array.isArray(relation) ? relation[0] : relation;
    const email = row?.email?.trim();

    return email || null;
  }

  private extractReminderServiceName(row: ReminderAppointmentRow): string {
    const junctionRows = this.normalizeAppointmentServices(
      row.appointment_services,
    );

    if (junctionRows.length > 0) {
      const sorted = [...junctionRows].sort(
        (a, b) => a.sort_order - b.sort_order,
      );

      return sorted
        .map((item) => this.extractRelationName(item.services))
        .join(' + ');
    }

    return this.extractRelationName(row.services);
  }

  private normalizeBookingSource(value?: string): BookingSource {
    return value === 'INTERNAL' ? 'INTERNAL' : 'PUBLIC';
  }

  private validateCreateDto(
    dto: CreateAppointmentDto,
    authUserId?: string,
  ): void {
    const requiredFields: (keyof CreateAppointmentDto)[] = ['tenantId', 'startTime'];

    const hasMissingField = requiredFields.some(
      (field) => !dto[field]?.toString().trim(),
    );

    if (hasMissingField) {
      throw new BadRequestException('All appointment fields are required');
    }

    if (!dto.assignAnyProfessional && !dto.professionalId?.trim()) {
      throw new BadRequestException(
        'Field "professionalId" is required unless "assignAnyProfessional" is true',
      );
    }

    if (
      !authUserId &&
      (!dto.customerName?.trim() || !dto.customerPhone?.trim())
    ) {
      throw new BadRequestException(
        'Autenticação ou dados do cliente são obrigatórios para agendar.',
      );
    }

    if (normalizeServiceIds(dto).length === 0) {
      throw new BadRequestException(
        'At least one service must be provided via "serviceIds" or "serviceId"',
      );
    }
  }

  private async assignRandomAvailableProfessional(
    tenantId: string,
    serviceIds: string[],
    startTime: Date,
    endTime: Date,
  ): Promise<string> {
    const professionals =
      await this.professionalsService.findActivePerformingAllServices(
        tenantId,
        serviceIds,
      );

    if (professionals.length === 0) {
      throw new BadRequestException(
        'Nenhum profissional disponível para os serviços selecionados.',
      );
    }

    const dateKey = formatWallClockDate(startTime);
    const availableProfessionalIds: string[] = [];

    for (const professional of professionals) {
      const schedule =
        await this.professionalHoursService.getEffectiveScheduleForDate(
          tenantId,
          professional.id,
          dateKey,
        );

      if (!schedule || schedule.isClosed) {
        continue;
      }

      if (startTime < schedule.openAt || endTime > schedule.closeAt) {
        continue;
      }

      const hasConflict = await this.hasBookingConflict(
        tenantId,
        professional.id,
        startTime,
        endTime,
      );

      if (hasConflict) {
        continue;
      }

      const hasAbsenceConflict =
        await this.professionalAbsencesService.hasAbsenceOverlap(
          tenantId,
          professional.id,
          startTime,
          endTime,
        );

      if (hasAbsenceConflict) {
        continue;
      }

      availableProfessionalIds.push(professional.id);
    }

    if (availableProfessionalIds.length === 0) {
      throw new ConflictException(
        'Este horário não está mais disponível. Escolha outro horário.',
      );
    }

    return availableProfessionalIds[
      randomInt(availableProfessionalIds.length)
    ] as string;
  }

  private assertAppointmentProfessionalScope(
    scopedProfessionalId: string | undefined,
    resourceProfessionalId: string,
    forMutation = false,
  ): void {
    if (forMutation) {
      assertProfessionalScopeForMutation(
        scopedProfessionalId,
        resourceProfessionalId,
      );
      return;
    }

    assertProfessionalScope(scopedProfessionalId, resourceProfessionalId);
  }
}
