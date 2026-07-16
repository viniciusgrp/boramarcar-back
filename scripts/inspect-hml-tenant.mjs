/**
 * Inspeciona dados do tenant no HML.
 * Uso: node scripts/inspect-hml-tenant.mjs [email]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const email = (process.argv[2] ?? 'viniciusgrp+betico@gmail.com').toLowerCase();

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

async function main() {
  const env = loadEnv();
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  const user = users.users.find((u) => u.email?.toLowerCase() === email);
  if (!user) throw new Error('User not found');

  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('owner_id', user.id)
    .single();

  const tid = tenant.id;
  const [customers, appts, txs, rewards, loyalty] = await Promise.all([
    supabase.from('customers').select('name, phone, points_balance').eq('tenant_id', tid),
    supabase.from('appointments').select('status, customer_name, start_time').eq('tenant_id', tid).order('start_time'),
    supabase.from('loyalty_transactions').select('type, points, description, customers(name)').eq('tenant_id', tid),
    supabase.from('loyalty_rewards').select('title, points_cost, is_active').eq('tenant_id', tid),
    supabase.from('loyalty_settings').select('*').eq('tenant_id', tid).maybeSingle(),
  ]);

  console.log(JSON.stringify({ tenant: { name: tenant.name, slug: tenant.slug, plan: tenant.plan_tier }, loyalty: loyalty.data, rewards: rewards.data, customers: customers.data, transactions: txs.data, appointments: appts.data }, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
