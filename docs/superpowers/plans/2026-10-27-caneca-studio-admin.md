# Caneca Studio Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an internal AI Studio to the official Caneca Fácil Admin that creates a horizontal mug artwork and two private mockups.

**Architecture:** The Admin uses its existing Supabase session to call a Hono API. The API validates the user and the server-side admin membership, uses OpenAI for the image pipeline, and saves immutable assets and project metadata to the existing private Supabase buckets and tables.

**Tech Stack:** React, TypeScript, Hono, Supabase Auth/Postgres/Storage, OpenAI Images API.

**Spec:** `docs/superpowers/specs/2026-10-27-caneca-studio-admin.md`

## Global Constraints

- No Make webhook, Firebase database, or SUCEDOAN12 branch may be used by the restored feature.
- OpenAI and Supabase secret keys stay in the API environment.
- Only `admin_membership_lookup` members can create or inspect studio jobs.
- Art and mockups stay in private buckets and are returned as signed URLs.
- Art follows the active template output dimensions, rounded down to model-compatible 16 px increments; without template dimensions it uses 2304×944. The two mockups are 1024×1024.
- The generation flow creates an internal project; it does not publish a catalog product.

## Review Focus

- Missing OpenAI configuration returns a clear setup error without sending a provider request.
- An authenticated but non-admin user receives 403 for both create and poll endpoints.
- Invalid MIME types and references over 8 MB are rejected before upload or image generation.
- Partial generation failures leave the project in `failed` without exposing provider secrets.
- Browsers only receive time-limited signed URLs for private files.

---

### Task 1: API generation workflow

**Files:**
- Create `apps/api/src/studio/service.ts` and `apps/api/src/studio/routes.ts`.
- Modify `apps/api/src/app.ts` and `apps/api/src/config.ts`.
- Modify `apps/api/.env.example` and root `.env.example`.

**Produces:** Admin-only create/poll routes, asynchronous job state in `mug_projects`, OpenAI artwork and mockup generation, and versioned Supabase records.

- [x] Validate bearer token with Supabase Auth and require a matching row in `admin_membership_lookup`.
- [x] Validate request fields and optional image bytes before creating a project.
- [x] Persist a closed internal conversation, project, and ready briefing.
- [x] Generate one print artwork and two mockups through the backend OpenAI client.
- [x] Save to the existing private storage buckets and create immutable version rows.
- [x] Return signed result URLs through an admin-authenticated poll route.

### Task 2: Admin Studio interface

**Files:**
- Create `apps/admin/src/pages/StudioPage.tsx` and `apps/admin/src/pages/StudioPage.css`.
- Modify `apps/admin/src/AdminWorkspace.tsx` and `apps/admin/.env.example`.

**Produces:** Mobile-friendly Admin navigation, generation form, progress state, and result links.

- [x] Add an Estúdio section that uses the existing signed-in Supabase client.
- [x] Submit text fields and an optional image without exposing credentials.
- [x] Poll job state until `needs_review` or `failed` and render the art plus both mockups.

### Task 3: Configuration and delivery notes

**Files:**
- Update the API and Admin environment examples.
- Keep the design and implementation decisions in this spec and plan.

- [x] Document `OPENAI_API_KEY`, exact `ADMIN_ORIGIN`, and `VITE_API_URL` requirements.
- [x] Review the changed files and confirm the legacy Make scenario remains inactive.

## Verification status

The implementation is committed to the `feat/admin-caneca-studio` branch in `osvaldosereia/canecafacil`. Changed files were read back for static review; no test or build command was run. Runtime activation is still pending access to the correct Caneca Fácil Supabase project and configuration of the Admin/API runtime variables.