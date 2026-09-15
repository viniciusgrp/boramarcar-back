import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private client!: SupabaseClient;
  private url!: string;
  private serviceRoleKey!: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('SUPABASE_URL');
    const key = this.configService.get<string>('SUPABASE_KEY');

    if (!url || !key) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_KEY must be defined in environment variables',
      );
    }

    this.assertServiceRoleKey(key);
    this.url = url;
    this.serviceRoleKey = key;

    this.client = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: (input, init) => {
          const requestUrl =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url;
          const headers = new Headers(init?.headers);

          if (
            requestUrl.includes('/rest/v1/') ||
            requestUrl.includes('/auth/v1/admin')
          ) {
            headers.set('Authorization', `Bearer ${key}`);
            headers.set('apikey', key);
          }

          return fetch(input, { ...init, headers });
        },
      },
    });
  }

  private assertServiceRoleKey(key: string): void {
    if (!key.startsWith('eyJ')) {
      throw new Error(
        'SUPABASE_KEY must be the service_role secret (JWT longo que começa com eyJ). ' +
          'No painel Supabase: Project Settings → API → service_role → Reveal.',
      );
    }

    const payload = JSON.parse(
      Buffer.from(key.split('.')[1], 'base64url').toString(),
    ) as { role?: string };

    if (payload.role !== 'service_role') {
      throw new Error(
        `SUPABASE_KEY está com role "${payload.role ?? 'desconhecida'}". ` +
          'Use a chave service_role no backend, não a anon/public.',
      );
    }
  }

  getClient(): SupabaseClient {
    return this.client;
  }

  /**
   * Issues a user session without mutating the shared service_role client.
   * Signing in on getClient() would make later PostgREST calls run as the
   * user and hit RLS on tables revoked from authenticated/anon.
   */
  async mintUserPasswordSession(
    email: string,
    password: string,
  ): Promise<{ access_token: string; refresh_token: string } | null> {
    const ephemeral = createClient(this.url, this.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    try {
      const { data, error } = await ephemeral.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data.session?.access_token || !data.session.refresh_token) {
        return null;
      }

      return {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      };
    } finally {
      await ephemeral.auth.signOut({ scope: 'local' });
    }
  }
}
