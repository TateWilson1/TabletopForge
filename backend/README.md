# TabletopForge Backend

This is a separate Node/Express backend for Azure App Service. The frontend can remain a static GitHub Pages site, and the frontend should call this backend by URL.

## Endpoints

```txt
GET  /health
POST /api/auth/request-code
POST /api/auth/verify-code
POST /api/auth/password-register
POST /api/auth/password-login
POST /api/auth/logout
GET  /api/me
GET  /api/entitlements
GET  /api/admin/overview
GET  /api/admin/users
POST /api/admin/grant-credit
POST /api/admin/reset-free-generation
POST /api/tabletops/generate-ai
POST /api/tabletops/generate
POST /api/tabletops/consume-generation
POST /api/billing/create-checkout-session
POST /api/billing/stripe-webhook
POST /api/ai/generate-inject
```

Account endpoints require `DATABASE_URL`. User-facing account creation requires a verification code before a password can be set. In Azure/public hosting, codes should be delivered by email and should not be shown on screen. `POST /api/tabletops/generate-ai` generates a full AI-authored tabletop package, stores it in PostgreSQL, and consumes one free generation, one purchased generation credit, or allows generation for an active subscription. `POST /api/tabletops/generate` remains as a deterministic fallback/storage route.

Admin endpoints require `DATABASE_URL`, a valid signed-in session, and a user email listed in `TABLETOPFORGE_ADMIN_EMAILS`.

`POST /api/ai/generate-inject` accepts either a signed-in account session:

```txt
Authorization: Bearer your-session-token
```

or the legacy access code in either:

```txt
x-tabletopforge-ai-access-code: your-code
```

or the JSON request body:

```json
{
  "accessCode": "your-code"
}
```

Using the header is preferred so the access code is not mixed into the AI prompt payload.

## Environment Variables

Create `backend/.env` locally or add these as Azure App Service application settings:

```env
DATABASE_URL="postgresql://tabletopadmin:YOUR_PASSWORD@tabletopforgedatabase.postgres.database.azure.com:5432/tabletopforge?sslmode=require"
TABLETOPFORGE_AUTH_SECRET="use-a-long-random-secret"
TABLETOPFORGE_AUTH_DELIVERY_MODE="email"
TABLETOPFORGE_AUTH_FROM_EMAIL="TabletopForge <verify@yourdomain.com>"
RESEND_API_KEY="re_YOUR_RESEND_KEY"
TABLETOPFORGE_ALLOW_SCREEN_CODES="false"
TABLETOPFORGE_ADMIN_EMAILS="you@example.com"
TABLETOPFORGE_AUTO_MIGRATE="true"
TABLETOPFORGE_SUBSCRIPTION_MONTHLY_LIMIT="10"
OPENAI_API_KEY="sk-proj-YOUR_OPENAI_KEY"
OPENAI_MODEL="gpt-5-mini"
TABLETOPFORGE_AI_FEATURE_ENABLED="true"
TABLETOPFORGE_AI_ACCESS_CODE="change-this-before-public-use"
TABLETOPFORGE_AI_DAILY_LIMIT="50"
TABLETOPFORGE_ALLOWED_ORIGINS="https://tatewilson1.github.io,http://localhost:3000,http://localhost:3001"
PUBLIC_APP_URL="https://tatewilson1.github.io/TabletopForge"
STRIPE_SECRET_KEY="sk_test_YOUR_STRIPE_KEY"
STRIPE_PRICE_TABLETOP="price_YOUR_ONE_TIME_TABLETOP_PRICE"
STRIPE_PRICE_SUBSCRIPTION="price_YOUR_SUBSCRIPTION_PRICE"
STRIPE_WEBHOOK_SECRET="whsec_YOUR_WEBHOOK_SECRET"
PORT="3000"
```

Notes:

- `DATABASE_URL` is required for accounts, free-generation limits, and billing state.
- `TABLETOPFORGE_AUTH_SECRET` should be a long random value and should stay server-only.
- Password sign-in is supported only after the email owner verifies a code and creates the account password.
- `TABLETOPFORGE_AUTH_DELIVERY_MODE="email"` uses Resend for verification emails. Set `RESEND_API_KEY` and `TABLETOPFORGE_AUTH_FROM_EMAIL` in Azure App Service settings.
- `TABLETOPFORGE_AUTH_DELIVERY_MODE="screen"` is for local testing only. The backend will not use screen-code mode on Azure unless `TABLETOPFORGE_ALLOW_SCREEN_CODES="true"` is deliberately set.
- `TABLETOPFORGE_ADMIN_EMAILS` is a comma-separated allowlist for admin console access. Keep it server-side in Azure App Service settings.
- `TABLETOPFORGE_AUTO_MIGRATE` lets the backend create the SaaS account/billing support tables on startup. Keep Prisma migrations as the source of truth; this is a deployment safety net.
- `TABLETOPFORGE_SUBSCRIPTION_MONTHLY_LIMIT` caps subscription generations per calendar month.
- `OPENAI_API_KEY` must stay server-only.
- `OPENAI_MODEL` defaults to `gpt-5-mini` if omitted.
- `TABLETOPFORGE_AI_FEATURE_ENABLED` must be `true` for full AI tabletop generation, AI injects, and AI assistance. Keep it `false` only when you intentionally want local fallback behavior.
- `TABLETOPFORGE_AI_DAILY_LIMIT` is enforced in memory per running server instance.
- `TABLETOPFORGE_ALLOWED_ORIGINS` should include your GitHub Pages origin, not the full path. Use `https://tatewilson1.github.io`, not `https://tatewilson1.github.io/TabletopForge`.
- Stripe variables are optional until you want real paid checkout. Without them, the checkout endpoint returns a clear configuration error.

## Database Migration

After pulling these changes, apply the Prisma migrations from the repo root:

```powershell
npm install
npx prisma migrate deploy
```

For local development against a disposable database, use:

```powershell
npx prisma migrate dev
```

## Local Testing

From the backend folder:

```powershell
cd backend
npm install
npm run dev
```

For local-only screen codes, set these in `backend/.env`:

```env
TABLETOPFORGE_AUTH_DELIVERY_MODE="screen"
TABLETOPFORGE_ALLOW_SCREEN_CODES="true"
```

Health check:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/health"
```

Request a login code:

```powershell
$body = @{ email = "you@example.com" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/auth/request-code" -ContentType "application/json" -Body $body
```

Verify the code and copy the returned token:

```powershell
$body = @{ email = "you@example.com"; code = "123456" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/auth/verify-code" -ContentType "application/json" -Body $body
```

Generate an inject:

```powershell
$headers = @{
  "Content-Type" = "application/json"
  "x-tabletopforge-ai-access-code" = "change-this-before-public-use"
}

$body = @{
  exercise = @{
    organization = "Sample Company"
    industry = "Manufacturing"
    organizationSize = "101-500"
    scenario = "Phishing / Business Email Compromise"
    maturityLevel = "Basic"
    duration = "60 minutes"
    summary = "An employee reported a suspicious executive wire-transfer email."
    objectives = @("Validate escalation and communication decisions.")
  }
  currentStep = @{
    title = "Initial Report"
    knownFacts = @("One employee clicked a suspicious link.")
    unknowns = @("Whether the account was accessed.")
    decisions = @("Who owns initial triage?")
  }
  previousInjects = @()
  sessionNotes = ""
} | ConvertTo-Json -Depth 8

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/ai/generate-inject" -Headers $headers -Body $body
```

## Azure App Service Deployment

One straightforward approach:

1. Create an Azure App Service with a Node.js runtime.
2. Deploy the `backend` folder as the app root.
3. Set the startup command:

```txt
npm start
```

4. Add application settings in Azure:

```txt
DATABASE_URL
TABLETOPFORGE_AUTH_SECRET
TABLETOPFORGE_AUTH_DELIVERY_MODE
TABLETOPFORGE_AUTH_FROM_EMAIL
RESEND_API_KEY
TABLETOPFORGE_ALLOW_SCREEN_CODES
TABLETOPFORGE_ADMIN_EMAILS
TABLETOPFORGE_AUTO_MIGRATE
TABLETOPFORGE_SUBSCRIPTION_MONTHLY_LIMIT
OPENAI_API_KEY
OPENAI_MODEL
TABLETOPFORGE_AI_FEATURE_ENABLED
TABLETOPFORGE_AI_ACCESS_CODE
TABLETOPFORGE_AI_DAILY_LIMIT
TABLETOPFORGE_ALLOWED_ORIGINS
PUBLIC_APP_URL
STRIPE_SECRET_KEY
STRIPE_PRICE_TABLETOP
STRIPE_PRICE_SUBSCRIPTION
STRIPE_WEBHOOK_SECRET
```

5. Confirm:

```txt
https://YOUR-APP-SERVICE-NAME.azurewebsites.net/health
```

After that, the static GitHub Pages frontend can call:

```txt
https://YOUR-APP-SERVICE-NAME.azurewebsites.net/api/ai/generate-inject
```

## Frontend Connection

The static frontend reads the backend URL from:

```env
NEXT_PUBLIC_TABLETOPFORGE_API_URL="https://YOUR-APP-SERVICE-NAME.azurewebsites.net"
```

For GitHub Pages, `.github/workflows/deploy-pages.yml` sets this during the static build. Locally, add it to `.env.local` if you want to test the hosted backend from `npm run dev`.

AI injects are optional in the session UI. If the OpenAI account has no credits, the backend is unavailable, or the access code is wrong, the frontend falls back to the built-in scenario twists so the exercise can keep running.

For the paid-product flow, the frontend signs users in through the backend and calls `/api/tabletops/generate-ai` first. The backend checks entitlement before calling OpenAI, sends the input context and IRP text to OpenAI for tailoring, stores only the generated tabletop output, and does not store raw uploaded IRP contents. If AI is unavailable during testing, the frontend falls back to `/api/tabletops/generate`.

The access code is now mainly a testing fallback. The production direction is account sessions plus Stripe-backed entitlements.

## GitHub Actions Publish Profile Deployment

The repo includes `.github/workflows/deploy-backend-azure.yml`, which deploys only the `backend` folder.

Set this GitHub Actions variable:

```txt
AZURE_WEBAPP_NAME
```

Set this GitHub Actions secret from the Azure App Service publish profile:

```txt
AZURE_WEBAPP_PUBLISH_PROFILE
```

The Azure App Service application settings still need:

```txt
DATABASE_URL
TABLETOPFORGE_AUTH_SECRET
TABLETOPFORGE_AUTH_DELIVERY_MODE
TABLETOPFORGE_AUTH_FROM_EMAIL
RESEND_API_KEY
TABLETOPFORGE_ALLOW_SCREEN_CODES
TABLETOPFORGE_ADMIN_EMAILS
TABLETOPFORGE_AUTO_MIGRATE
TABLETOPFORGE_SUBSCRIPTION_MONTHLY_LIMIT
OPENAI_API_KEY
OPENAI_MODEL
TABLETOPFORGE_AI_FEATURE_ENABLED
TABLETOPFORGE_AI_ACCESS_CODE
TABLETOPFORGE_AI_DAILY_LIMIT
TABLETOPFORGE_ALLOWED_ORIGINS
PUBLIC_APP_URL
STRIPE_SECRET_KEY
STRIPE_PRICE_TABLETOP
STRIPE_PRICE_SUBSCRIPTION
STRIPE_WEBHOOK_SECRET
```

This GitHub Actions workflow avoids relying on Azure Deployment Center's GitHub source-control token setup and does not require `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, or `AZURE_SUBSCRIPTION_ID`.
