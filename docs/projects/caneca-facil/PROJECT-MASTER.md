# Caneca Fácil — Project Master

## Authority
Official repository: `osvaldosereia/canecafacil`.
Official Supabase project: `ijquzclfijwfgwupoxmg`.
`osvaldosereia/CHAT` is historical only.

## Product
Caneca Fácil is a first-party conversational commerce platform for personalized mugs. The conversation is the store. Customer experience is mobile-first, calm, spacious and human, with contextual rich objects instead of traditional ecommerce chrome.

## Architecture
- `apps/chat`: React/Vite/PWA customer chat.
- `apps/api`: Hono/Node backend and orchestration.
- `apps/admin`: operational workspace.
- `packages/core`: deterministic domain contracts/rules.
- Supabase: Postgres/Auth/private Storage.
- OpenAI: backend-only AI provider in Phase B+.

## Hard boundaries
No Meta, WhatsApp or Make runtime dependency. AI never owns prices, payment truth, production release or protected state transitions. Structured AI output must be validated. Media stays private. Writes/jobs are idempotent. Database changes are forward-only migrations.

## Delivery phases
A Own Chat Foundation; B Conversational AI; C Intelligent Storefront; D Creative Production; E Commerce; F Operations & Automation.

See `ROADMAP.md`, `CURRENT-STATE.md`, `DECISIONS.md`, and `HANDOFF.md` in this directory for the live continuation state.