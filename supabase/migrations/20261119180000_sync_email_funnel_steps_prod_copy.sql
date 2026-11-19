-- Sync video_agenda and trial_ended_winback copy with production
-- (edited in DB on 2026-11-12; migration 20261110210000 was stale).
-- Source: prod snapshot email_funnel_steps-prod-2026-11-19 (jwtquwbfedtuouitgtmo).
-- Idempotent UPDATEs of content fields only.

UPDATE public.email_funnel_steps
SET
  subject = 'Sua agenda pode estar organizada assim',
  title = 'A agenda do dia, do jeito que o cliente e a equipe veem.',
  preheader = 'Cada pessoa da equipe na própria linha. O horário marcado cai sozinho na agenda.',
  body_text = E'Oi, {{nome}}.\n\nNo painel, a Agenda mostra o dia por profissional: horário, serviço e status. Se alguém ligar ou chegar na porta, você mesmo registra em Novo agendamento, na mesma grade da página pública.\n\nSe o cliente não quiser escolher quem o atende, existe a opção "Sem preferência": o horário vai para quem estiver livre naquele momento. Quem atende sozinho já aparece na equipe. Só acrescente outra pessoa se a casa tiver mais de um profissional.\n\nQuando quiser confirmar presença, abra o horário e toque em Enviar lembrete no WhatsApp. O app abre a conversa no seu celular, com o número do cliente e a mensagem pronta. É só tocar em enviar.',
  body_if_setup = NULL,
  steps_json = NULL,
  cta_label = 'Abrir a agenda',
  cta_path = '/admin/agenda',
  image_url = '/email/agenda-timeline-equipe-1040.png',
  video_url = NULL,
  updated_at = NOW()
WHERE step_key = 'video_agenda';

UPDATE public.email_funnel_steps
SET
  subject = 'Seu teste terminou. A agenda continua aqui.',
  title = 'O teste acabou. Você pode voltar quando fizer sentido.',
  preheader = 'Solo, Pro ou Elite, no mesmo painel em que você testou.',
  body_text = E'Oi, {{nome}}.\n\nO período de teste do Horário Certo encerrou. Se quiser seguir com a agenda online e a página de {{nome_negocio}}, é só escolher o plano em Meu plano.\n\nSolo por R$ 34,90, Pro por R$ 69,90 (o mais escolhido) ou Elite por R$ 120,00 ao mês. Sem surpresa no valor do plano. Cancele quando quiser.\n\nSe tiver alguma dúvida para retomar, responda este e-mail ou fale com a gente pelo Suporte no painel.',
  body_if_setup = NULL,
  steps_json = NULL,
  cta_label = 'Ver os planos',
  cta_path = '/admin/faturamento',
  image_url = NULL,
  video_url = NULL,
  updated_at = NOW()
WHERE step_key = 'trial_ended_winback';

-- leave_whatsapp: send body_if_setup when agenda is already configured (no skip).
-- Shared subject/preheader/title stay; CTA becomes Abrir o Início → /admin/dashboard
-- (valid for both versions). Copy from textos-finais.md (19/11/2026).
UPDATE public.email_funnel_steps
SET
  skip_if_setup_complete = false,
  cta_label = 'Abrir o Início',
  cta_path = '/admin/dashboard',
  body_if_setup = E'Olá, {{nome}}.\n\nO link de agendamento de {{nome_negocio}} já funciona, porque você cadastrou serviço e horários.\n\nAgora falta colocar esse link onde o cliente já chama você. Assim ele escolhe um horário livre sozinho, a qualquer hora, pelo navegador do celular, e o horário cai direto na sua agenda.\n\nTrês lugares para começar:\n1. Bio do Instagram: cole o link no campo de link do perfil.\n2. Conversa do WhatsApp: quando alguém perguntar "tem horário?", responda com o link.\n3. Balcão: imprima o QR Code e deixe à vista de quem está na casa.\n\nSeu link: {{link_agendamento}}\n\nPara copiar o link e imprimir o QR Code, abra o Início e vá no bloco Divulgação.',
  updated_at = NOW()
WHERE step_key = 'leave_whatsapp';
