# AI Backend Plan

TabletopForge should stay local-only until AI mode is intentionally enabled.

## Future Backend Boundary

The frontend should never call OpenAI directly. Future AI requests should go through a backend that stores the OpenAI API key as a server-side secret.

Suggested endpoints:

- `POST /api/ai/inject` returns one scenario-aware inject.
- `POST /api/ai/stuck` returns a facilitator coaching prompt.
- `POST /api/ai/action-items` returns action items from session state.
- `POST /api/ai/scorecard` returns scorecard analysis from the completed session context.
- `POST /api/ai/irp-summary` returns a gap summary from pasted or uploaded IRP text.

## Data Contract

Use the exported `aiContext` JSON as the stable starting payload. Keep the schema versioned so the backend can reject unknown payload shapes.

## Required Guardrails

- API key stored only in backend environment variables.
- Separate OpenAI project for TabletopForge production.
- Invite code or login before public AI access.
- Per-user and per-IP rate limits.
- Daily and monthly app-side caps.
- Model allowlist.
- Request size limits for IRP text.
- Clear opt-in before sending IRP or session notes to AI.
- Logging for cost, errors, and abuse detection.

## First AI Feature To Build Later

Start with `POST /api/ai/stuck`. It is low risk, low cost, and improves facilitation without needing the AI to fully control the exercise.
