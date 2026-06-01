import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  addMinutes,
  format,
  isAfter,
  parseISO,
} from 'date-fns';
import { ProfessionalHoursService } from '../professional-hours/professional-hours.service';
import { SupabaseService } from '../supabase/supabase.service';
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
        .in('status', ['PENDING', 'CONFIRMED'])
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

  async create(dto: CreateAppointmentDto): Promise<Appointment> {
    this.validateCreateDto(dto);

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

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .insert({
        tenant_id: dto.tenantId,
        professional_id: dto.professionalId,
        service_id: primaryServiceId,
        customer_name: dto.customerName.trim(),
        customer_phone: dto.customerPhone.trim(),
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: 'CONFIRMED',
        deposit_paid: false,
        booking_source: 'PUBLIC',
        total_duration_minutes: booking.totalDurationMinutes,
        total_price: booking.totalPrice,
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const appointment = data as Appointment;

    await this.insertAppointmentServices(
      appointment.id,
      dto.tenantId,
      booking,
    );

    return appointment;
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
        customer_name: customer.name,
        customer_phone: customer.phone,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: 'CONFIRMED',
        deposit_paid: false,
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
      .select('id')
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

    const { error: updateError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .update({ status })
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      throw new InternalServerErrorException(updateError.message);
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
      .in('status', ['PENDING', 'CONFIRMED'])
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
      .select('id, name, duration_minutes, price')
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
      return {
        id: row.id,
        name: row.name,
        durationMinutes: row.duration_minutes,
        price: Number(row.price),
      };
    });

    return {
      items,
      totalDurationMinutes: items.reduce(
        (sum, item) => sum + item.durationMinutes,
        0,
      ),
      totalPrice: items.reduce((sum, item) => sum + item.price, 0),
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
