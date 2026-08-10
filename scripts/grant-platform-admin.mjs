/**
 * Concede cargo PARTNER_VIEWER no backoffice da plataforma.
 * Uso: node scripts/grant-platform-admin.mjs <email> [nome]
 *
 * O usuário precisa existir em auth.users (criar via /admin/login register ou Supabase Dashboard).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const email = (process.argv[2] ?? '').trim().toLowerCase();
const nameArg = (process.argv[3] ?? '').trim();

function loadEnv() {
  const raw = readFileSync(resolve(__dirname, '../.env'), 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

async function findUserByEmail(supabase, targetEmail) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`listUsers failed: ${error.message}`);
    }

    const match = data.users.find(
      (u) => u.email?.toLowerCase() === targetEmail,
    );
    if (match) {
      return match;
    }

    if (data.users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

async function main() {
  if (!email) {
    console.error('Uso: node scripts/grant-platform-admin.mjs <email> [nome]');
    process.exit(1);
  }

  const env = loadEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    throw new Error('SUPABASE_URL e SUPABASE_KEY são obrigatórios em backend/.env');
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const user = await findUserByEmail(supabase, email);
  if (!user) {
    throw new Error(
      `Usuário não encontrado em auth.users para o email: ${email}`,
    );
  }

  const displayName =
    nameArg ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    email.split('@')[0];

  const { data: existing, error: existingError } = await supabase
    .from('platform_admins')
    .select('id, role, is_active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Falha ao consultar platform_admins: ${existingError.message}`);
  }

  if (existing) {
    const { data: updated, error: updateError } = await supabase
      .from('platform_admins')
      .update({
        role: 'PARTNER_VIEWER',
        name: displayName,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .single();

    if (updateError) {
      throw new Error(`Falha ao atualizar platform_admins: ${updateError.message}`);
    }

    console.log(
      JSON.stringify(
        { action: 'updated', email, platformAdmin: updated },
        null,
        2,
      ),
    );
    return;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('platform_admins')
    .insert({
      user_id: user.id,
      role: 'PARTNER_VIEWER',
      name: displayName,
      is_active: true,
    })
    .select('*')
    .single();

  if (insertError) {
    throw new Error(`Falha ao inserir platform_admins: ${insertError.message}`);
  }

  console.log(
    JSON.stringify(
      { action: 'created', email, platformAdmin: inserted },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
