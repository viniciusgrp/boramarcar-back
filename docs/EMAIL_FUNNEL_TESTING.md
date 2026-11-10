# Email Funnel Testing Guide

## Testing the New Email Funnel Features in HML

### Prerequisites
- Backend running in HML environment with `APP_ENV=hml`
- SMTP configured (MAIL_PROVIDER=resend or ses)
- Platform admin authentication token

### Test Endpoint

The new test endpoint allows sending funnel emails in non-production environments without requiring `APP_ENV=production`:

```bash
POST /platform/email-funnel/steps/:stepKey/test
```

**Authentication**: Requires platform admin authentication (JWT token)

**Body Parameters**:
```json
{
  "to": "your-test-email@example.com",
  "tenant_id": "optional-tenant-uuid"
}
```

### Testing Steps

#### 1. Get Platform Admin Token

First, authenticate as platform admin to get your JWT token:

```bash
# Login to platform (requires PLATFORM_LOGIN_PASSPHRASE)
curl -X POST https://app-hml.horariocerto.app/platform/auth/login \
  -H "Content-Type: application/json" \
  -d '{"passphrase": "YOUR_PLATFORM_PASSPHRASE"}' \
  | jq -r '.access_token'
```

Save the returned token as `PLATFORM_TOKEN`.

#### 2. Test Individual Email Steps

Test the welcome email with example data:

```bash
curl -X POST https://app-hml.horariocerto.app/platform/email-funnel/steps/welcome/test \
  -H "Authorization: Bearer $PLATFORM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your-email@example.com"
  }'
```

Test with real tenant data (will use actual tenant name, slug, and owner first name):

```bash
curl -X POST https://app-hml.horariocerto.app/platform/email-funnel/steps/welcome/test \
  -H "Authorization: Bearer $PLATFORM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your-email@example.com",
    "tenant_id": "YOUR_TENANT_UUID"
  }'
```

#### 3. Test All Email Steps

Test each of the 11 steps:

```bash
# Existing steps (updated copy)
for step in welcome nudge_agenda leave_whatsapp tutorial video_agenda trial_mid trial_ending; do
  curl -X POST https://app-hml.horariocerto.app/platform/email-funnel/steps/$step/test \
    -H "Authorization: Bearer $PLATFORM_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"to\": \"your-email@example.com\"}"
  echo "Sent $step"
  sleep 2
done

# New steps (Part B)
for step in page_ready_share no_public_booking trial_last_day trial_ended_winback; do
  curl -X POST https://app-hml.horariocerto.app/platform/email-funnel/steps/$step/test \
    -H "Authorization: Bearer $PLATFORM_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"to\": \"your-email@example.com\"}"
  echo "Sent $step"
  sleep 2
done
```

### What to Verify in Test Emails

#### 1. **New HTML Template**
- Modern design with Horário Certo branding
- Logo appears correctly (light/dark versions for dark mode)
- Petróleo color scheme (#0F5F58 for buttons)
- Responsive layout (test on mobile and desktop)
- Proper typography (Bricolage Grotesque for titles, Inter for body)

#### 2. **Variable Interpolation**
- `{{nome}}` → Owner's first name (e.g., "Maria")
- `{{nome_negocio}}` → Tenant name (e.g., "Salão Exemplo")
- `{{link_agendamento}}` → Public booking URL (e.g., https://horariocerto.app/exemplo)
- `{{dias_restantes}}` → Trial days remaining (calculated dynamically)
- No `{{...}}` placeholders leaked into the email

#### 3. **Preheader**
- Hidden preheader text appears in email preview (check in Gmail, Outlook)
- Up to ~90 characters
- Different from subject line

#### 4. **Automatic UTMs**
- All CTA links contain:
  - `utm_source=email`
  - `utm_medium=lifecycle`
  - `utm_campaign=trial`
  - `utm_content=<step_key>` (e.g., `welcome`, `trial_mid`)
- UTMs are URL-encoded properly
- Existing query parameters preserved

#### 5. **One-Click Unsubscribe Headers**
- View email source and verify headers:
  ```
  List-Unsubscribe: <https://horariocerto.app/api/email-funnel/unsubscribe>, <mailto:contato@horariocerto.app?subject=descadastrar>
  List-Unsubscribe-Post: List-Unsubscribe=One-Click
  ```
- Test the one-click unsubscribe link (should work with POST request)

#### 6. **Company Address in Footer** (if configured)
- Check if `COMPANY_ADDRESS` env var is set
- Verify address appears in footer
- Footer gracefully omits address if not configured

#### 7. **New Step Content**

**page_ready_share** (D1):
- Mentions logo, banner, and QR code
- Shows booking link

**no_public_booking** (D5):
- Encourages sharing the link
- Mentions WhatsApp, Instagram, and QR code

**trial_last_day** (last day):
- Mentions trial ends today
- Shows plan pricing

**trial_ended_winback** (D+3 after trial):
- Friendly tone about returning
- Mentions data is kept

### Testing One-Click Unsubscribe Endpoint

#### POST Unsubscribe (RFC 8058)

Test the one-click unsubscribe endpoint:

```bash
# Get a real opt-out token from a tenant record
curl -X POST https://horariocerto.app/api/email-funnel/unsubscribe \
  -H "Content-Type: application/json" \
  -d '{"token": "TENANT_OPT_OUT_TOKEN"}'
```

Expected response:
```json
{
  "ok": true,
  "optedOut": true
}
```

Verify the tenant's `trial_email_funnel_opted_out_at` field is now set in the database.

### Environment Variables

Make sure these are configured in HML:

```bash
# Required for email sending
MAIL_PROVIDER=resend
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=your_resend_api_key
SMTP_FROM="Horário Certo <ola@horariocerto.app>"

# Optional: company address in footer
COMPANY_ADDRESS="Sua Empresa Ltda, Rua Exemplo 123, São Paulo - SP, CNPJ 00.000.000/0000-00"

# Frontend URL for links
FRONTEND_URL=https://horariocerto.app
```

### Database Migration

The migration file adds:
- `preheader` column (TEXT, nullable)
- `send_only_if` column (TEXT, nullable, CHECK constraint)
- Updates all 7 existing steps with new copy (Part A)
- Inserts 4 new steps (Part B)

Migration file: `supabase/migrations/20261110210000_email_funnel_upgrade_v1.sql`

**To apply in HML** (ask DB admin to run):
```bash
# Apply migration to HML database
psql $HML_DATABASE_URL -f supabase/migrations/20261110210000_email_funnel_upgrade_v1.sql
```

### Troubleshooting

**Email not sending:**
- Check mail service logs for configuration errors
- Verify `APP_ENV` is not blocking (test endpoint bypasses this)
- Confirm SMTP credentials are valid

**Variables not interpolating:**
- Check tenant has valid `owner_id` in database
- Verify user metadata includes `full_name` field
- Ensure tenant has `slug` set

**UTMs not appearing:**
- Check `cta_path` in step configuration
- Verify frontend URL is correctly configured

**Headers missing:**
- Check email source (View → Show Original in Gmail)
- Verify mail service is passing headers to SMTP

### Success Criteria

- [ ] All 11 email steps render correctly in multiple email clients
- [ ] Variables interpolate without errors
- [ ] Preheader appears in email preview
- [ ] UTM parameters are appended to all CTA links
- [ ] One-click unsubscribe headers present
- [ ] Company address appears when configured
- [ ] New steps content matches specification
- [ ] Dark mode logo swaps correctly
- [ ] Mobile responsive layout works
- [ ] Plain text version generated correctly
