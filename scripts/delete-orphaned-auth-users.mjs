import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const useProd = process.argv.includes('--prod');
const envFile = resolve(__dirname, useProd ? '../.env.prod' : '../.env');

function loadEnv(path) {
  if (!existsSync(path)) {
    throw new Error(`Arquivo ausente: ${path}`);
  }

  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

async function isLinked(supabase, userId) {
  const checks = [
    ['tenant_users', 'user_id'],
    ['platform_admins', 'user_id'],
    ['affiliates', 'auth_user_id'],
    ['customers', 'auth_user_id'],
  ];

  for (const [table, column] of checks) {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(column, userId);

    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }
    if ((count ?? 0) > 0) {
      return true;
    }
  }

  return false;
}

async function main() {
  const env = loadEnv(envFile);
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    throw new Error('SUPABASE_URL e SUPABASE_KEY são obrigatórios');
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let scanned = 0;
  let deleted = 0;
  let page = 1;

  while (page <= 50) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      throw new Error(error.message);
    }

    const users = data.users ?? [];
    scanned += users.length;

    for (const user of users) {
      if (await isLinked(supabase, user.id)) {
        continue;
      }

      const { error: deleteError } = await supabase.auth.admin.deleteUser(
        user.id,
      );
      if (deleteError) {
        console.warn(`Falha em ${user.email ?? user.id}: ${deleteError.message}`);
        continue;
      }
      deleted += 1;
      console.log(`Apagado: ${user.email ?? user.id}`);
    }

    if (users.length < 200) {
      break;
    }
    page += 1;
  }

  console.log(JSON.stringify({ envFile, scanned, deleted }));
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
