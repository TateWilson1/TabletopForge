# TabletopForge Backend

This is a separate Node/Express backend for Azure App Service. The frontend can remain a static GitHub Pages site, and the frontend should call this backend by URL.

## Endpoints

```txt
GET  /health
POST /api/ai/generate-inject
```

`POST /api/ai/generate-inject` requires the access code in either:

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
OPENAI_API_KEY="sk-proj-YOUR_OPENAI_KEY"
OPENAI_MODEL="gpt-5-mini"
TABLETOPFORGE_AI_ACCESS_CODE="change-this-before-public-use"
TABLETOPFORGE_AI_DAILY_LIMIT="50"
TABLETOPFORGE_ALLOWED_ORIGINS="https://tatewilson1.github.io,http://localhost:3000,http://localhost:3001"
PORT="3000"
```

Notes:

- `OPENAI_API_KEY` must stay server-only.
- `OPENAI_MODEL` defaults to `gpt-5-mini` if omitted.
- `TABLETOPFORGE_AI_DAILY_LIMIT` is enforced in memory per running server instance.
- `TABLETOPFORGE_ALLOWED_ORIGINS` should include your GitHub Pages origin, not the full path. Use `https://tatewilson1.github.io`, not `https://tatewilson1.github.io/TabletopForge`.

## Local Testing

From the backend folder:

```powershell
cd backend
npm install
npm run dev
```

Health check:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/health"
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
OPENAI_API_KEY
OPENAI_MODEL
TABLETOPFORGE_AI_ACCESS_CODE
TABLETOPFORGE_AI_DAILY_LIMIT
TABLETOPFORGE_ALLOWED_ORIGINS
```

5. Confirm:

```txt
https://YOUR-APP-SERVICE-NAME.azurewebsites.net/health
```

After that, the static GitHub Pages frontend can call:

```txt
https://YOUR-APP-SERVICE-NAME.azurewebsites.net/api/ai/generate-inject
```

## GitHub Actions OIDC Deployment

The repo includes `.github/workflows/deploy-backend-azure.yml`, which deploys only the `backend` folder.

Set this GitHub Actions variable:

```txt
AZURE_WEBAPP_NAME
```

Set these GitHub Actions secrets for Azure OIDC login:

```txt
AZURE_CLIENT_ID
AZURE_TENANT_ID
AZURE_SUBSCRIPTION_ID
```

The Azure App Service application settings still need:

```txt
DATABASE_URL
OPENAI_API_KEY
OPENAI_MODEL
TABLETOPFORGE_AI_ACCESS_CODE
TABLETOPFORGE_AI_DAILY_LIMIT
TABLETOPFORGE_ALLOWED_ORIGINS
```

This GitHub Actions workflow avoids relying on Azure Deployment Center's GitHub source-control token setup.
