import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import type { PlatformAdmin } from './entities/platform-admin.entity';
import { passphraseMatches } from './utils/platform-passphrase.util';

const PLATFORM_LOGIN_ADMIN_EMAIL = 'admin@boramarcar.internal';
const PLATFORM_LOGIN_ADMIN_NAME = 'admin';

@Injectable()
export class PlatformAdminsService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
  ) {}

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

  async loginWithPassphrase(
    passphrase: string,
  ): Promise<{ access_token: string; refresh_token: string }> {
    const expected = this.configService
      .get<string>('PLATFORM_LOGIN_PASSPHRASE')
      ?.trim();

    if (!expected) {
      throw new ServiceUnavailableException(
        'Login por frase secreta não está configurado.',
      );
    }

    if (!passphraseMatches(passphrase, expected)) {
      throw new UnauthorizedException('Frase de acesso inválida.');
    }

    const authUser = await this.ensureAdminAuthUser(expected);
    await this.ensureAdminMembership(authUser.id);

    const session = await this.supabaseService.mintUserPasswordSession(
      PLATFORM_LOGIN_ADMIN_EMAIL,
      expected,
      { skipSignOut: true },
    );

    if (!session) {
      throw new InternalServerErrorException(
        'Não foi possível abrir a sessão da plataforma.',
      );
    }

    return session;
  }

  private async ensureAdminAuthUser(password: string): Promise<User> {
    const existing = await this.findAuthUserByEmail(PLATFORM_LOGIN_ADMIN_EMAIL);

    if (existing) {
      const { data, error } = await this.supabaseService
        .getClient()
        .auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
          user_metadata: { full_name: PLATFORM_LOGIN_ADMIN_NAME },
        });

      if (error || !data.user) {
        throw new InternalServerErrorException(
          error?.message ?? 'Não foi possível atualizar o usuário admin.',
        );
      }

      return data.user;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .auth.admin.createUser({
        email: PLATFORM_LOGIN_ADMIN_EMAIL,
        password,
        email_confirm: true,
        user_metadata: { full_name: PLATFORM_LOGIN_ADMIN_NAME },
      });

    if (error || !data.user) {
      throw new InternalServerErrorException(
        error?.message ?? 'Não foi possível criar o usuário admin.',
      );
    }

    return data.user;
  }

  private async ensureAdminMembership(userId: string): Promise<void> {
    const { data: existing, error: existingError } = await this.supabaseService
      .getClient()
      .from('platform_admins')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingError) {
      throw new InternalServerErrorException(existingError.message);
    }

    if (existing) {
      const { error } = await this.supabaseService
        .getClient()
        .from('platform_admins')
        .update({
          name: PLATFORM_LOGIN_ADMIN_NAME,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) {
        throw new InternalServerErrorException(error.message);
      }

      return;
    }

    const { error } = await this.supabaseService
      .getClient()
      .from('platform_admins')
      .insert({
        user_id: userId,
        role: 'PARTNER_VIEWER',
        name: PLATFORM_LOGIN_ADMIN_NAME,
        is_active: true,
      });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private async findAuthUserByEmail(email: string): Promise<User | null> {
    let page = 1;
    const perPage = 200;
    const target = email.toLowerCase();

    while (page <= 50) {
      const { data, error } = await this.supabaseService
        .getClient()
        .auth.admin.listUsers({ page, perPage });

      if (error) {
        throw new InternalServerErrorException(error.message);
      }

      const match = data.users.find(
        (user) => user.email?.toLowerCase() === target,
      );
      if (match) {
        return match;
      }

      if (data.users.length < perPage) {
        return null;
      }

      page += 1;
    }

    return null;
  }
}
