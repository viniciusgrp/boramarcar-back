-- Cash flow rows for product sales need a link back to product_sales.
-- Idempotent. Already applied on HML; versioned here for other environments.

ALTER TABLE public.cash_flow_entries
  ADD COLUMN IF NOT EXISTS product_sale_id uuid;

COMMENT ON COLUMN public.cash_flow_entries.product_sale_id IS
  'Venda de produto que originou o lançamento, quando houver.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'cash_flow_entries'
      AND con.conname = 'cash_flow_entries_product_sale_id_fkey'
  ) THEN
    ALTER TABLE public.cash_flow_entries
      ADD CONSTRAINT cash_flow_entries_product_sale_id_fkey
      FOREIGN KEY (product_sale_id)
      REFERENCES public.product_sales (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cash_flow_entries_product_sale_id_idx
  ON public.cash_flow_entries (product_sale_id);
