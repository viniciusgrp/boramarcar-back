import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private client!: SupabaseClient;

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

    this.client = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
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
}
