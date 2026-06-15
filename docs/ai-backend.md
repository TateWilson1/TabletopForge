# TabletopForge AI Backend Plan

This project is prepared for AI, but the public GitHub Pages deployment is still a static export. Static hosting cannot securely run OpenAI requests, hide `OPENAI_API_KEY`, enforce rate limits, or write AI run logs to PostgreSQL.

## Current State

- Prisma is connected to Azure PostgreSQL.
- `AiRun` has fields for status, token counts, result JSON, errors, and completion time.
- `lib/ai/tabletop-ai.ts` contains the server-only AI inject generator.
- `.env.example` documents the server-side environment variables.
- Real `.env` files remain ignored.
- GitHub Pages remains the default build path.

## Required Environment Variables

```env
DATABASE_URL="postgresql://tabletopadmin:YOUR_PASSWORD@tabletopforgedatabase.postgres.database.azure.com:5432/tabletopforge?sslmode=require"
OPENAI_API_KEY="sk-proj-YOUR_OPENAI_KEY"
OPENAI_MODEL="gpt-5.4-mini"
TABLETOPFORGE_AI_ACCESS_CODE="change-this-before-public-use"
TABLETOPFORGE_AI_DAILY_LIMIT="50"
TABLETOPFORGE_SERVER_BUILD="true"
```

`OPENAI_API_KEY` must only exist on the server. Never expose it as `NEXT_PUBLIC_OPENAI_API_KEY`.

## Server Hosting Switch

For GitHub Pages, keep the default static build:

```powershell
npm run build:static
```

For Azure App Service, Vercel, or another server-capable host, set:

```env
TABLETOPFORGE_SERVER_BUILD="true"
```

Then build normally:

```powershell
npm run build
```

## First API Route To Add After Hosting

Once the app runs on server hosting, add a route like:

```txt
POST /api/ai/generate-inject
```

The route should:

1. Require authentication or a temporary access code.
2. Validate request size.
3. Call `generateScenarioInject` from `lib/ai/tabletop-ai.ts`.
4. Return only the generated inject JSON.
5. Log the run in `AiRun` when a `tabletopId` is available.

## Privacy Rule

Uploaded IRP contents should not be stored in PostgreSQL. Store only Azure Blob metadata in `UploadedFile`. When AI IRP analysis is added, read the file temporarily on the server, send only the needed excerpt to the model, save derived findings if needed, and discard the raw content.
