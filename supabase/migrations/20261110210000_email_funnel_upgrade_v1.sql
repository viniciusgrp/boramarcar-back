-- Email Funnel Upgrade v1: Add new fields and update steps with new copy
-- Part A: Updates 7 existing steps with new copy
-- Part B: Adds 4 new steps (page_ready_share, no_public_booking, trial_last_day, trial_ended_winback)

-- Drop and recreate trigger_type constraint to allow 'days_after_trial_end'
ALTER TABLE public.email_funnel_steps DROP CONSTRAINT IF EXISTS email_funnel_steps_trigger_type_check;
ALTER TABLE public.email_funnel_steps ADD CONSTRAINT email_funnel_steps_trigger_type_check 
  CHECK (trigger_type IN ('immediate','hours_after_signup','days_after_signup','days_before_trial_end','days_after_trial_end'));

-- Add new columns to email_funnel_steps
ALTER TABLE public.email_funnel_steps
  ADD COLUMN IF NOT EXISTS preheader TEXT,
  ADD COLUMN IF NOT EXISTS send_only_if TEXT;

-- Add named send_only_if constraint idempotently
ALTER TABLE public.email_funnel_steps DROP CONSTRAINT IF EXISTS email_funnel_steps_send_only_if_check;
ALTER TABLE public.email_funnel_steps ADD CONSTRAINT email_funnel_steps_send_only_if_check 
  CHECK (send_only_if IN ('setup_complete_and_not_shared', 'no_public_booking'));

-- Define reusable UPDATE SET clause (all fields except step_key)
-- UPDATE template for all steps:
-- ON CONFLICT (step_key) DO UPDATE SET
--   step_number = EXCLUDED.step_number,
--   subject = EXCLUDED.subject,
--   preheader = EXCLUDED.preheader,
--   title = EXCLUDED.title,
--   body_text = EXCLUDED.body_text,
--   body_if_setup = EXCLUDED.body_if_setup,
--   steps_json = EXCLUDED.steps_json,
--   cta_label = EXCLUDED.cta_label,
--   cta_path = EXCLUDED.cta_path,
--   trigger_type = EXCLUDED.trigger_type,
--   trigger_offset = EXCLUDED.trigger_offset,
--   send_hour = EXCLUDED.send_hour,
--   window_start_hour = EXCLUDED.window_start_hour,
--   window_end_hour = EXCLUDED.window_end_hour,
--   skip_if_setup_complete = EXCLUDED.skip_if_setup_complete,
--   send_only_if = EXCLUDED.send_only_if,
--   is_active = EXCLUDED.is_active,
--   image_url = EXCLUDED.image_url,
--   video_url = EXCLUDED.video_url,
--   updated_at = NOW();

-- UPSERT existing steps with Part A copy (7 existing steps)

-- 1. welcome
INSERT INTO public.email_funnel_steps (
  step_key, step_number, subject, preheader, title, body_text, body_if_setup, steps_json,
  cta_label, cta_path, trigger_type, trigger_offset, send_hour,
  window_start_hour, window_end_hour, skip_if_setup_complete, send_only_if, is_active,
  image_url, video_url, updated_at
) VALUES (
  'welcome', 1,
  'Sua conta do Horário Certo está pronta',
  'Cadastre os serviços, revise os horários e compartilhe o link. Sem cartão.',
  'Sua conta está pronta. Vamos colocar a agenda no ar.',
  E'Olá, {{nome}}.\n\nBem-vindo ao Horário Certo. Seu cliente marca. Você só atende.\n\nVocê já está no teste de 14 dias do plano Pro, sem cartão. Para o primeiro horário chegar de verdade, faltam três coisas simples:\n\n1. Cadastre pelo menos um serviço (nome, duração e preço). Um item já basta.\n2. Revise os horários de funcionamento. Já deixamos segunda a sábado abertos. Ajuste se a sua casa for diferente.\n3. No Início, no bloco Divulgação, copie o link de agendamento ou imprima o QR Code. Envie no WhatsApp, no Instagram ou na bio.\n\nO painel mostra esse checklist depois do login. O resto (equipe, caixa, fidelidade) você ativa depois, se quiser.',
  NULL, NULL,
  'Abrir o Início', '/admin/dashboard',
  'immediate', 0, NULL, NULL, NULL, false, NULL, true,
  NULL, NULL, NOW()
) ON CONFLICT (step_key) DO UPDATE SET
  step_number = EXCLUDED.step_number,
  subject = EXCLUDED.subject,
  preheader = EXCLUDED.preheader,
  title = EXCLUDED.title,
  body_text = EXCLUDED.body_text,
  body_if_setup = EXCLUDED.body_if_setup,
  steps_json = EXCLUDED.steps_json,
  cta_label = EXCLUDED.cta_label,
  cta_path = EXCLUDED.cta_path,
  trigger_type = EXCLUDED.trigger_type,
  trigger_offset = EXCLUDED.trigger_offset,
  send_hour = EXCLUDED.send_hour,
  window_start_hour = EXCLUDED.window_start_hour,
  window_end_hour = EXCLUDED.window_end_hour,
  skip_if_setup_complete = EXCLUDED.skip_if_setup_complete,
  send_only_if = EXCLUDED.send_only_if,
  is_active = EXCLUDED.is_active,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  updated_at = NOW();

-- 2. nudge_agenda
INSERT INTO public.email_funnel_steps (
  step_key, step_number, subject, preheader, title, body_text, body_if_setup, steps_json,
  cta_label, cta_path, trigger_type, trigger_offset, send_hour,
  window_start_hour, window_end_hour, skip_if_setup_complete, send_only_if, is_active,
  image_url, video_url, updated_at
) VALUES (
  'nudge_agenda', 2,
  'Já configurou sua agenda?',
  'Um serviço e os horários da casa. Depois é só compartilhar o link.',
  'Sua página ainda precisa de um serviço e dos horários.',
  E'Oi, {{nome}}.\n\nSem um serviço ativo, o link de {{nome_negocio}} não tem o que oferecer ao cliente. Sem horário de funcionamento, não há grade para marcar.\n\nAbra Serviços, toque em adicionar e preencha nome, duração e preço. Um serviço já basta.\n\nDepois, em Configurações, na aba Horários, confira os dias. O padrão é segunda a sábado. Se você abre no domingo ou fecha mais cedo, ajuste e salve.\n\nQuando isso estiver pronto, o Início libera o link e o QR Code para você divulgar.',
  NULL, NULL,
  'Cadastrar meu primeiro serviço', '/admin/servicos',
  'hours_after_signup', 18, NULL, NULL, NULL, true, NULL, true,
  NULL, NULL, NOW()
) ON CONFLICT (step_key) DO UPDATE SET
  step_number = EXCLUDED.step_number,
  subject = EXCLUDED.subject,
  preheader = EXCLUDED.preheader,
  title = EXCLUDED.title,
  body_text = EXCLUDED.body_text,
  body_if_setup = EXCLUDED.body_if_setup,
  steps_json = EXCLUDED.steps_json,
  cta_label = EXCLUDED.cta_label,
  cta_path = EXCLUDED.cta_path,
  trigger_type = EXCLUDED.trigger_type,
  trigger_offset = EXCLUDED.trigger_offset,
  send_hour = EXCLUDED.send_hour,
  window_start_hour = EXCLUDED.window_start_hour,
  window_end_hour = EXCLUDED.window_end_hour,
  skip_if_setup_complete = EXCLUDED.skip_if_setup_complete,
  send_only_if = EXCLUDED.send_only_if,
  is_active = EXCLUDED.is_active,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  updated_at = NOW();

-- 3. leave_whatsapp
INSERT INTO public.email_funnel_steps (
  step_key, step_number, subject, preheader, title, body_text, body_if_setup, steps_json,
  cta_label, cta_path, trigger_type, trigger_offset, send_hour,
  window_start_hour, window_end_hour, skip_if_setup_complete, send_only_if, is_active,
  image_url, video_url, updated_at
) VALUES (
  'leave_whatsapp', 3,
  'Pare de organizar a agenda no WhatsApp',
  'O cliente escolhe o serviço e o horário pelo seu link. Você atende.',
  'Deixa o "tem horário?" com o link, não com a conversa.',
  E'Oi, {{nome}}.\n\nSe a agenda ainda anda no WhatsApp, no caderno ou na memória, o teste do Horário Certo ainda não começou de fato.\n\nA ideia é simples: você coloca serviços e horários, compartilha o link ou o QR, e o cliente marca sozinho, a qualquer hora, no navegador do celular. Sem baixar app. O horário cai na sua agenda.\n\nVocê para de responder "tem vaga?" no meio do atendimento.\n\nSão mais alguns minutos no painel: Serviços, depois Horários, depois o bloco Divulgação no Início. Aí o teste de 14 dias passa a valer na prática.',
  NULL, NULL,
  'Configurar minha agenda', '/admin/servicos',
  'days_after_signup', 2, 10, NULL, NULL, true, NULL, true,
  NULL, NULL, NOW()
) ON CONFLICT (step_key) DO UPDATE SET
  step_number = EXCLUDED.step_number,
  subject = EXCLUDED.subject,
  preheader = EXCLUDED.preheader,
  title = EXCLUDED.title,
  body_text = EXCLUDED.body_text,
  body_if_setup = EXCLUDED.body_if_setup,
  steps_json = EXCLUDED.steps_json,
  cta_label = EXCLUDED.cta_label,
  cta_path = EXCLUDED.cta_path,
  trigger_type = EXCLUDED.trigger_type,
  trigger_offset = EXCLUDED.trigger_offset,
  send_hour = EXCLUDED.send_hour,
  window_start_hour = EXCLUDED.window_start_hour,
  window_end_hour = EXCLUDED.window_end_hour,
  skip_if_setup_complete = EXCLUDED.skip_if_setup_complete,
  send_only_if = EXCLUDED.send_only_if,
  is_active = EXCLUDED.is_active,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  updated_at = NOW();

-- 4. tutorial
INSERT INTO public.email_funnel_steps (
  step_key, step_number, subject, preheader, title, body_text, body_if_setup, steps_json,
  cta_label, cta_path, trigger_type, trigger_offset, send_hour,
  window_start_hour, window_end_hour, skip_if_setup_complete, send_only_if, is_active,
  image_url, video_url, updated_at
) VALUES (
  'tutorial', 4,
  'Vamos configurar sua agenda juntos',
  'Serviços, horários e o link no ar. Um serviço já basta.',
  'No ar em três passos.',
  E'Oi, {{nome}}.\n\nAinda dá tempo de deixar {{nome_negocio}} pronto para receber horário nesta semana. O painel mostra o essencial. Você não precisa configurar tudo no primeiro dia.\n\nSiga os três passos abaixo. Se travar em algum, o Início aponta exatamente o que falta.',
  NULL,
  '[
    {
      "title": "Cadastre os serviços",
      "body": "Em Serviços, toque em adicionar. Preencha nome, duração e preço, e salve. Um serviço já basta para o link ter o que oferecer."
    },
    {
      "title": "Revise os horários da casa",
      "body": "Em Configurações, aba Horários, ajuste os dias e toque em Salvar. O padrão é segunda a sábado. Os horários de cada profissional ficam dentro dessa janela."
    },
    {
      "title": "Compartilhe o link ou o QR",
      "body": "No Início, no bloco Divulgação, copie o link de agendamento ou imprima o QR Code. Envie no WhatsApp, no Instagram ou na bio. O cliente marca sozinho, 24h."
    }
  ]'::jsonb,
  'Começar pelo primeiro serviço', '/admin/servicos',
  'days_after_signup', 3, 10, NULL, NULL, true, NULL, true,
  NULL, NULL, NOW()
) ON CONFLICT (step_key) DO UPDATE SET
  step_number = EXCLUDED.step_number,
  subject = EXCLUDED.subject,
  preheader = EXCLUDED.preheader,
  title = EXCLUDED.title,
  body_text = EXCLUDED.body_text,
  body_if_setup = EXCLUDED.body_if_setup,
  steps_json = EXCLUDED.steps_json,
  cta_label = EXCLUDED.cta_label,
  cta_path = EXCLUDED.cta_path,
  trigger_type = EXCLUDED.trigger_type,
  trigger_offset = EXCLUDED.trigger_offset,
  send_hour = EXCLUDED.send_hour,
  window_start_hour = EXCLUDED.window_start_hour,
  window_end_hour = EXCLUDED.window_end_hour,
  skip_if_setup_complete = EXCLUDED.skip_if_setup_complete,
  send_only_if = EXCLUDED.send_only_if,
  is_active = EXCLUDED.is_active,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  updated_at = NOW();

-- 5. video_agenda
INSERT INTO public.email_funnel_steps (
  step_key, step_number, subject, preheader, title, body_text, body_if_setup, steps_json,
  cta_label, cta_path, trigger_type, trigger_offset, send_hour,
  window_start_hour, window_end_hour, skip_if_setup_complete, send_only_if, is_active,
  image_url, video_url, updated_at
) VALUES (
  'video_agenda', 5,
  'Sua agenda pode estar organizada assim',
  'Cada pessoa da equipe na própria linha. O horário marcado cai sozinho na agenda.',
  'A agenda do dia, do jeito que o cliente (e a equipe) enxergam.',
  E'Oi, {{nome}}.\n\nNo painel, a Agenda mostra o dia por profissional: horário, serviço e status. Se alguém ligar ou chegar na porta, você mesmo registra em Novo agendamento, na mesma grade da página pública.\n\nSe o cliente não quiser escolher quem o atende, existe a opção "Sem preferência": o horário vai para quem estiver livre naquele momento. Quem atende sozinho já aparece na equipe. Só acrescente outra pessoa se a casa tiver mais de um profissional.\n\nQuando quiser confirmar presença, abra o horário e toque em Enviar lembrete no WhatsApp. O app abre a conversa no seu celular, com o número do cliente e a mensagem pronta. É só tocar em enviar.',
  NULL, NULL,
  'Abrir a agenda', '/admin/agenda',
  'days_after_signup', 4, 10, NULL, NULL, false, NULL, true,
  -- Relative path: backend prefixes FRONTEND_URL so HML uses hml.horariocerto.app
  '/email/agenda-timeline-equipe-1040.png', NULL, NOW()
) ON CONFLICT (step_key) DO UPDATE SET
  step_number = EXCLUDED.step_number,
  subject = EXCLUDED.subject,
  preheader = EXCLUDED.preheader,
  title = EXCLUDED.title,
  body_text = EXCLUDED.body_text,
  body_if_setup = EXCLUDED.body_if_setup,
  steps_json = EXCLUDED.steps_json,
  cta_label = EXCLUDED.cta_label,
  cta_path = EXCLUDED.cta_path,
  trigger_type = EXCLUDED.trigger_type,
  trigger_offset = EXCLUDED.trigger_offset,
  send_hour = EXCLUDED.send_hour,
  window_start_hour = EXCLUDED.window_start_hour,
  window_end_hour = EXCLUDED.window_end_hour,
  skip_if_setup_complete = EXCLUDED.skip_if_setup_complete,
  send_only_if = EXCLUDED.send_only_if,
  is_active = EXCLUDED.is_active,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  updated_at = NOW();

-- 6. trial_mid
INSERT INTO public.email_funnel_steps (
  step_key, step_number, subject, preheader, title, body_text, body_if_setup, steps_json,
  cta_label, cta_path, trigger_type, trigger_offset, send_hour,
  window_start_hour, window_end_hour, skip_if_setup_complete, send_only_if, is_active,
  image_url, video_url, updated_at
) VALUES (
  'trial_mid', 6,
  'Você ainda tem {{dias_restantes}} {{dias_label}} para testar',
  '{{dias_restantes}} {{dias_label}} do Pro pela frente. Agenda, caixa, fidelidade e cupons no mesmo painel.',
  'Você está no meio do teste de 14 dias.',
  E'Oi, {{nome}}.\n\nAinda {{restam_ou_resta}} {{dias_restantes}} {{dias_label}} do plano Pro, sem cartão. Se os serviços e os horários ainda não estão no ar, o teste está passando sem o cliente conseguir marcar.\n\nVale fazer o básico agora: cadastre um serviço, revise os horários e compartilhe o link ou o QR no Início. É isso que transforma os dias que restam num teste de verdade.\n\nDepois, se quiser, você olha o caixa do dia, os pontos de fidelidade e os cupons. Nada disso é obrigatório no primeiro momento.',
  E'Oi, {{nome}}.\n\nA agenda de {{nome_negocio}} já pode receber horário. Ainda {{restam_ou_resta}} {{dias_restantes}} {{dias_label}} do Pro para você experimentar o que vem depois da grade.\n\nNo mesmo painel: o fluxo de caixa (abrir, lançar e fechar o expediente), os relatórios de faturamento com exportação em CSV, os pontos de fidelidade e os cupons para uma primeira visita ou um horário mais fraco.\n\nSe tiver equipe, o sistema calcula a comissão de cada profissional. No detalhe do horário, o botão Enviar lembrete no WhatsApp deixa a mensagem pronta: é só tocar em enviar.\n\nQuando quiser continuar depois do teste, é só escolher o plano em Meu plano. Sem cartão até lá. Cancele quando quiser.',
  NULL,
  'Continuar pelo Início', '/admin/dashboard',
  'days_after_signup', 7, 10, NULL, NULL, false, NULL, true,
  NULL, NULL, NOW()
) ON CONFLICT (step_key) DO UPDATE SET
  step_number = EXCLUDED.step_number,
  subject = EXCLUDED.subject,
  preheader = EXCLUDED.preheader,
  title = EXCLUDED.title,
  body_text = EXCLUDED.body_text,
  body_if_setup = EXCLUDED.body_if_setup,
  steps_json = EXCLUDED.steps_json,
  cta_label = EXCLUDED.cta_label,
  cta_path = EXCLUDED.cta_path,
  trigger_type = EXCLUDED.trigger_type,
  trigger_offset = EXCLUDED.trigger_offset,
  send_hour = EXCLUDED.send_hour,
  window_start_hour = EXCLUDED.window_start_hour,
  window_end_hour = EXCLUDED.window_end_hour,
  skip_if_setup_complete = EXCLUDED.skip_if_setup_complete,
  send_only_if = EXCLUDED.send_only_if,
  is_active = EXCLUDED.is_active,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  updated_at = NOW();

-- 7. trial_ending
INSERT INTO public.email_funnel_steps (
  step_key, step_number, subject, preheader, title, body_text, body_if_setup, steps_json,
  cta_label, cta_path, trigger_type, trigger_offset, send_hour,
  window_start_hour, window_end_hour, skip_if_setup_complete, send_only_if, is_active,
  image_url, video_url, updated_at
) VALUES (
  'trial_ending', 7,
  'Seu período de teste está chegando ao fim',
  'Faltam 2 dias do Pro. Solo, Pro (Mais escolhido) ou Elite, sem cartão até você decidir.',
  'Faltam 2 dias para o fim do teste.',
  E'Oi, {{nome}}.\n\nO teste grátis do Pro de {{nome_negocio}} acaba em 2 dias. Para manter a agenda e a página de agendamento no ar, é só escolher um plano em Meu plano.\n\n- Solo, R$ 34,90/mês, para quem atende sozinho.\n- Pro, R$ 69,90/mês, o mais escolhido, para times de até 5 pessoas, com comissão, fidelidade e caixa.\n- Elite, R$ 120,00/mês, com profissionais ilimitados, relatórios e pagamento antecipado (sinal) opcional.\n\nA mensalidade é a que está no plano, sem taxa escondida da nossa parte. Você não precisou deixar cartão para testar. Cancele quando quiser.\n\nSe ainda não compartilhou o link, dá tempo: no Início, copie o endereço ou imprima o QR e envie para a clientela.',
  NULL, NULL,
  'Escolher meu plano', '/admin/faturamento',
  'days_before_trial_end', 2, 10, NULL, NULL, false, NULL, true,
  NULL, NULL, NOW()
) ON CONFLICT (step_key) DO UPDATE SET
  step_number = EXCLUDED.step_number,
  subject = EXCLUDED.subject,
  preheader = EXCLUDED.preheader,
  title = EXCLUDED.title,
  body_text = EXCLUDED.body_text,
  body_if_setup = EXCLUDED.body_if_setup,
  steps_json = EXCLUDED.steps_json,
  cta_label = EXCLUDED.cta_label,
  cta_path = EXCLUDED.cta_path,
  trigger_type = EXCLUDED.trigger_type,
  trigger_offset = EXCLUDED.trigger_offset,
  send_hour = EXCLUDED.send_hour,
  window_start_hour = EXCLUDED.window_start_hour,
  window_end_hour = EXCLUDED.window_end_hour,
  skip_if_setup_complete = EXCLUDED.skip_if_setup_complete,
  send_only_if = EXCLUDED.send_only_if,
  is_active = EXCLUDED.is_active,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  updated_at = NOW();

-- INSERT new steps (Part B: 4 new steps)
-- Using DO UPDATE for new steps too so re-running converges

-- 8. page_ready_share (D1, send only if setup complete and not shared)
INSERT INTO public.email_funnel_steps (
  step_key, step_number, subject, preheader, title, body_text, body_if_setup, steps_json,
  cta_label, cta_path, trigger_type, trigger_offset, send_hour,
  window_start_hour, window_end_hour, skip_if_setup_complete, send_only_if, is_active,
  image_url, video_url, updated_at
) VALUES (
  'page_ready_share', 8,
  'Sua página já pode receber horário',
  'Logo, banner e o QR no balcão. O cliente reconhece o seu espaço.',
  'O link já existe. Agora ele precisa da sua cara, e de divulgação.',
  E'Oi, {{nome}}.\n\nOs serviços e os horários de {{nome_negocio}} já estão no ar. O próximo passo é o cliente reconhecer a página e conseguir chegar nela.\n\nEm Configurações, aba Perfil, no bloco Identidade Visual, envie o logo e o banner de capa. Ali também ficam a cor e a textura da página pública.\n\nDepois, no Início, no bloco Divulgação, copie o link de agendamento ou imprima o QR Code. Envie no WhatsApp, no Instagram ou na bio. Deixe o QR no balcão, se fizer sentido para a casa.\n\nSeu link: {{link_agendamento}}',
  NULL, NULL,
  'Ver o link e o QR', '/admin/dashboard',
  'days_after_signup', 1, 10, NULL, NULL, false, 'setup_complete_and_not_shared', true,
  NULL, NULL, NOW()
) ON CONFLICT (step_key) DO UPDATE SET
  step_number = EXCLUDED.step_number,
  subject = EXCLUDED.subject,
  preheader = EXCLUDED.preheader,
  title = EXCLUDED.title,
  body_text = EXCLUDED.body_text,
  body_if_setup = EXCLUDED.body_if_setup,
  steps_json = EXCLUDED.steps_json,
  cta_label = EXCLUDED.cta_label,
  cta_path = EXCLUDED.cta_path,
  trigger_type = EXCLUDED.trigger_type,
  trigger_offset = EXCLUDED.trigger_offset,
  send_hour = EXCLUDED.send_hour,
  window_start_hour = EXCLUDED.window_start_hour,
  window_end_hour = EXCLUDED.window_end_hour,
  skip_if_setup_complete = EXCLUDED.skip_if_setup_complete,
  send_only_if = EXCLUDED.send_only_if,
  is_active = EXCLUDED.is_active,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  updated_at = NOW();

-- 9. no_public_booking (D5, send only if no public booking yet)
INSERT INTO public.email_funnel_steps (
  step_key, step_number, subject, preheader, title, body_text, body_if_setup, steps_json,
  cta_label, cta_path, trigger_type, trigger_offset, send_hour,
  window_start_hour, window_end_hour, skip_if_setup_complete, send_only_if, is_active,
  image_url, video_url, updated_at
) VALUES (
  'no_public_booking', 9,
  'Sua página ainda não recebeu um horário',
  'Envie de novo no WhatsApp ou coloque o QR no balcão. O cliente marca sozinho.',
  'A agenda está pronta. Falta o cliente achar o link.',
  E'Oi, {{nome}}.\n\n{{nome_negocio}} já consegue receber agendamento online, mas ainda não entrou nenhum horário pelo link público.\n\nVale mandar o link de novo para a clientela, colocar na bio do Instagram e deixar o QR visível no balcão. No Início, o bloco Divulgação copia o endereço e imprime o QR.\n\nSe alguém já tiver horário marcado do jeito antigo, você pode registrar na Agenda, em Novo agendamento. E, no dia anterior, o botão Enviar lembrete no WhatsApp deixa a mensagem pronta: é só tocar em enviar.\n\nSeu link: {{link_agendamento}}',
  NULL, NULL,
  'Copiar o link de agendamento', '/admin/dashboard',
  'days_after_signup', 5, 10, NULL, NULL, false, 'no_public_booking', true,
  NULL, NULL, NOW()
) ON CONFLICT (step_key) DO UPDATE SET
  step_number = EXCLUDED.step_number,
  subject = EXCLUDED.subject,
  preheader = EXCLUDED.preheader,
  title = EXCLUDED.title,
  body_text = EXCLUDED.body_text,
  body_if_setup = EXCLUDED.body_if_setup,
  steps_json = EXCLUDED.steps_json,
  cta_label = EXCLUDED.cta_label,
  cta_path = EXCLUDED.cta_path,
  trigger_type = EXCLUDED.trigger_type,
  trigger_offset = EXCLUDED.trigger_offset,
  send_hour = EXCLUDED.send_hour,
  window_start_hour = EXCLUDED.window_start_hour,
  window_end_hour = EXCLUDED.window_end_hour,
  skip_if_setup_complete = EXCLUDED.skip_if_setup_complete,
  send_only_if = EXCLUDED.send_only_if,
  is_active = EXCLUDED.is_active,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  updated_at = NOW();

-- 10. trial_last_day (last day of trial, offset 0 from trial_ends_at)
INSERT INTO public.email_funnel_steps (
  step_key, step_number, subject, preheader, title, body_text, body_if_setup, steps_json,
  cta_label, cta_path, trigger_type, trigger_offset, send_hour,
  window_start_hour, window_end_hour, skip_if_setup_complete, send_only_if, is_active,
  image_url, video_url, updated_at
) VALUES (
  'trial_last_day', 10,
  'Hoje é o último dia do seu teste',
  'Sem cartão até agora. Solo, Pro (Mais escolhido) ou Elite, quando você decidir.',
  'O período de teste acaba hoje.',
  E'Oi, {{nome}}.\n\nOs 14 dias do Pro de {{nome_negocio}} terminam hoje. Para continuar com a agenda e a página de agendamento, escolha um plano em Meu plano.\n\n- Solo, R$ 34,90/mês, se você atende sozinho.\n- Pro, R$ 69,90/mês, o mais escolhido, para o time de até 5 pessoas.\n- Elite, R$ 120,00/mês, se você quer relatórios e a opção de pedir sinal na hora de marcar.\n\nVocê testou sem deixar cartão. A mensalidade é a do plano. Cancele quando quiser.',
  NULL, NULL,
  'Escolher meu plano', '/admin/faturamento',
  'days_before_trial_end', 0, 10, NULL, NULL, false, NULL, true,
  NULL, NULL, NOW()
) ON CONFLICT (step_key) DO UPDATE SET
  step_number = EXCLUDED.step_number,
  subject = EXCLUDED.subject,
  preheader = EXCLUDED.preheader,
  title = EXCLUDED.title,
  body_text = EXCLUDED.body_text,
  body_if_setup = EXCLUDED.body_if_setup,
  steps_json = EXCLUDED.steps_json,
  cta_label = EXCLUDED.cta_label,
  cta_path = EXCLUDED.cta_path,
  trigger_type = EXCLUDED.trigger_type,
  trigger_offset = EXCLUDED.trigger_offset,
  send_hour = EXCLUDED.send_hour,
  window_start_hour = EXCLUDED.window_start_hour,
  window_end_hour = EXCLUDED.window_end_hour,
  skip_if_setup_complete = EXCLUDED.skip_if_setup_complete,
  send_only_if = EXCLUDED.send_only_if,
  is_active = EXCLUDED.is_active,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  updated_at = NOW();

-- 11. trial_ended_winback (3 days after trial end)
INSERT INTO public.email_funnel_steps (
  step_key, step_number, subject, preheader, title, body_text, body_if_setup, steps_json,
  cta_label, cta_path, trigger_type, trigger_offset, send_hour,
  window_start_hour, window_end_hour, skip_if_setup_complete, send_only_if, is_active,
  image_url, video_url, updated_at
) VALUES (
  'trial_ended_winback', 11,
  'Seu teste terminou. A agenda continua aqui.',
  'Solo, Pro ou Elite, no mesmo painel em que você testou.',
  'O teste acabou. Você pode voltar quando fizer sentido.',
  E'Oi, {{nome}}.\n\nO período de teste do Horário Certo encerrou. Se quiser seguir com a agenda online e a página de {{nome_negocio}}, é só escolher o plano em Meu plano.\n\nSolo por R$ 34,90, Pro por R$ 69,90 (o mais escolhido) ou Elite por R$ 120,00 ao mês. Sem surpresa no valor do plano. Cancele quando quiser.\n\nTodos os seus dados estão salvos (serviços, equipe, clientes, histórico). Quando você ativar um plano, a página pública volta a aceitar agendamentos.\n\nSe tiver alguma dúvida para retomar, responda este e-mail ou fale com a gente pelo Suporte no painel.',
  NULL, NULL,
  'Ver os planos', '/admin/faturamento',
  'days_after_trial_end', 3, 10, NULL, NULL, false, NULL, true,
  NULL, NULL, NOW()
) ON CONFLICT (step_key) DO UPDATE SET
  step_number = EXCLUDED.step_number,
  subject = EXCLUDED.subject,
  preheader = EXCLUDED.preheader,
  title = EXCLUDED.title,
  body_text = EXCLUDED.body_text,
  body_if_setup = EXCLUDED.body_if_setup,
  steps_json = EXCLUDED.steps_json,
  cta_label = EXCLUDED.cta_label,
  cta_path = EXCLUDED.cta_path,
  trigger_type = EXCLUDED.trigger_type,
  trigger_offset = EXCLUDED.trigger_offset,
  send_hour = EXCLUDED.send_hour,
  window_start_hour = EXCLUDED.window_start_hour,
  window_end_hour = EXCLUDED.window_end_hour,
  skip_if_setup_complete = EXCLUDED.skip_if_setup_complete,
  send_only_if = EXCLUDED.send_only_if,
  is_active = EXCLUDED.is_active,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  updated_at = NOW();

-- Add index on send_only_if for query performance
CREATE INDEX IF NOT EXISTS idx_email_funnel_steps_send_only_if ON public.email_funnel_steps (send_only_if);
