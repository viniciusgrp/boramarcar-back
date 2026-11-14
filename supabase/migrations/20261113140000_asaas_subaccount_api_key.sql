-- Asaas returns the subaccount apiKey only on POST /v3/accounts.
-- Store it encrypted so POST /billing/connect/sync can call GET /v3/myAccount/status.
-- The application encrypts the value before write. Never select this column into API responses.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS asaas_subaccount_api_key_encrypted text;

COMMENT ON COLUMN public.tenants.asaas_subaccount_api_key_encrypted IS
  'Asaas subaccount API key encrypted at rest (enc:v1:...). Returned once by POST /v3/accounts. Never expose in API responses or logs.';
