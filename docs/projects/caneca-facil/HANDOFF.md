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

Round 3 / Phase C is active. Core search/filter/recommend/compare exists. Supabase migration `storefront_catalog_fields` is applied and mirrored. `StorefrontStore` plus Supabase adapter enforce sellable catalog reads and safe project binding.

This round added `StorefrontService`, session-scoped routes `/v1/chat/storefront/search`, `/recommend`, `/compare`, `/select`, and app wiring. Selection never accepts conversation/project ownership from the request; it derives conversation identity from the existing HttpOnly chat session and the store validates active project plus sellable template. Commits: `899a484f`, `1f4ef827`, `a7b41847`.

## Continue autonomously
1. Add storefront service/store/route tests for filters, limits, unauthorized access, wrong origin, inactive/unpriced templates and ownership-safe binding.
2. Run tests/typecheck/build/no-Meta and fix regressions; close Round 3 when green.
3. Extend bounded chat components for storefront cards/carousels/selections.
4. Begin Round 4 UI integration: render storefront components and connect selection to the session-scoped endpoint.
5. Keep price and protected selection state server-authoritative; AI may recommend but never invent price or force selection.
6. Update CURRENT-STATE/HANDOFF after substantial progress.

Never reintroduce Meta, WhatsApp or Make runtime code. Never program in `osvaldosereia/CHAT`. Do not mix Dona Antônia or any other project.
