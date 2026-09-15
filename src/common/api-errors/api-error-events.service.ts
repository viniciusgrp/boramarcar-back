import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import {
  type ApiErrorEventInput,
  toApiErrorInsertRow,
} from './api-error-event.util';

@Injectable()
export class ApiErrorEventsService {
  private readonly logger = new Logger(ApiErrorEventsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async record(input: ApiErrorEventInput): Promise<void> {
    try {
      const { error } = await this.supabaseService
        .getClient()
        .from('api_error_events')
        .insert(toApiErrorInsertRow(input));

      if (error) {
        this.logger.warn(`Failed to persist api_error_events: ${error.message}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`Failed to persist api_error_events: ${message}`);
    }
  }
}
