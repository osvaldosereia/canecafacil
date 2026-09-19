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
Phase A is complete. Rounds 1 and 2 are complete. Phase B is ACCEPTED: CI run `35428936326` succeeded end-to-end, including production API smoke, after the Node ESM correction.

Round 3 / Phase C is active. Deterministic storefront search/filter/recommend/compare already exists in core. This round proved that `mug_templates` lacked safe authoritative commerce metadata, so Supabase migration `storefront_catalog_fields` was applied and mirrored in `supabase/migrations/20260919041600_storefront_catalog_fields.sql`. It adds description, tags, `base_price_cents`, image URL and indexes. Null price means not sellable.

`apps/api/src/storefront/storefront-store.ts` now defines the persistence boundary and `supabase-storefront-store.ts` implements sellable catalog reads plus safe template binding to the conversation's active project.

## Continue autonomously
1. Implement storefront service/routes for search, recommend, compare and select/project binding.
2. Add store/service/route tests, especially inactive/unpriced rejection and ownership-safe binding.
3. Extend bounded chat components for storefront cards/carousels/selections and begin Round 4 UI integration if Round 3 closes early.
4. Run tests/typecheck/build/no-Meta and inspect CI after commits.
5. Keep prices and protected selection state server-authoritative; AI may recommend but never invent price or force selection.
6. Update CURRENT-STATE/HANDOFF after substantial progress.

Never reintroduce Meta, WhatsApp or Make runtime code. Never program in `osvaldosereia/CHAT`. Do not mix Dona Antônia or any other project.
