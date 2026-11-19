-- Idempotency flag for transactional email "primeiro agendamento recebido"
-- (PUBLIC booking only). Outside the funnel 18h rule.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS first_public_appointment_email_sent_at timestamptz;

COMMENT ON COLUMN public.tenants.first_public_appointment_email_sent_at IS
  'When the owner was emailed about the tenant''s first PUBLIC appointment. NULL until sent. Atomic claim: UPDATE ... WHERE IS NULL.';
