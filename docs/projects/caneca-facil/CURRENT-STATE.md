# Caneca Fácil — Current State

Updated: 2026-09-19

## Repository
Phase A base: `db92bf43d74235cdaca9d8794ad188c6ad871efe`.
Active implementation branch: `phase-b-conversational-ai`.
Draft PR: `#8`.

## Phase A
Complete and accepted. Own chat, anonymous session, SSE, provider-neutral messages, durable history and private direct uploads are present. Active runtime is Meta/WhatsApp-free.

## Supabase
Project `ijquzclfijwfgwupoxmg` remains the authority. Round 3 proved a storefront schema gap and applied migration `storefront_catalog_fields`: `mug_templates` now has description, tags, authoritative `base_price_cents`, image URL and indexes. Null price deliberately means the template is not sellable until configured. RLS remains enabled.

## Phase B — ACCEPTED
Round 1 implementation is complete: Supabase briefing adapter, real turn orchestration, structured assistant content, validated component SSE, retry replay, OpenAI backend adapter and ownership gates.

Round 2 is accepted. CI run `35428936326` on checkpoint `d7c910e7` completed successfully after the Node ESM core import correction, proving the full repository CI including production API smoke. Same-engine multi-turn acceptance coverage and correction preservation are documented in `docs/acceptance/phase-b-conversational-ai.md`.

## Phase C — ACTIVE
Round 3 is active. `packages/core/src/storefront.ts` provides deterministic active-only search, tag/price/capacity filtering, contextual recommendation ranking and bounded comparison. The persistence gap is now closed in Supabase and mirrored by repository migration `20260919041600_storefront_catalog_fields.sql`.

API persistence contracts were added in `apps/api/src/storefront/`: catalog reads map only sellable templates (configured integer-cent price), and project binding validates that the conversation has an active project and that the selected template is active/sellable before updating the project.

## Next executable work
1. Add storefront service/routes for search/recommend/compare/select using the deterministic core and Supabase store.
2. Add route/store tests including inactive/unpriced rejection and conversation/project binding.
3. Expose bounded storefront components through the chat protocol and then advance Round 4 UI integration.
4. Keep pricing and selection server-authoritative and deterministic.
