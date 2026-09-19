# Caneca Fácil — Current State

Updated: 2026-09-19

## Repository
Phase A base: `db92bf43d74235cdaca9d8794ad188c6ad871efe`. Active implementation branch: `phase-b-conversational-ai`. Draft PR: `#8`.

## Phase A
Complete and accepted. Own chat, anonymous session, SSE, provider-neutral messages, durable history and private direct uploads are present. Active runtime is Meta/WhatsApp-free.

## Supabase
Project `ijquzclfijwfgwupoxmg` remains the authority. Round 3 applied `storefront_catalog_fields`: `mug_templates` has description, tags, authoritative `base_price_cents`, image URL and indexes. Null price means not sellable. RLS remains enabled. No new database change was needed in this round.

## Phase B — ACCEPTED
Rounds 1-2 are accepted. CI `35428936326` proved tests, typecheck, no-Meta guard, production build and API smoke. Same-engine multi-turn acceptance is documented in `docs/acceptance/phase-b-conversational-ai.md`.

## Phase C — ACTIVE
Deterministic active-only search, tag/price/capacity filtering, contextual recommendations and bounded comparison live in core. Supabase persistence maps only sellable templates and selection validates active project plus active/priced template before binding. StorefrontService and session-scoped own-chat routes provide search, recommend, compare and select; callers cannot override session ownership with conversation/project ids.

The latest CI exposed a storefront fixture drift (`priceCents` versus the canonical `basePriceCents`) during Test. That regression was corrected in `75e117bd`; the product contract remains server-authoritative.

## Round 4 — ACTIVE
The bounded protocol supports validated `storefront_carousel` payloads (maximum eight server-priced models). The customer chat now consumes carousel components from persisted structured content and live SSE, renders a calm horizontal model browser with BRL prices, and selects only through the session-scoped `/v1/chat/storefront/select` endpoint. The browser never sends conversation/project ownership. Client API commit: `77d7a183`; rendering commit: `592f09fb`; responsive styling: `be9f42e2`.

## Next executable work
1. Inspect the next CI after the fixture correction and chat carousel integration; fix any test/type/build regression.
2. Add Supabase storefront adapter tests for inactive/unpriced rejection and active-project binding, then close Round 3 formally.
3. Add focused chat/API tests for carousel restoration, live component handling and session-scoped selection; close Round 4 when green.
4. Immediately begin Round 5 creative-production provider/store contracts and immutable art-version pipeline without waiting for external credentials.
