/**
 * Seed de dados de teste no HML para um tenant existente.
 * Uso: node scripts/seed-hml-test-data.mjs [email]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET_EMAIL = (process.argv[2] ?? 'viniciusgrp+beticos@gmail.com').toLowerCase().trim();

function loadEnv() {
  const envPath = resolve(__dirname, '../.env');
  const raw = readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

function spDate(daysOffset, hour, minute = 0) {
  const now = new Date();
  const br = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  br.setDate(br.getDate() + daysOffset);
  br.setHours(hour, minute, 0, 0);
  const utc = new Date(br.toLocaleString('en-US', { timeZone: 'UTC' }));
  return utc.toISOString();
}

async function findUserByEmail(supabase, email) {
  let page = 1;
  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

async function findUserAndTenant(supabase, email) {
  const authUser = await findUserByEmail(supabase, email);
  if (authUser) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, name, slug, owner_id, plan_tier, subscription_status')
      .eq('owner_id', authUser.id)
      .maybeSingle();
    if (tenant) return { authUser, tenant, role: 'OWNER' };
  }

  const { data: tenantUsers, error: tuErr } = await supabase
    .from('tenant_users')
    .select('tenant_id, role, user_id, tenants(id, name, slug, owner_id, plan_tier, subscription_status)')
    .limit(500);
  if (tuErr) throw tuErr;

  for (const row of tenantUsers ?? []) {
    const { data: userData, error } = await supabase.auth.admin.getUserById(row.user_id);
    if (error) continue;
    if (userData.user.email?.toLowerCase() === email) {
      return { authUser: userData.user, tenant: row.tenants, role: row.role };
    }
  }

  return null;
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL e SUPABASE_KEY são obrigatórios no backend/.env');

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Buscando usuário: ${TARGET_EMAIL}`);
  const match = await findUserAndTenant(supabase, TARGET_EMAIL);
  if (!match) {
    const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 50 });
    const emails = (data?.users ?? []).map((u) => u.email).filter(Boolean);
    throw new Error(
      `Usuário não encontrado: ${TARGET_EMAIL}\nUsuários no projeto: ${emails.join(', ') || '(nenhum)'}`,
    );
  }

  const { authUser, tenant, role } = match;

  const tenantId = tenant.id;
  console.log(`Tenant: ${tenant.name} (${tenant.slug}) — ${tenantId} [${role}]`);

  const { data: existingServices } = await supabase
    .from('services')
    .select('id, name, duration_minutes, price, loyalty_points_earned, requires_deposit, deposit_amount')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  const { data: existingPros } = await supabase
    .from('professionals')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  const { count: apptCount } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  console.log(`Serviços: ${existingServices?.length ?? 0} | Profissionais: ${existingPros?.length ?? 0} | Agendamentos: ${apptCount ?? 0}`);

  let services = existingServices ?? [];
  if (services.length === 0) {
    const seedServices = [
      { name: 'Corte de Cabelo', duration_minutes: 30, price: 50, loyalty_points_earned: 50 },
      { name: 'Barba Completa', duration_minutes: 30, price: 40, loyalty_points_earned: 40 },
      { name: 'Combo Cabelo e Barba', duration_minutes: 60, price: 80, loyalty_points_earned: 100 },
    ];
    const { data: inserted, error } = await supabase
      .from('services')
      .insert(seedServices.map((s) => ({ ...s, tenant_id: tenantId, is_active: true })))
      .select('id, name, duration_minutes, price, loyalty_points_earned');
    if (error) throw error;
    services = inserted;
    console.log(`Criados ${services.length} serviços`);
  }

  let professionals = existingPros ?? [];
  if (professionals.length === 0) {
    const seedPros = [
      { name: 'Carlos Alberto', contact_phone: '11988887777' },
      { name: 'Rodrigo Lima', contact_phone: '11977776666' },
    ];
    const { data: inserted, error } = await supabase
      .from('professionals')
      .insert(seedPros.map((p) => ({ ...p, tenant_id: tenantId, is_active: true })))
      .select('id, name');
    if (error) throw error;
    professionals = inserted;
    console.log(`Criados ${professionals.length} profissionais`);

    const links = [];
    for (const pro of professionals) {
      for (const svc of services) {
        links.push({ professional_id: pro.id, service_id: svc.id, tenant_id: tenantId });
      }
    }
    const { error: linkErr } = await supabase.from('professional_services').upsert(links, {
      onConflict: 'professional_id,service_id',
      ignoreDuplicates: true,
    });
    if (linkErr) throw linkErr;

    const hours = [];
    for (const pro of professionals) {
      for (let dow = 0; dow <= 6; dow += 1) {
        hours.push({
          professional_id: pro.id,
          tenant_id: tenantId,
          day_of_week: dow,
          opening_time: '09:00',
          closing_time: '19:00',
          is_closed: dow === 0,
        });
      }
    }
    await supabase.from('professional_hours').upsert(hours, {
      onConflict: 'professional_id,day_of_week',
      ignoreDuplicates: true,
    });

    const bizHours = [];
    for (let dow = 0; dow <= 6; dow += 1) {
      bizHours.push({
        tenant_id: tenantId,
        day_of_week: dow,
        open_time: '09:00',
        close_time: dow === 6 ? '14:00' : '19:00',
        is_closed: dow === 0,
      });
    }
    await supabase.from('business_hours').upsert(bizHours, {
      onConflict: 'tenant_id,day_of_week',
      ignoreDuplicates: true,
    });
  }

  const pro1 = professionals[0];
  const pro2 = professionals[1] ?? professionals[0];
  const svcCorte = services.find((s) => s.name.includes('Corte')) ?? services[0];
  const svcBarba = services.find((s) => s.name.includes('Barba') && !s.name.includes('Combo')) ?? services[1] ?? services[0];
  const svcCombo = services.find((s) => s.name.includes('Combo')) ?? services[services.length - 1];

  const { data: loyaltySettings } = await supabase
    .from('loyalty_settings')
    .select('tenant_id, is_active')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!loyaltySettings) {
    const { error } = await supabase.from('loyalty_settings').insert({
      tenant_id: tenantId,
      is_active: true,
      points_per_currency: 1,
      default_service_points: 0,
      expiration_days: 365,
      welcome_bonus: 20,
      refund_points_on_no_show: false,
    });
    if (error) throw error;
    console.log('Fidelidade configurada (ativa)');
  } else if (!loyaltySettings.is_active) {
    await supabase.from('loyalty_settings').update({ is_active: true }).eq('tenant_id', tenantId);
    console.log('Fidelidade ativada');
  }

  const { data: rewards } = await supabase
    .from('loyalty_rewards')
    .select('id, title')
    .eq('tenant_id', tenantId);

  if (!rewards?.length) {
    await supabase.from('loyalty_rewards').insert({
      tenant_id: tenantId,
      title: 'Barba grátis',
      points_cost: 200,
      is_active: true,
      service_id: svcBarba.id,
    });
    console.log('Recompensa de fidelidade criada');
  }

  const customersSeed = [
    {
      id: randomUUID(),
      tenant_id: tenantId,
      name: 'Maria Santos',
      phone: '11966661111',
      email: 'maria.santos.test@email.com',
      points_balance: 220,
      acquisition_source: 'Instagram',
      referral_code: 'MAR001',
    },
    {
      id: randomUUID(),
      tenant_id: tenantId,
      name: 'João Pereira',
      phone: '11955552222',
      email: 'joao.pereira.test@email.com',
      points_balance: 80,
      acquisition_source: 'Indicação',
      referral_code: 'JOA002',
    },
    {
      id: randomUUID(),
      tenant_id: tenantId,
      name: 'Ana Costa',
      phone: '11944443333',
      email: 'ana.costa.test@email.com',
      points_balance: 35,
      acquisition_source: 'Google',
      referral_code: 'ANA003',
    },
  ];

  const { data: upsertedCustomers, error: custErr } = await supabase
    .from('customers')
    .upsert(customersSeed, { onConflict: 'tenant_id,phone' })
    .select('id, name, phone, points_balance');

  if (custErr) throw custErr;
  const [maria, joao, ana] = upsertedCustomers;

  const { count: txCount } = await supabase
    .from('loyalty_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if ((txCount ?? 0) < 3) {
    await supabase.from('loyalty_transactions').insert([
      {
        tenant_id: tenantId,
        customer_id: maria.id,
        type: 'EARNED',
        points: 100,
        description: 'Boas-vindas + atendimentos anteriores',
      },
      {
        tenant_id: tenantId,
        customer_id: maria.id,
        type: 'EARNED',
        points: 120,
        description: 'Combo concluído',
      },
      {
        tenant_id: tenantId,
        customer_id: joao.id,
        type: 'EARNED',
        points: 80,
        description: 'Primeiro atendimento',
      },
      {
        tenant_id: tenantId,
        customer_id: ana.id,
        type: 'REDEEMED',
        points: 200,
        description: 'Resgate: Barba grátis',
      },
    ]);
    console.log('Transações de fidelidade criadas');
  }

  const appointmentsSeed = [
    {
      id: randomUUID(),
      tenant_id: tenantId,
      professional_id: pro1.id,
      service_id: svcCombo.id,
      customer_id: maria.id,
      customer_name: maria.name,
      customer_phone: maria.phone,
      start_time: spDate(-3, 15, 0),
      end_time: spDate(-3, 16, 0),
      status: 'COMPLETED',
      deposit_paid: true,
      payment_status: 'PAID',
      booking_source: 'PUBLIC',
      total_duration_minutes: svcCombo.duration_minutes,
      total_price: svcCombo.price,
      commission_amount: Number(svcCombo.price) * 0.5,
    },
    {
      id: randomUUID(),
      tenant_id: tenantId,
      professional_id: pro2.id,
      service_id: svcCorte.id,
      customer_id: maria.id,
      customer_name: maria.name,
      customer_phone: maria.phone,
      start_time: spDate(0, 16, 0),
      start_time_label: 'hoje 16h',
      end_time: spDate(0, 16, 30),
      status: 'CONFIRMED',
      deposit_paid: false,
      payment_status: 'PENDING',
      booking_source: 'PUBLIC',
      total_duration_minutes: svcCorte.duration_minutes,
      total_price: svcCorte.price,
      commission_amount: 0,
    },
    {
      id: randomUUID(),
      tenant_id: tenantId,
      professional_id: pro1.id,
      service_id: svcCorte.id,
      customer_id: joao.id,
      customer_name: joao.name,
      customer_phone: joao.phone,
      start_time: spDate(1, 14, 0),
      end_time: spDate(1, 14, 30),
      status: 'PENDING_APPROVAL',
      deposit_paid: false,
      payment_status: 'PENDING',
      booking_source: 'PUBLIC',
      total_duration_minutes: svcCorte.duration_minutes,
      total_price: svcCorte.price,
      commission_amount: 0,
    },
    {
      id: randomUUID(),
      tenant_id: tenantId,
      professional_id: pro2.id,
      service_id: svcBarba.id,
      customer_id: ana.id,
      customer_name: ana.name,
      customer_phone: ana.phone,
      start_time: spDate(2, 10, 0),
      end_time: spDate(2, 10, 30),
      status: 'CONFIRMED',
      deposit_paid: false,
      payment_status: 'PENDING',
      booking_source: 'INTERNAL',
      total_duration_minutes: svcBarba.duration_minutes,
      total_price: svcBarba.price,
      commission_amount: 0,
    },
    {
      id: randomUUID(),
      tenant_id: tenantId,
      professional_id: pro1.id,
      service_id: svcCorte.id,
      customer_id: null,
      customer_name: 'Pedro Walk-in',
      customer_phone: '11933334444',
      start_time: spDate(-1, 11, 0),
      end_time: spDate(-1, 11, 30),
      status: 'NO_SHOW',
      deposit_paid: false,
      payment_status: 'PENDING',
      booking_source: 'INTERNAL',
      total_duration_minutes: svcCorte.duration_minutes,
      total_price: svcCorte.price,
      commission_amount: 0,
    },
    {
      id: randomUUID(),
      tenant_id: tenantId,
      professional_id: pro2.id,
      service_id: svcCombo.id,
      customer_id: joao.id,
      customer_name: joao.name,
      customer_phone: joao.phone,
      start_time: spDate(3, 9, 0),
      end_time: spDate(3, 10, 0),
      status: 'PENDING',
      deposit_paid: false,
      payment_status: 'PENDING',
      booking_source: 'PUBLIC',
      total_duration_minutes: svcCombo.duration_minutes,
      total_price: svcCombo.price,
      commission_amount: 0,
    },
  ];

  // Remove campo auxiliar antes do insert
  for (const a of appointmentsSeed) delete a.start_time_label;

  const { data: insertedAppts, error: apptErr } = await supabase
    .from('appointments')
    .insert(appointmentsSeed)
    .select('id, status, customer_name, start_time');

  if (apptErr) throw apptErr;

  const apptServices = insertedAppts.map((appt, i) => {
    const seed = appointmentsSeed[i];
    const svc = services.find((s) => s.id === seed.service_id);
    return {
      appointment_id: appt.id,
      service_id: seed.service_id,
      tenant_id: tenantId,
      duration_minutes: svc.duration_minutes,
      price: svc.price,
      sort_order: 0,
    };
  });

  const { error: apptSvcErr } = await supabase.from('appointment_services').insert(apptServices);
  if (apptSvcErr) throw apptSvcErr;

  console.log('\n--- Seed concluído ---');
  console.log(`Estabelecimento: ${tenant.name} (/${tenant.slug}/agendar)`);
  console.log(`Plano: ${tenant.plan_tier ?? 'N/A'} | Assinatura: ${tenant.subscription_status ?? 'N/A'}`);
  console.log(`Clientes CRM: ${upsertedCustomers.length}`);
  console.log(`Agendamentos criados: ${insertedAppts.length}`);
  console.log('\nAgendamentos:');
  for (const a of insertedAppts) {
    const when = new Date(a.start_time).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`  • ${a.status.padEnd(18)} ${when} — ${a.customer_name}`);
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exit(1);
});
