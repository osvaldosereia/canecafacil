# Caneca 360 Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure artwork editing, approval, history, and Epson print production to the existing Caneca 360 Studio.

**Architecture:** Keep the GitHub Pages React app and the existing Supabase Edge Function. Authenticate through the existing Admin AuthGate, validate the JWT and active admin membership in the function, and store version/print metadata in existing JSONB fields and private Storage. Do not add Supabase resources; make mockups opt-in.

**Tech Stack:** React 19, TypeScript, Vite, Supabase JS/Edge Functions (Deno), CSS print media.

**Spec:** `docs/superpowers/specs/2026-11-11-caneca-360-studio.md`

## File Structure

- Modify `apps/admin/src/App.tsx`: gate studio-only Pages build with existing AuthGate.
- Modify `apps/admin/src/pages/StudioPage.tsx`: briefing, version selection, editing, approval, history, queue, optional mockups.
- Modify `apps/admin/src/pages/StudioPage.css`: desktop/mobile views and Epson print layout.
- Modify `supabase/functions/caneca-studio/index.ts`: JWT/admin authorization, owner-scoped history, version edit, approval, optional mockups, print counters.
- Modify `.github/workflows/deploy-studio.yml`: keep Pages build in studio-only mode; function verification is deployed separately with JWT required.
- No migration or new Supabase resource.

## Global Constraints

- Keep current image output at 2400 × 960 px.
- Do not place the OpenAI secret in the browser.
- Keep the project restricted to active `owner` or `operator` accounts.
- Never overwrite an existing artwork version.
- Do not generate mockups automatically.
- Use 106 × 247 mm paper, a 235 × 106 mm art area, 100% scaling, one mirror, and one 90° rotation.

## Tasks

### Task 1: Protect the studio and its OpenAI endpoint

**Files:** `apps/admin/src/App.tsx`, `supabase/functions/caneca-studio/index.ts`

- [x] Wrap studio-only rendering in `AuthGate`.
- [x] Validate the bearer JWT with Supabase Auth and require an active owner/operator row in `admin_users`.
- [x] Set new jobs' `created_by` to the authenticated user and scope reads/updates to that user.
- [x] Deploy the existing function with JWT verification enabled.
- [x] Verify typechecking and the Pages production bundle build. (The live login view awaits the Pages deployment.)

### Task 2: Add immutable revisions and explicit approvals

**Files:** `apps/admin/src/pages/StudioPage.tsx`, `supabase/functions/caneca-studio/index.ts`

- [x] Return signed URLs and metadata for saved art versions.
- [x] Add an `edit` action that validates a selected base version and short written instruction, uses OpenAI image editing, and appends a new version.
- [x] Reset prior approval and mockups whenever a new version is added.
- [x] Add a `history` action scoped to the signed-in user and an `approve` action that records the exact version and requested quantity in the existing `input` JSON.
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

## Review Focus

- Expired signed URLs: refresh them before showing a saved job or sending it to print.
- Concurrent edit requests: keep the existing per-job processing claim and reject a second active edit.
- Browser print cancellation: do not increment printed count until the operator explicitly confirms.
- Editing an approved/printed design: clear approval and require a fresh approval before printing.
- Invalid print quantity or reprint reason: validate server-side before updating the queue.
