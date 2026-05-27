import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { parse, setHours, setMinutes } from 'date-fns';
import { SupabaseService } from '../supabase/supabase.service';
import { BusinessHourItemDto } from './dto/update-business-hours.dto';
import {
  BusinessHour,
  BusinessHourRow,
} from './entities/business-hour.entity';

const SLOT_INTERVAL_MINUTES = 15;

const DEFAULT_WEEK_SCHEDULE: Omit<
  BusinessHourItemDto,
  'dayOfWeek'
>[] = [
  { openTime: '09:00', closeTime: '18:00', isClosed: true },
  { openTime: '09:00', closeTime: '18:00', isClosed: false },
  { openTime: '09:00', closeTime: '18:00', isClosed: false },
  { openTime: '09:00', closeTime: '18:00', isClosed: false },
  { openTime: '09:00', closeTime: '18:00', isClosed: false },
  { openTime: '09:00', closeTime: '18:00', isClosed: false },
  { openTime: '09:00', closeTime: '14:00', isClosed: false },
];

@Injectable()
export class BusinessHoursService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findAllByTenant(tenantId: string): Promise<BusinessHour[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('business_hours')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('day_of_week', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as BusinessHourRow[];
    return this.mergeWithDefaults(tenantId, rows);
  }

  async replaceForTenant(
    tenantId: string,
    hours: BusinessHourItemDto[],
  ): Promise<BusinessHour[]> {
    this.validateHoursPayload(hours);

    const { error: deleteError } = await this.supabaseService
      .getClient()
      .from('business_hours')
      .delete()
      .eq('tenant_id', tenantId);

    if (deleteError) {
      throw new InternalServerErrorException(deleteError.message);
    }

    const rows = hours.map((item) => ({
      tenant_id: tenantId,
      day_of_week: item.dayOfWeek,
      open_time: this.normalizeTimeForStorage(item.openTime),
      close_time: this.normalizeTimeForStorage(item.closeTime),
      is_closed: item.isClosed,
    }));

    const { error: insertError } = await this.supabaseService
      .getClient()
      .from('business_hours')
      .insert(rows);

    if (insertError) {
      throw new InternalServerErrorException(insertError.message);
    }

    return this.findAllByTenant(tenantId);
  }

  async getScheduleForDate(
    tenantId: string,
    date: string,
  ): Promise<{ isClosed: boolean; openAt: Date; closeAt: Date } | null> {
    const dayBase = parse(date, 'yyyy-MM-dd', new Date());
    const dayOfWeek = dayBase.getDay();

    const { data, error } = await this.supabaseService
      .getClient()
      .from('business_hours')
      .select('open_time, close_time, is_closed')
      .eq('tenant_id', tenantId)
      .eq('day_of_week', dayOfWeek)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      return null;
    }

    const row = data as Pick<
      BusinessHourRow,
      'open_time' | 'close_time' | 'is_closed'
    >;

    if (row.is_closed) {
      return { isClosed: true, openAt: dayBase, closeAt: dayBase };
    }

    return {
      isClosed: false,
      openAt: this.combineDateAndTime(dayBase, row.open_time),
      closeAt: this.combineDateAndTime(dayBase, row.close_time),
    };
  }

  getSlotIntervalMinutes(): number {
    return SLOT_INTERVAL_MINUTES;
  }

  combineDateAndTime(dayBase: Date, timeValue: string): Date {
    const normalized = this.normalizeTimeForStorage(timeValue);
    const [hours, minutes] = normalized.split(':').map(Number);
    return setMinutes(setHours(dayBase, hours), minutes);
  }

  private mergeWithDefaults(
    tenantId: string,
    rows: BusinessHourRow[],
  ): BusinessHour[] {
    const byDay = new Map(rows.map((row) => [row.day_of_week, row]));

    return Array.from({ length: 7 }, (_, dayOfWeek) => {
      const existing = byDay.get(dayOfWeek);
      const defaults = DEFAULT_WEEK_SCHEDULE[dayOfWeek];

      if (existing) {
        return this.mapRow(existing);
      }

      return {
        id: '',
        tenantId,
        dayOfWeek,
        openTime: defaults.openTime,
        closeTime: defaults.closeTime,
        isClosed: defaults.isClosed,
      };
    });
  }

  private mapRow(row: BusinessHourRow): BusinessHour {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      dayOfWeek: row.day_of_week,
      openTime: this.normalizeTimeForResponse(row.open_time),
      closeTime: this.normalizeTimeForResponse(row.close_time),
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

  private validateHoursPayload(hours: BusinessHourItemDto[]): void {
    if (!Array.isArray(hours) || hours.length !== 7) {
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
