-- QA-03 / QA-11 / QA-06
-- Terminal payment statuses, stored deposit amount and Asaas ids,
-- and cash entries linked to the appointment.
-- Idempotent. Do not apply from the app; run this SQL on the target database.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS deposit_amount numeric(12, 2);

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS asaas_checkout_id text;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS asaas_payment_id text;

ALTER TABLE public.cash_flow_entries
  ADD COLUMN IF NOT EXISTS appointment_id uuid;

ALTER TABLE public.cash_flow_entries
  ADD COLUMN IF NOT EXISTS payment_method text;

COMMENT ON COLUMN public.appointments.deposit_amount IS
  'Valor do sinal cobrado neste agendamento, em reais. Nulo quando o serviço não pede sinal.';

COMMENT ON COLUMN public.appointments.asaas_checkout_id IS
  'Id do checkout Asaas criado para o sinal.';

COMMENT ON COLUMN public.appointments.asaas_payment_id IS
  'Id do pagamento Asaas confirmado do sinal.';

COMMENT ON COLUMN public.cash_flow_entries.appointment_id IS
  'Agendamento que originou o lançamento, quando a categoria é de atendimento.';

COMMENT ON COLUMN public.cash_flow_entries.payment_method IS
  'Forma de pagamento do lançamento: CASH, CARD, PIX ou OTHER.';

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'appointments'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%payment_status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.appointments DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_payment_status_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_payment_status_check
  CHECK (
    payment_status IN (
      'PENDING',
      'PAID',
      'REFUNDED',
      'EXPIRED',
      'NOT_REQUIRED'
    )
  );

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'cash_flow_entries'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%payment_method%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.cash_flow_entries DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE public.cash_flow_entries
  DROP CONSTRAINT IF EXISTS cash_flow_entries_payment_method_check;

ALTER TABLE public.cash_flow_entries
  ADD CONSTRAINT cash_flow_entries_payment_method_check
  CHECK (
    payment_method IS NULL
    OR payment_method IN ('CASH', 'CARD', 'PIX', 'OTHER')
  );

CREATE INDEX IF NOT EXISTS cash_flow_entries_appointment_id_idx
  ON public.cash_flow_entries (appointment_id);

UPDATE public.appointments AS appointment
SET deposit_amount = deposit_totals.total_deposit
FROM (
  SELECT
    appointment_service.appointment_id,
    SUM(COALESCE(service.deposit_amount, 0)) AS total_deposit
  FROM public.appointment_services AS appointment_service
  JOIN public.services AS service
    ON service.id = appointment_service.service_id
  WHERE service.requires_deposit IS TRUE
  GROUP BY appointment_service.appointment_id
) AS deposit_totals
WHERE appointment.id = deposit_totals.appointment_id
  AND appointment.deposit_amount IS NULL
  AND deposit_totals.total_deposit > 0;

UPDATE public.appointments
SET payment_status = 'NOT_REQUIRED'
WHERE payment_status = 'PAID'
  AND COALESCE(deposit_paid, false) = false;

UPDATE public.appointments
SET
  payment_status = 'EXPIRED',
  hold_expires_at = NULL
WHERE status = 'CANCELLED'
  AND payment_status = 'PENDING';
