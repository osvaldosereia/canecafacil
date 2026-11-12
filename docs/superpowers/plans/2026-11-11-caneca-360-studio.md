# Caneca 360 Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure artwork editing, reusable per-version settings, independent side scaling, approval, history, and Epson print production to the existing Caneca 360 Studio.

**Architecture:** Keep the GitHub Pages React app and the existing Supabase Edge Function. Make the Studio password-free, scope work to the browser's random session UUID, enforce the existing IP generation limit, and store version/print metadata in existing JSONB fields and private Storage. Do not add Supabase resources; make mockups opt-in.

**Tech Stack:** React 19, TypeScript, Vite, Supabase JS/Edge Functions (Deno), CSS print media.

**Spec:** `docs/superpowers/specs/2026-11-11-caneca-360-studio.md`

## File Structure

- Modify `apps/admin/src/App.tsx`: keep the standalone Studio public while preserving AuthGate on the separate Admin workspace.
- Modify `apps/admin/src/pages/StudioPage.tsx`: briefing, version selection, editing, approval, history, queue, optional mockups.
- Modify `apps/admin/src/pages/StudioPage.css`: desktop/mobile views and Epson print layout.
- Modify `supabase/functions/caneca-studio/index.ts`: browser-session scoping, IP generation limit, version edit, approval, optional mockups, print counters.
- Modify `.github/workflows/deploy-studio.yml`: keep Pages build in studio-only mode; deploy the function separately with JWT gateway verification disabled because the endpoint is intentionally public and has its own session/IP checks.
- No migration or new Supabase resource.

## Global Constraints

- Keep current image output at 2400 × 960 px.
- Do not place the OpenAI secret in the browser.
- Do not show a login or password screen in the standalone Studio.
- Keep the existing five-actions-per-IP-per-24-hours generation limit in front of every image-producing action.
- Never overwrite an existing artwork version.
- Keep each version's complete creation settings and prompt snapshot so it can seed a new creation for the other side.
- Scale each side independently from 50% to 150% in 5% steps, without an OpenAI request.
- Use GPT Image 2.5 Flare at medium quality for generation and GPT-6.1 Terra at low reasoning effort for review.
- Do not generate mockups automatically.
- Use 106 × 247 mm paper, a 235 × 106 mm art area, 100% scaling, one mirror, and one 90° rotation.

## Tasks

### Task 1: Open the studio without login and limit generation

**Files:** `apps/admin/src/App.tsx`, `supabase/functions/caneca-studio/index.ts`

- [x] Open the studio-only Pages build without `AuthGate`; keep the full Admin workspace gated.
- [x] Scope jobs to the browser's random session UUID, with `created_by` left null as required by the existing guest-job constraint.
- [x] Retain the IP rate limit before any OpenAI key read or generation action.
- [x] Deploy the existing function with gateway JWT verification disabled; validate the random browser session and apply the existing IP generation limit in the function.
- [ ] Verify the live Pages site opens directly to the studio form without login.

### Task 2: Add immutable revisions and explicit approvals

**Files:** `apps/admin/src/pages/StudioPage.tsx`, `supabase/functions/caneca-studio/index.ts`

- [x] Return signed URLs and metadata for saved art versions.
- [x] Add an `edit` action that validates a selected base version and short written instruction, uses OpenAI image editing, and appends a new version.
- [x] Reset prior approval and mockups whenever a new version is added.
- [x] Add a `history` action scoped to the browser session and an `approve` action that records the exact version and requested quantity in the existing `input` JSON.
- [x] Verify typechecking and production build.

### Task 3: Add production queue and print tracking

**Files:** `apps/admin/src/pages/StudioPage.tsx`, `apps/admin/src/pages/StudioPage.css`, `supabase/functions/caneca-studio/index.ts`

- [x] List only explicitly approved versions in the print queue.
- [x] Add a print sheet with the Epson L1250 paper dimensions and a contain-fit image; keep app controls hidden while printing.
- [x] Track each confirmed copy against the approved version; require a reason before a reprint.
- [x] Keep the print flow usable at mobile widths.
- [x] Verify typechecking and production build.

### Task 4: Reduce automatic image spend and finish the studio identity

**Files:** `apps/admin/src/pages/StudioPage.tsx`, `apps/admin/src/pages/StudioPage.css`

- [x] Rename the UI to `Caneca 360` with the descriptor `Criação, edição e impressão`.
- [x] Add an explicit action for mockups; do not generate them as part of the default art workflow.
- [x] Re-check access handling, version ownership, approval-before-print, print scale, mirror, and mobile layout.
- [x] Run `npm run typecheck`, Edge Function TypeScript checking, and the Pages production build; report any unverified production-only behavior accurately.

### Task 5: Save and reuse creation settings; scale sides independently

**Files:** `apps/admin/src/pages/StudioPage.tsx`, `apps/admin/src/pages/StudioPage.css`, `apps/admin/src/lib/mug-artwork.ts`, `supabase/functions/caneca-studio/index.ts`, this spec

- [x] Save title, mode, description, exact text, selected command snapshots/categories, target side, per-side scales, reference usage, model, quality, output size, and compiled prompt on every art version.
- [x] Show the saved settings on the selected version and reuse them to prefill a new creation for either side.
- [x] Let the operator remove individual saved commands before reusing a configuration.
- [x] Adjust left and right side scale independently (50–150%, 5% increments), with uploads and resizing handled locally and the opposite half preserved.
- [x] Use GPT Image 2.5 Flare at medium quality for faster routine image work, and GPT-6.1 Terra at low reasoning effort for a cheaper visual review.
- [ ] Confirm published Pages UI exposes the settings card, per-side controls, and reuse flow.

## Review Focus

- Expired signed URLs: refresh them before showing a saved job or sending it to print.
- Concurrent edit requests: keep the existing per-job processing claim and reject a second active edit.
- Browser print cancellation: do not increment printed count until the operator explicitly confirms.
- Editing an approved/printed design: clear approval and require a fresh approval before printing.
- Invalid print quantity or reprint reason: validate server-side before updating the queue.
- Scaling only one half: retain the other half pixel-for-pixel and save the new scale in that version's configuration.
- Reusing a configuration with removed quick commands: use the saved command snapshot unless the operator removes it before generation.

