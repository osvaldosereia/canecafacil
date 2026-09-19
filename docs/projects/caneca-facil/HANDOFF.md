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

Round 3 / Phase C is active and near closure. Core search/filter/recommend/compare exists. Supabase migration `storefront_catalog_fields` is applied and mirrored. `StorefrontStore` plus Supabase adapter enforce sellable catalog reads and safe project binding. StorefrontService and session-scoped `/search`, `/recommend`, `/compare`, `/select` routes are wired.

Latest work added StorefrontService tests (`101fca7a`), session/ownership/origin route tests (`4e262596`), and started Round 4 with a bounded `storefront_carousel` chat component plus validation tests (`98c28ecb`, `06e09b34`). The carousel is limited to eight items and requires non-negative integer server prices. No Supabase change was needed.

## Continue autonomously
1. Add Supabase storefront adapter tests for inactive/unpriced template rejection and active-project binding.
2. Inspect CI for the latest branch head and fix test/typecheck/build/no-Meta regressions; then mark Round 3 complete.
3. Continue Round 4: render `storefront_carousel` in `apps/chat`, format authoritative cents as BRL, and POST selection only to the session-scoped `/v1/chat/storefront/select` endpoint.
4. Add chat UI tests for rendering, selection success/failure and no caller-owned conversation/project identifiers.
5. Keep price and protected selection state server-authoritative; AI may recommend but never invent price or force selection.
6. Update CURRENT-STATE/HANDOFF after substantial progress.

Never reintroduce Meta, WhatsApp or Make runtime code. Never program in `osvaldosereia/CHAT`. Do not mix Dona Antônia or any other project.
