# TabletopForge

TabletopForge is an incident response tabletop exercise generator for small businesses, MSPs, IT teams, and cybersecurity students.

Tagline: Simple incident response tabletop exercises for real-world readiness.

## Overview

TabletopForge is being built as a public SaaS website, not a private access-code tool. Users should be able to create an account, log in, receive one free tabletop generation, and then continue by buying individual tabletop generation credits or subscribing for more generation access.

The product focuses on practical tabletop packages that help organizations test incident response planning, discover IRP gaps, and produce executive-ready documentation. OpenAI usage belongs behind the backend only; browser code should never receive or expose the OpenAI API key.

## Features

- Scenario builder for phishing/BEC, ransomware, data exfiltration, compromised admin accounts, lost laptops, vendor breaches, insider threats, and cloud misconfiguration
- Organization profile fields for industry, size, maturity level, duration, and optional question sets
- Scenario summaries, objectives, participants, discussion questions, IRP gap-discovery questions, expected decisions, facilitator notes, and executive summaries
- Lessons-learned template with action item, owner, due date, and priority prompts
- Copyable and downloadable Markdown reports
- Browser-based saved exercises with LocalStorage
- User account flow for free-generation and paid-credit entitlement checks
- PostgreSQL-backed generation records tied to user accounts
- Stripe-ready backend for pay-per-generation and subscription checkout
- Monthly subscription generation cap before AI billing is enabled
- Draft terms, privacy, and refund/cancellation pages
- Responsive dark GRC dashboard interface

## Tech Stack

- Next.js 15
- TypeScript
- Tailwind CSS
- shadcn/ui-style components
- App Router
- Azure App Service backend
- Azure PostgreSQL
- Prisma migrations
- Stripe-ready billing endpoints
- OpenAI API server-side only

## SaaS Architecture Direction

The long-term architecture is:

1. Static/public frontend hosts the user experience.
2. Backend owns authentication, authorization, generation entitlement, billing, and all OpenAI calls.
3. PostgreSQL stores users, sessions, generated tabletops, usage ledgers, paid-credit ledgers, subscription records, AI runs, uploaded file metadata, and deletion logs.
4. Each user receives one free generation.
5. After the free generation is used, `/api/tabletops/generate` blocks generation unless the user has purchased credits or an active subscription.
6. Stripe Checkout grants either one paid generation credit or subscription status through webhook events.
7. Subscriptions are capped by `TABLETOPFORGE_SUBSCRIPTION_MONTHLY_LIMIT` before public AI usage is enabled.
8. `TABLETOPFORGE_AI_ACCESS_CODE` is only a temporary development/testing guard. Production authorization should be user-session based.
9. `TABLETOPFORGE_AI_FEATURE_ENABLED` should stay `false` until OpenAI billing, rate limits, and prompts are ready.
10. Uploaded IRP contents should not be stored in PostgreSQL. Store generated tabletop output and Azure Blob metadata only.

## Backend API Direction

The backend is responsible for:

- `GET /api/entitlements`: return user usage and generation eligibility.
- `POST /api/tabletops/generate`: create/store a user-owned tabletop generation after entitlement checks.
- `POST /api/billing/create-checkout-session`: start Stripe Checkout for pay-per-generation or subscription.
- `POST /api/billing/stripe-webhook`: receive Stripe events and update credits/subscriptions.
- `POST /api/ai/generate-inject`: generate live injects with server-side OpenAI access and user-based authorization.

The current frontend still uses the deterministic local generator for the tabletop package, then sends the generated package to the backend for entitlement enforcement and PostgreSQL storage. The backend route is the place to move full AI tabletop generation when OpenAI credits and final prompts are ready.

## Implementation Roadmap

Completed foundation:

- Azure backend separated from GitHub Pages static hosting.
- Server-side OpenAI key usage for AI injects.
- Account/session endpoints.
- One-free-generation entitlement model.
- Paid-credit and subscription-ready data model.
- Stripe checkout/webhook route skeleton.
- PostgreSQL storage for generated tabletop records tied to users.
- Monthly subscription generation limit.
- Account dashboard with recent PostgreSQL-backed tabletop generations.
- Draft privacy, terms, and refund/cancellation pages.

Next setup steps:

- Add a long random `TABLETOPFORGE_AUTH_SECRET` in Azure App Service settings.
- Keep `TABLETOPFORGE_AUTH_DELIVERY_MODE="screen"` only for testing; replace it with real email/OAuth before public paid launch.
- Add OpenAI credits before enabling real AI generation paths.
- Keep `TABLETOPFORGE_AI_FEATURE_ENABLED="false"` until you are ready for OpenAI spend.
- Replace the temporary access-code testing path with user-session-only authorization for production.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Use Without Installing Developer Tools

Most users should not run the project with `npm`. Publish the app as a hosted SaaS website where the frontend calls the Azure App Service backend.

- Hosted website: run `npm run build:static` during deployment and publish the generated `out/` folder through GitHub Pages or another static host.
- Backend: deploy the `backend` folder to Azure App Service.
- Database: use Azure PostgreSQL with Prisma migrations and/or the backend bootstrap safety net.

The browser can still keep local saved sessions for convenience, but the SaaS product direction is PostgreSQL-backed user ownership and billing-aware generation limits.

See `docs/DISTRIBUTION.md` for the GitHub Pages and desktop release path, including an example GitHub Actions workflow.

## Build And Lint

```bash
npm run lint
npm run build
```

## Portfolio Case Study

Read the case study on my portfolio: https://tatewilson1.github.io/case-tabletopforge.html

## Resume Bullet

Built TabletopForge, a full-stack incident response tabletop exercise generator that creates scenario-based discussion guides, IRP gap-discovery questions, executive summaries, and lessons-learned templates for cybersecurity readiness planning.

## Disclaimer

TabletopForge does not replace professional legal, compliance, cybersecurity, or incident response advice. Use it as a readiness planning aid and validate decisions with qualified advisors.
