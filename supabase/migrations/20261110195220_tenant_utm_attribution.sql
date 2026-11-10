-- Add UTM and Meta tracking fields to tenants table for marketing attribution
-- These fields capture the marketing campaign parameters and first visit data when a tenant signs up

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS utm_source text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS utm_medium text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS utm_campaign text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS utm_content text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS fbclid text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS first_visit_at timestamptz;

COMMENT ON COLUMN tenants.utm_source IS 'Marketing attribution: identifies the source of traffic (e.g., google, facebook, newsletter)';
COMMENT ON COLUMN tenants.utm_medium IS 'Marketing attribution: identifies the medium of traffic (e.g., cpc, email, social)';
COMMENT ON COLUMN tenants.utm_campaign IS 'Marketing attribution: identifies the specific campaign name';
COMMENT ON COLUMN tenants.utm_content IS 'Marketing attribution: identifies the specific ad or content variant';
COMMENT ON COLUMN tenants.fbclid IS 'Facebook Click ID for attribution and deduplication';
COMMENT ON COLUMN tenants.first_visit_at IS 'Timestamp of the user''s first visit to the site (from frontend tracking)';
