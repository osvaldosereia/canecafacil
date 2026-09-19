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
Deterministic active-only search, tag/price/capacity filtering, contextual recommendations and bounded comparison live in core. Supabase persistence maps only sellable templates and selection validates active project plus active/priced template before binding.

StorefrontService and session-scoped own-chat routes provide search, recommend, compare and select. Selection remains server-authoritative and derives conversation ownership exclusively from the HttpOnly session; callers cannot submit a conversation/project id.

This round added service tests and route security tests covering session requirement, normalized filters, wrong-origin rejection, invalid selection, protected-domain error mapping and proof that caller-supplied conversation/project ids cannot override session ownership. It also began Round 4 safely by extending the bounded chat protocol with a validated `storefront_carousel` carrying at most eight server-priced templates; arbitrary/negative prices and oversized payloads are rejected.

Commits this round: `101fca7a`, `4e262596`, `98c28ecb`, `06e09b34`.

## Next executable work
1. Add Supabase storefront adapter tests for inactive/unpriced rejection and active-project binding.
2. Run/inspect CI for the new tests and component protocol; fix any regression before declaring Round 3 complete.
3. Continue Round 4: render `storefront_carousel` in the customer chat and connect selection actions to `/v1/chat/storefront/select`.
4. Keep displayed price and protected selection state server-authoritative; AI may request/recommend catalog context but must never invent price.
