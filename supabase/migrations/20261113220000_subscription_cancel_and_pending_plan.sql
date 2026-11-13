-- Cancel at period end, and hold a plan change until it is paid or the cycle ends.
-- subscription_cancel_at is the instant access ends (usually subscription_expires_at).
-- Null means cancellation is not scheduled.
-- pending_plan_* holds an upgrade waiting for a one-off payment, or a downgrade
-- that starts at pending_plan_effective_at. pending_plan_payment_id is null for downgrades.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS subscription_cancel_at timestamptz,
  ADD COLUMN IF NOT EXISTS pending_plan_tier text,
  ADD COLUMN IF NOT EXISTS pending_plan_payment_id text,
  ADD COLUMN IF NOT EXISTS pending_plan_invoice_url text,
  ADD COLUMN IF NOT EXISTS pending_plan_effective_at timestamptz;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_pending_plan_tier_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_pending_plan_tier_check
  CHECK (
    pending_plan_tier IS NULL
    OR pending_plan_tier IN ('SOLO', 'PRO', 'ELITE')
  );

COMMENT ON COLUMN public.tenants.subscription_cancel_at IS
  'When set, the Asaas subscription was canceled and paid access lasts until this instant. Null when cancellation is not scheduled.';

COMMENT ON COLUMN public.tenants.pending_plan_tier IS
  'Target plan waiting to be applied. Upgrade waits for pending_plan_payment_id. Downgrade applies at pending_plan_effective_at.';

COMMENT ON COLUMN public.tenants.pending_plan_payment_id IS
  'Asaas payment id for a prorated upgrade. Null when the pending change is a downgrade or there is no pending change.';

COMMENT ON COLUMN public.tenants.pending_plan_invoice_url IS
  'Invoice URL of the prorated upgrade payment, so the owner can finish paying without another Asaas lookup.';

COMMENT ON COLUMN public.tenants.pending_plan_effective_at IS
  'When a scheduled downgrade becomes the current plan. Null for an upgrade that applies as soon as the difference is paid.';

-- Sao Paulo calendar date (YYYY-MM-DD) of the last owner email about deposits
-- that could not be charged. Used to send at most one warning per day.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS deposit_charge_alerted_on date;

COMMENT ON COLUMN public.tenants.deposit_charge_alerted_on IS
  'Last America/Sao_Paulo date an owner email was sent because public bookings skipped a deposit. At most one email per day.';
