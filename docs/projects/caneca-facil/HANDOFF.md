# Caneca Fácil — Handoff

Read this file first in every continuation.

## Sources of truth
Repository: `osvaldosereia/canecafacil`
Supabase: `ijquzclfijwfgwupoxmg`
Active branch: `phase-b-conversational-ai`
Draft PR: `#8`.
Historical only: `osvaldosereia/CHAT`

Then read `CURRENT-STATE.md`, `PROJECT-MASTER.md`, `ROADMAP.md`, `DECISIONS.md`.

## Current checkpoint
Phase A is complete. Rounds 1 and 2 are complete. Phase B is ACCEPTED by CI `35428936326` including production API smoke.

Round 3 / Phase C remains near closure. Core search/filter/recommend/compare, Supabase catalog fields/store and session-scoped search/recommend/compare/select routes exist. CI `35437027872` failed in Test because a new service fixture used `priceCents` instead of canonical `basePriceCents`; corrected by `75e117bd`.

Round 4 has materially advanced. The validated `storefront_carousel` protocol now reaches the customer UI from both persisted `structuredContent` and live SSE. Cards show server-provided BRL price, optional capacity/image/description, stay horizontally browsable/mobile-first, and select through `/v1/chat/storefront/select` only. The browser API sends only `templateId`, preserving HttpOnly-session ownership. Commits: `77d7a183`, `592f09fb`, `be9f42e2`.

## Continue autonomously
1. Inspect CI after `75e117bd` plus the chat integration and fix any regression immediately.
2. Add Supabase storefront adapter tests for inactive/unpriced rejection and active-project binding; formally close Round 3 once green.
3. Add focused chat/API tests for restored carousel, live component event and selection request containing only `templateId`; formally close Round 4 once green.
4. Start Round 5 immediately after those gates: creative-production provider/store contracts, immutable art versions, reference/media inputs, validation and test provider; do not wait for external AI credentials.
5. Preserve server-authoritative prices/protected state, private media, idempotency, RLS and no-Meta/no-WhatsApp/no-Make runtime.
6. Update CURRENT-STATE/HANDOFF after substantial progress.

Never reintroduce Meta, WhatsApp or Make runtime code. Never program in `osvaldosereia/CHAT`. Do not mix Dona Antônia or any other project.
