import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  parseWallClockDateTime,
  wallClockToStorageIso,
} from '../schedule/utils/wall-clock-datetime.util';
import { CreateProfessionalAbsenceDto } from './dto/create-professional-absence.dto';
import { ProfessionalAbsenceRangeDto } from './dto/professional-absence-range.dto';
import {
  ProfessionalAbsence,
} from './entities/professional-absence.entity';
import { ProfessionalAbsenceRow } from './entities/professional-absence-row.entity';

const ACTIVE_APPOINTMENT_STATUSES = [
  'PENDING',
  'PENDING_PAYMENT',
  'PENDING_APPROVAL',
  'CONFIRMED',
] as const;

@Injectable()
export class ProfessionalAbsencesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findAllByProfessional(
    tenantId: string,
    professionalId: string,
  ): Promise<ProfessionalAbsence[]> {
    const nowIso = new Date().toISOString();

    const { data, error } = await this.supabaseService
      .getClient()
      .from('professional_absences')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('professional_id', professionalId)
      .gte('ends_at', nowIso)
      .order('starts_at', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return ((data ?? []) as ProfessionalAbsenceRow[]).map((row) =>
      this.mapRow(row),
    );
  }

  async createForProfessional(
    tenantId: string,
    professionalId: string,
    dto: CreateProfessionalAbsenceDto,
  ): Promise<ProfessionalAbsence> {
    const { startsAt, endsAt } = this.parseAndValidateRange(dto);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('professional_absences')
      .insert({
        tenant_id: tenantId,
        professional_id: professionalId,
        starts_at: wallClockToStorageIso(startsAt),
        ends_at: wallClockToStorageIso(endsAt),
        reason: dto.reason?.trim() || null,
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return this.mapRow(data as ProfessionalAbsenceRow);
  }

  async deleteForTenant(tenantId: string, absenceId: string): Promise<void> {
    const { data: existing, error: fetchError } = await this.supabaseService
      .getClient()
      .from('professional_absences')
      .select('id')
      .eq('id', absenceId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (fetchError) {
      throw new InternalServerErrorException(fetchError.message);
    }

    if (!existing) {
      throw new NotFoundException(
        `Absence with id "${absenceId}" was not found for this tenant`,
      );
    }

    const { error } = await this.supabaseService
      .getClient()
      .from('professional_absences')
      .delete()
      .eq('id', absenceId)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  async findAbsenceById(
    tenantId: string,
    absenceId: string,
  ): Promise<ProfessionalAbsence | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('professional_absences')
      .select('*')
      .eq('id', absenceId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      return null;
    }

    return this.mapRow(data as ProfessionalAbsenceRow);
  }

  async findOverlappingForProfessionalOnDate(
    tenantId: string,
    professionalId: string,
    date: string,
  ): Promise<ProfessionalAbsence[]> {
    const dayStartIso = `${date}T00:00:00.000Z`;
    const dayEndIso = `${date}T23:59:59.000Z`;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('professional_absences')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('professional_id', professionalId)
      .lt('starts_at', dayEndIso)
      .gt('ends_at', dayStartIso)
      .order('starts_at', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return ((data ?? []) as ProfessionalAbsenceRow[]).map((row) =>
      this.mapRow(row),
    );
  }

  async hasAbsenceOverlap(
    tenantId: string,
    professionalId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<boolean> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('professional_absences')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('professional_id', professionalId)
      .lt('starts_at', wallClockToStorageIso(rangeEnd))
      .gt('ends_at', wallClockToStorageIso(rangeStart))
      .limit(1);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).length > 0;
  }

  async isDateFullyAbsent(
    tenantId: string,
    professionalId: string,
    date: string,
  ): Promise<boolean> {
    const dayStartIso = `${date}T00:00:00.000Z`;
    const dayEndIso = `${date}T23:59:59.000Z`;

    const absences = await this.findOverlappingForProfessionalOnDate(
      tenantId,
      professionalId,
      date,
    );

    return absences.some(
      (absence) =>
        absence.startsAt <= dayStartIso && absence.endsAt >= dayEndIso,
    );
  }

  async findConflictingAppointmentIds(
    tenantId: string,
    professionalId: string,
    dto: ProfessionalAbsenceRangeDto,
  ): Promise<string[]> {
    const { startsAt, endsAt } = this.parseAndValidateRange(dto);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('professional_id', professionalId)
      .in('status', [...ACTIVE_APPOINTMENT_STATUSES])
      .lt('start_time', wallClockToStorageIso(endsAt))
      .gt('end_time', wallClockToStorageIso(startsAt))
      .order('start_time', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((row) => row.id as string);
  }

  parseAndValidateRange(dto: ProfessionalAbsenceRangeDto): {
    startsAt: Date;
    endsAt: Date;
  } {
    const startsAt = parseWallClockDateTime(dto.startsAt);
    const endsAt = parseWallClockDateTime(dto.endsAt);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Datas de ausência inválidas.');
    }

    if (endsAt <= startsAt) {
      throw new BadRequestException(
        'O fim da ausência deve ser depois do início.',
      );
    }

    return { startsAt, endsAt };
  }

  private mapRow(row: ProfessionalAbsenceRow): ProfessionalAbsence {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      professionalId: row.professional_id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      reason: row.reason,
      createdAt: row.created_at,
    };
  }
}
