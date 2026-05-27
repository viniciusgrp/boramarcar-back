import {
  BadRequestException,
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
import { BusinessHoursService } from '../business-hours/business-hours.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { AdminAppointment } from './entities/admin-appointment.entity';
import {
  APPOINTMENT_STATUSES,
  Appointment,
  AppointmentStatus,
} from './entities/appointment.entity';
import { SupabaseAppointmentWithRelations } from './types/supabase-appointment-row.type';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly businessHoursService: BusinessHoursService,
  ) {}

  async getAvailability(
    tenantId: string,
    professionalId: string,
    serviceId: string,
    date: string,
  ): Promise<string[]> {
    const { data: service, error: serviceError } = await this.supabaseService
      .getClient()
      .from('services')
      .select('duration_minutes')
      .eq('id', serviceId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (serviceError) {
      throw new InternalServerErrorException(serviceError.message);
    }

    if (!service) {
      throw new NotFoundException(
        `Service with id "${serviceId}" was not found for this tenant`,
      );
    }

    const durationMinutes = service.duration_minutes as number;
    const schedule = await this.businessHoursService.getScheduleForDate(
      tenantId,
      date,
    );

    if (!schedule || schedule.isClosed) {
      return [];
    }

    const businessOpen = schedule.openAt;
    const businessClose = schedule.closeAt;
    const slotIntervalMinutes =
      this.businessHoursService.getSlotIntervalMinutes();

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

    const { data: service, error: serviceError } = await this.supabaseService
      .getClient()
      .from('services')
      .select('duration_minutes')
      .eq('id', dto.serviceId)
      .eq('tenant_id', dto.tenantId)
      .maybeSingle();

    if (serviceError) {
      throw new InternalServerErrorException(serviceError.message);
    }

    if (!service) {
      throw new NotFoundException(
        `Service with id "${dto.serviceId}" was not found for this tenant`,
      );
    }

    const startTime = parseISO(dto.startTime);
    const endTime = addMinutes(
      startTime,
      service.duration_minutes as number,
    );

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .insert({
        tenant_id: dto.tenantId,
        professional_id: dto.professionalId,
        service_id: dto.serviceId,
        customer_name: dto.customerName.trim(),
        customer_phone: dto.customerPhone.trim(),
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: 'CONFIRMED',
        deposit_paid: false,
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data as Appointment;
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
      .select(
        `
        id,
        professional_id,
        customer_name,
        customer_phone,
        start_time,
        end_time,
        status,
        professionals ( name ),
        services ( name, duration_minutes, price )
      `,
      )
      .eq('tenant_id', tenantId)
      .gte('start_time', dayStartIso)
      .lte('start_time', dayEndIso)
      .order('start_time', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as SupabaseAppointmentWithRelations[];

    return rows.map((row) => ({
      id: row.id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status as AppointmentStatus,
      professionalId: row.professional_id,
      professionalName: this.extractRelationName(row.professionals),
      serviceName: this.extractRelationName(row.services),
      durationMinutes: this.extractServiceDuration(row.services),
      servicePrice: this.extractServicePrice(row.services),
    }));
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
      .select(
        `
        id,
        professional_id,
        customer_name,
        customer_phone,
        start_time,
        end_time,
        status,
        professionals ( name ),
        services ( name, duration_minutes, price )
      `,
      )
      .eq('tenant_id', tenantId)
      .eq('id', appointmentId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      return null;
    }

    const row = data as SupabaseAppointmentWithRelations;

    return {
      id: row.id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status as AppointmentStatus,
      professionalId: row.professional_id,
      professionalName: this.extractRelationName(row.professionals),
      serviceName: this.extractRelationName(row.services),
      durationMinutes: this.extractServiceDuration(row.services),
      servicePrice: this.extractServicePrice(row.services),
    };
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
    if (!relation) return '—';
    if (Array.isArray(relation)) return relation[0]?.name ?? '—';
    return relation.name;
  }

  private validateCreateDto(dto: CreateAppointmentDto): void {
    const requiredFields: (keyof CreateAppointmentDto)[] = [
      'tenantId',
      'professionalId',
      'serviceId',
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
  }
}
