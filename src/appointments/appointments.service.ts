import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  addMinutes,
  format,
  isAfter,
  parseISO,
} from 'date-fns';
import { BillingService } from '../billing/billing.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { calculateCommissionAmount } from '../professionals/utils/professional-commission.util';
import { ProfessionalHoursService } from '../professional-hours/professional-hours.service';
import { SupabaseService } from '../supabase/supabase.service';
import { TenantsService } from '../tenants/tenants.service';
import { CreateInternalAppointmentDto } from './dto/create-internal-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import type { BookingSource } from './entities/booking-source.type';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { AdminAppointment } from './entities/admin-appointment.entity';
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
import { normalizeServiceIds } from './utils/normalize-service-ids.util';

const ADMIN_APPOINTMENT_SELECT = `
  id,
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
  professionals ( name ),
  services ( name, duration_minutes, price ),
  appointment_services (
    sort_order,
    duration_minutes,
    price,
    services ( name )
  )
`;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly professionalHoursService: ProfessionalHoursService,
    private readonly tenantsService: TenantsService,
    @Inject(forwardRef(() => BillingService))
    private readonly billingService: BillingService,
    private readonly loyaltyService: LoyaltyService,
  ) {}

  async getAvailability(
    tenantId: string,
    professionalId: string,
    serviceIds: string[],
    date: string,
  ): Promise<string[]> {
    const booking = await this.resolveBookingServices(tenantId, serviceIds);
    const durationMinutes = booking.totalDurationMinutes;
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
    const slotIntervalMinutes = 15;

    const dayStartIso = `${date}T00:00:00`;
    const dayEndIso = `${date}T23:59:59`;

    const { data: appointments, error: appointmentsError } =
      await this.supabaseService
        .getClient()
        .from('appointments')
        .select('start_time, end_time')
        .eq('tenant_id', tenantId)
        .eq('professional_id', professionalId)
        .in('status', ['PENDING', 'PENDING_PAYMENT', 'CONFIRMED'])
        .gte('start_time', dayStartIso)
        .lte('start_time', dayEndIso);

    if (appointmentsError) {
      throw new InternalServerErrorException(appointmentsError.message);
    }

    const bookedSlots = (appointments ?? []) as Pick<
      Appointment,
      'start_time' | 'end_time'
    >[];

    const availableSlots: string[] = [];
    let slotStart = businessOpen;

    while (!isAfter(addMinutes(slotStart, durationMinutes), businessClose)) {
      const slotEnd = addMinutes(slotStart, durationMinutes);

      const hasConflict = bookedSlots.some((appointment) => {
        const appointmentStart = new Date(appointment.start_time);
        const appointmentEnd = new Date(appointment.end_time);
        return slotStart < appointmentEnd && slotEnd > appointmentStart;
      });

      if (!hasConflict) {
        availableSlots.push(format(slotStart, 'HH:mm'));
      }

      slotStart = addMinutes(slotStart, slotIntervalMinutes);
    }

    return availableSlots;
  }

  async create(dto: CreateAppointmentDto): Promise<CreateAppointmentResponse> {
    this.validateCreateDto(dto);

    const tenant = await this.tenantsService.findById(dto.tenantId);

    if (!tenant) {
      throw new NotFoundException(
        `Tenant with id "${dto.tenantId}" was not found`,
      );
    }

    const serviceIds = normalizeServiceIds(dto);
    const booking = await this.resolveBookingServices(dto.tenantId, serviceIds);

    const startTime = parseISO(dto.startTime);
    const endTime = addMinutes(startTime, booking.totalDurationMinutes);

    const hasConflict = await this.hasBookingConflict(
      dto.tenantId,
      dto.professionalId,
      startTime,
      endTime,
    );

    if (hasConflict) {
      throw new ConflictException(
        'Este horário não está mais disponível. Escolha outro horário.',
      );
    }

    const primaryServiceId = booking.items[0].id;
    const loyaltyRewardId = dto.loyaltyRewardId?.trim() || null;

    const { customer, isNew: isNewCustomer } =
      await this.loyaltyService.findOrCreateCustomerForAppointment(
        dto.tenantId,
        dto.customerName,
        dto.customerPhone,
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

    let requiresDepositPayment =
      !isPaidWithPoints &&
      tenant.plan_tier === 'ELITE' &&
      booking.requiresDeposit &&
      booking.totalDepositAmount > 0;

    const appointmentStatus: AppointmentStatus = requiresDepositPayment
      ? 'PENDING_PAYMENT'
      : 'CONFIRMED';
    const paymentStatus: PaymentStatus = requiresDepositPayment
      ? 'PENDING'
      : 'PAID';

    const loyaltyFeedback =
      await this.loyaltyService.buildBookingLoyaltyFeedback(
        dto.tenantId,
        appointmentTotalPrice,
        isNewCustomer,
      );

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .insert({
        tenant_id: dto.tenantId,
        professional_id: dto.professionalId,
        service_id: primaryServiceId,
        customer_id: customer.id,
        customer_name: dto.customerName.trim(),
        customer_phone: dto.customerPhone.trim(),
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: appointmentStatus,
        deposit_paid: isPaidWithPoints,
        payment_status: paymentStatus,
        booking_source: 'PUBLIC',
        total_duration_minutes: booking.totalDurationMinutes,
        total_price: appointmentTotalPrice,
        loyalty_reward_id: loyaltyRewardId,
      })
      .select('*')
      .single();

    if (error) {
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

    if (!requiresDepositPayment) {
      return { appointment, loyaltyFeedback };
    }

    const checkoutUrl =
      await this.billingService.createDepositCheckoutSession({
        appointmentId: appointment.id,
        tenantId: tenant.id,
        tenantName: tenant.name,
        depositAmountBrl: booking.totalDepositAmount,
      });

    return { appointment, checkoutUrl, loyaltyFeedback };
  }

  async confirmDepositPayment(appointmentId: string): Promise<Appointment | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .update({
        status: 'CONFIRMED',
        payment_status: 'PAID',
        deposit_paid: true,
      })
      .eq('id', appointmentId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? this.mapAppointmentRow(data as Appointment) : null;
  }

  async createInternal(
    tenantId: string,
    dto: CreateInternalAppointmentDto,
  ): Promise<AdminAppointment> {
    if (!dto.professionalId?.trim() || !dto.serviceId?.trim() || !dto.startTime?.trim()) {
      throw new BadRequestException(
        'Fields "professionalId", "serviceId" and "startTime" are required',
      );
    }

    const customer = await this.resolveCustomerForInternal(
      tenantId,
      dto.customerName,
      dto.customerPhone,
    );

    let customerId: string | null = null;

    if (customer.phone.trim()) {
      const resolvedCustomer =
        await this.loyaltyService.findOrCreateCustomerForAppointment(
          tenantId,
          customer.name,
          customer.phone,
        );
      customerId = resolvedCustomer.customer.id;
    }

    const booking = await this.resolveBookingServices(tenantId, [
      dto.serviceId,
    ]);

    const startTime = parseISO(dto.startTime);
    const durationMinutes = booking.totalDurationMinutes;
    const endTime = addMinutes(startTime, durationMinutes);
    const dateKey = format(startTime, 'yyyy-MM-dd');

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

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .insert({
        tenant_id: tenantId,
        professional_id: dto.professionalId,
        service_id: dto.serviceId,
        customer_id: customerId,
        customer_name: customer.name,
        customer_phone: customer.phone,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
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
      throw new InternalServerErrorException(error.message);
    }

    const row = data as SupabaseAppointmentWithRelations;

    await this.insertAppointmentServices(row.id, tenantId, booking);

    return this.mapAdminAppointmentRow(row);
  }

  async findAllByDate(
    tenantId: string,
    date: string,
  ): Promise<AdminAppointment[]> {
    const dayStartIso = `${date}T00:00:00`;
    const dayEndIso = `${date}T23:59:59`;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(ADMIN_APPOINTMENT_SELECT)
      .eq('tenant_id', tenantId)
      .gte('start_time', dayStartIso)
      .lte('start_time', dayEndIso)
      .order('start_time', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as SupabaseAppointmentWithRelations[];

    return rows.map((row) => this.mapAdminAppointmentRow(row));
  }

  async updateStatusForTenant(
    tenantId: string,
    appointmentId: string,
    status: UpdateAppointmentStatusDto['status'],
  ): Promise<AdminAppointment> {
    if (!APPOINTMENT_STATUSES.includes(status)) {
      throw new BadRequestException('Invalid appointment status');
    }

    const { data: existing, error: fetchError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(
        'id, status, professional_id, total_price, customer_id, customer_name, customer_phone, loyalty_reward_id',
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

    const updatePayload: {
      status: UpdateAppointmentStatusDto['status'];
      commission_amount?: number;
    } = { status };

    if (status === 'COMPLETED' && existing.status !== 'COMPLETED') {
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

      const totalPrice = Number(existing.total_price ?? 0);
      const commissionPercent = Number(professional?.commission_percent ?? 0);

      updatePayload.commission_amount = calculateCommissionAmount(
        totalPrice,
        commissionPercent,
      );
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
      status === 'COMPLETED' &&
      existing.status !== 'COMPLETED' &&
      !existing.loyalty_reward_id
    ) {
      await this.loyaltyService.awardPointsForCompletedAppointment({
        tenantId,
        appointmentId,
        customerId: existing.customer_id ?? null,
        customerName: existing.customer_name,
        customerPhone: existing.customer_phone,
        totalPrice: Number(existing.total_price ?? 0),
      });
    }

    const appointment = await this.findAdminById(tenantId, appointmentId);

    if (!appointment) {
      throw new NotFoundException(
        `Appointment with id "${appointmentId}" was not found for this tenant`,
      );
    }

    return appointment;
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
    customerName?: string,
    customerPhone?: string,
  ): Promise<{ name: string; phone: string }> {
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

      if (existing) {
        return {
          name: trimmedName || existing.customer_name,
          phone: customerPhone?.trim() || existing.customer_phone,
        };
      }

      return {
        name: trimmedName || 'Cliente balcão',
        phone: customerPhone?.trim() ?? '',
      };
    }

    if (!trimmedName) {
      throw new BadRequestException(
        'Informe o nome do cliente ou um telefone para identificá-lo.',
      );
    }

    return {
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
    const dayStartIso = `${format(startTime, 'yyyy-MM-dd')}T00:00:00`;
    const dayEndIso = `${format(startTime, 'yyyy-MM-dd')}T23:59:59`;

    const { data: appointments, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('start_time, end_time')
      .eq('tenant_id', tenantId)
      .eq('professional_id', professionalId)
      .in('status', ['PENDING', 'PENDING_PAYMENT', 'CONFIRMED'])
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
      const appointmentStart = new Date(appointment.start_time);
      const appointmentEnd = new Date(appointment.end_time);
      return startTime < appointmentEnd && endTime > appointmentStart;
    });
  }

  private mapAdminAppointmentRow(
    row: SupabaseAppointmentWithRelations,
  ): AdminAppointment {
    const lineItems = this.extractAppointmentLineItems(row);

    return {
      id: row.id,
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

  private normalizeBookingSource(value?: string): BookingSource {
    return value === 'INTERNAL' ? 'INTERNAL' : 'PUBLIC';
  }

  private validateCreateDto(dto: CreateAppointmentDto): void {
    const requiredFields: (keyof CreateAppointmentDto)[] = [
      'tenantId',
      'professionalId',
      'customerName',
      'customerPhone',
      'startTime',
    ];

    const hasMissingField = requiredFields.some(
      (field) => !dto[field]?.toString().trim(),
    );

    if (hasMissingField) {
      throw new BadRequestException('All appointment fields are required');
    }

    if (normalizeServiceIds(dto).length === 0) {
      throw new BadRequestException(
        'At least one service must be provided via "serviceIds" or "serviceId"',
      );
    }
  }
}
