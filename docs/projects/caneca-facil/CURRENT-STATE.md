# Caneca Fácil — Current State

Updated: 2026-09-19

## Repository
Phase A base: `db92bf43d74235cdaca9d8794ad188c6ad871efe`. Active implementation branch: `phase-b-conversational-ai`. Draft PR: `#8`.

## Phase A
Complete and accepted. Own chat, anonymous session, SSE, provider-neutral messages, durable history and private direct uploads are present. Active runtime is Meta/WhatsApp-free.

## Supabase
Project `ijquzclfijwfgwupoxmg` remains the authority. Round 3 applied `storefront_catalog_fields`: `mug_templates` has description, tags, authoritative `base_price_cents`, image URL and indexes. Null price means not sellable. RLS remains enabled.

## Phase B — ACCEPTED
Rounds 1-2 are accepted. CI `35428936326` proved tests, typecheck, no-Meta guard, production build and API smoke. Same-engine multi-turn acceptance is documented in `docs/acceptance/phase-b-conversational-ai.md`.

## Phase C — ACTIVE
Deterministic active-only search, tag/price/capacity filtering, contextual recommendations and bounded comparison live in core. Supabase persistence maps only sellable templates and selection validates active project plus active/priced template before binding.

This round added `StorefrontService` and session-scoped own-chat routes for search, recommend, compare and select. Selection remains server-authoritative and derives conversation ownership exclusively from the HttpOnly session; callers cannot submit a conversation/project id. The service caps recommendations and comparison size.

Commits: `899a484f` storefront service, `1f4ef827` routes, `a7b41847` app wiring.

## Next executable work
1. Add service/route/store tests, especially inactive/unpriced rejection, session ownership and project binding.
2. Extend the bounded chat component protocol with storefront card/carousel/selection payloads.
3. Advance Round 4: render storefront components in the chat and connect selection actions to the session-scoped API.
4. Run tests/typecheck/build/no-Meta and inspect CI; fix regressions before declaring Round 3 complete.
