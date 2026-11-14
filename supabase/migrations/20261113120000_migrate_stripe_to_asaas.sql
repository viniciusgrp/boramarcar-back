-- Asaas: subscription, deposit and subaccount columns.
-- Additive version for prod: keeps every stripe_* column and table.
-- Idempotent. Run this SQL on the target database.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS asaas_customer_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS asaas_subscription_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS asaas_pending_payment_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS asaas_open_invoice_url TEXT,
  ADD COLUMN IF NOT EXISTS support_ai_asaas_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS asaas_account_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS asaas_wallet_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS asaas_account_status VARCHAR(64),
  ADD COLUMN IF NOT EXISTS asaas_charges_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asaas_details_submitted BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tenants_asaas_customer_id
  ON public.tenants (asaas_customer_id)
  WHERE asaas_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_asaas_subscription_id
  ON public.tenants (asaas_subscription_id)
  WHERE asaas_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_asaas_account_id
  ON public.tenants (asaas_account_id)
  WHERE asaas_account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.asaas_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asaas_webhook_events_processed_at
  ON public.asaas_webhook_events (processed_at DESC);

ALTER TABLE public.asaas_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.asaas_webhook_events FROM anon, authenticated;
GRANT ALL ON TABLE public.asaas_webhook_events TO service_role;

COMMENT ON TABLE public.asaas_webhook_events IS
  'Asaas webhook event IDs already processed. Prevents duplicate side effects on retries.';

ALTER TABLE public.affiliate_commission_items
  ADD COLUMN IF NOT EXISTS provider_payment_id TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'affiliate_commission_items'
      AND column_name = 'stripe_invoice_id'
  ) THEN
    UPDATE public.affiliate_commission_items
    SET provider_payment_id = stripe_invoice_id
    WHERE provider_payment_id IS NULL AND stripe_invoice_id IS NOT NULL;

    -- The app now writes only provider_payment_id.
    ALTER TABLE public.affiliate_commission_items
      ALTER COLUMN stripe_invoice_id DROP NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE public.affiliate_commission_items
    ALTER COLUMN provider_payment_id SET NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.affiliate_commission_items
    ADD CONSTRAINT affiliate_commission_items_provider_payment_id_key
    UNIQUE (provider_payment_id);
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- Intentionally NOT dropped here (cleanup later, after the Stripe cutover):
-- stripe_customer_id, stripe_subscription_id, stripe_connect_*,
-- support_ai_stripe_subscription_item_id, affiliate_commission_items.stripe_invoice_id
-- and table stripe_webhook_events.
