import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { PlatformAdmin } from './entities/platform-admin.entity';

@Injectable()
export class PlatformAdminsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findActiveByUserId(userId: string): Promise<PlatformAdmin | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('platform_admins')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data as PlatformAdmin | null) ?? null;
  }
}
