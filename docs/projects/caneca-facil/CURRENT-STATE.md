# Caneca Fácil — Current State

Updated: 2026-09-18

## Repository
Phase A base: `db92bf43d74235cdaca9d8794ad188c6ad871efe`. Active implementation branch: `phase-b-conversational-ai`.

## Phase A
Complete and accepted. Own chat, anonymous session, SSE, provider-neutral messages, durable history and private direct uploads are present. Active runtime is Meta/WhatsApp-free.

## Supabase live verification
Project `ijquzclfijwfgwupoxmg` is active. Public schema already has the own-chat and creative-domain persistence needed for the current Phase B work, including versioned `briefings`. No database migration is currently justified.

## Phase B
In progress. Canonical documentation is established. The deterministic briefing core is now implemented in `packages/core/src/briefing.ts`: safe partial merge, targeted correction, normalized/deduplicated list facts, deterministic missing-information calculation, confidence/readiness and minimum-next-question selection. Coverage was added in `packages/core/src/briefing.test.ts`.

Commits in this checkpoint:
- `886173bf2e81f271da09b6e3522bf4ae5af70089` — deterministic briefing engine.
- `7084d0a7c3c551e24e8f94e8644ddf813764d65b` — deterministic briefing tests.

## Next executable work
Add the versioned validated rich-component protocol in `packages/core`, then add the backend-only structured conversation interpreter/provider boundary with a deterministic fake for tests. After that, wire orchestration into the existing own-chat turn/SSE flow and persist final structured assistant content. Do not add schema changes unless a concrete persistence gap is proven.