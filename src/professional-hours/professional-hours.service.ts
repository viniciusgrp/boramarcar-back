import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { parse } from 'date-fns';
import { combineWallClockDayAndTime } from '../schedule/utils/wall-clock-datetime.util';
import { BusinessHoursService } from '../business-hours/business-hours.service';
import { ProfessionalAbsencesService } from '../professional-absences/professional-absences.service';
import { SupabaseService } from '../supabase/supabase.service';
import {
  DayScheduleWindow,
  intersectSchedules,
} from '../schedule/utils/intersect-schedules.util';
import { ProfessionalHourItemDto } from './dto/update-professional-hours.dto';
import { ProfessionalDayStatusDto } from './dto/professional-day-status.dto';
import {
  ProfessionalHour,
  ProfessionalHourRow,
} from './entities/professional-hour.entity';

@Injectable()
export class ProfessionalHoursService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly businessHoursService: BusinessHoursService,
    private readonly professionalAbsencesService: ProfessionalAbsencesService,
  ) {}

  async findAllByProfessional(
    tenantId: string,
    professionalId: string,
  ): Promise<ProfessionalHour[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('professional_hours')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('professional_id', professionalId)
      .order('day_of_week', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return ((data ?? []) as ProfessionalHourRow[]).map((row) => this.mapRow(row));
  }

  async replaceForProfessional(
    tenantId: string,
    professionalId: string,
    hours: ProfessionalHourItemDto[],
  ): Promise<ProfessionalHour[]> {
    this.validateHoursPayload(hours);

    const { error: deleteError } = await this.supabaseService
      .getClient()
      .from('professional_hours')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('professional_id', professionalId);

    if (deleteError) {
      throw new InternalServerErrorException(deleteError.message);
    }

    if (hours.length === 0) {
      return [];
    }

    const rows = hours.map((item) => ({
      tenant_id: tenantId,
      professional_id: professionalId,
      day_of_week: item.dayOfWeek,
      opening_time: this.normalizeTimeForStorage(item.openTime),
      closing_time: this.normalizeTimeForStorage(item.closeTime),
      is_closed: item.isClosed,
    }));

    const { error: insertError } = await this.supabaseService
      .getClient()
      .from('professional_hours')
      .insert(rows);

    if (insertError) {
      throw new InternalServerErrorException(insertError.message);
    }

    return this.findAllByProfessional(tenantId, professionalId);
  }

  async getScheduleForDate(
    tenantId: string,
    professionalId: string,
    date: string,
  ): Promise<DayScheduleWindow | null> {
    const dayBase = parse(date, 'yyyy-MM-dd', new Date());
    const dayOfWeek = dayBase.getDay();

    const { data, error } = await this.supabaseService
      .getClient()
      .from('professional_hours')
      .select('opening_time, closing_time, is_closed')
      .eq('tenant_id', tenantId)
      .eq('professional_id', professionalId)
      .eq('day_of_week', dayOfWeek)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      return null;
    }

    const row = data as Pick<
      ProfessionalHourRow,
      'opening_time' | 'closing_time' | 'is_closed'
    >;

    if (row.is_closed) {
      return { isClosed: true, openAt: dayBase, closeAt: dayBase };
    }

    return {
      isClosed: false,
      openAt: this.combineDateAndTime(dayBase, row.opening_time),
      closeAt: this.combineDateAndTime(dayBase, row.closing_time),
    };
  }

  async getEffectiveScheduleForDate(
    tenantId: string,
    professionalId: string,
    date: string,
  ): Promise<DayScheduleWindow | null> {
    const isFullyAbsent =
      await this.professionalAbsencesService.isDateFullyAbsent(
        tenantId,
        professionalId,
        date,
      );

    if (isFullyAbsent) {
      const dayBase = parse(date, 'yyyy-MM-dd', new Date());
      return { isClosed: true, openAt: dayBase, closeAt: dayBase };
    }

    const business = await this.businessHoursService.getScheduleForDate(
      tenantId,
      date,
    );
    const professional = await this.getScheduleForDate(
      tenantId,
      professionalId,
      date,
    );

    return intersectSchedules(business, professional);
  }

  async getDayStatusForTenant(
    tenantId: string,
    date: string,
    professionalIds: string[],
  ): Promise<ProfessionalDayStatusDto[]> {
    const results: ProfessionalDayStatusDto[] = [];

    for (const professionalId of professionalIds) {
      const effective = await this.getEffectiveScheduleForDate(
        tenantId,
        professionalId,
        date,
      );

      if (!effective || effective.isClosed) {
        results.push({
          professionalId,
          status: 'off',
          openTime: null,
          closeTime: null,
        });
        continue;
      }

      results.push({
        professionalId,
        status: 'working',
        openTime: this.formatTimeFromDate(effective.openAt),
        closeTime: this.formatTimeFromDate(effective.closeAt),
      });
    }

    return results;
  }

  private formatTimeFromDate(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private combineDateAndTime(dayBase: Date, timeValue: string): Date {
    return combineWallClockDayAndTime(dayBase, timeValue);
  }

  private mapRow(row: ProfessionalHourRow): ProfessionalHour {
    return {
      id: row.id,
      professionalId: row.professional_id,
      tenantId: row.tenant_id,
      dayOfWeek: row.day_of_week,
      openTime: this.normalizeTimeForResponse(row.opening_time),
      closeTime: this.normalizeTimeForResponse(row.closing_time),
      isClosed: row.is_closed,
    };
  }

  private normalizeTimeForResponse(timeValue: string): string {
    return timeValue.slice(0, 5);
  }

  private normalizeTimeForStorage(timeValue: string): string {
    const trimmed = timeValue.trim();
    const match = /^(\d{2}):(\d{2})/.exec(trimmed);

    if (!match) {
      throw new BadRequestException(
        `Invalid time format "${timeValue}". Use HH:mm.`,
      );
    }

    return `${match[1]}:${match[2]}`;
  }

  private validateHoursPayload(hours: ProfessionalHourItemDto[]): void {
    if (!Array.isArray(hours)) {
      throw new BadRequestException('Field "hours" must be an array.');
    }

    if (hours.length === 0) {
      return;
    }

    if (hours.length !== 7) {
      throw new BadRequestException(
        'Field "hours" must contain exactly 7 days (0–6).',
      );
    }

    const seenDays = new Set<number>();

    for (const item of hours) {
      if (
        typeof item.dayOfWeek !== 'number' ||
        item.dayOfWeek < 0 ||
        item.dayOfWeek > 6
      ) {
        throw new BadRequestException(
          'Each item must have dayOfWeek between 0 and 6.',
        );
      }

      if (seenDays.has(item.dayOfWeek)) {
        throw new BadRequestException('Duplicate dayOfWeek in hours array.');
      }

      seenDays.add(item.dayOfWeek);

      const openTime = this.normalizeTimeForStorage(item.openTime);
      const closeTime = this.normalizeTimeForStorage(item.closeTime);

      if (!item.isClosed && openTime >= closeTime) {
        throw new BadRequestException(
          `Day ${item.dayOfWeek}: open time must be before close time.`,
        );
      }
    }
  }
}
