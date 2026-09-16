# Intelligent Briefing + Admin Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic mug-briefing engine and a protected Admin-only `Teste IA` simulator that can be developed and tested without Meta/WhatsApp.

**Architecture:** Keep briefing rules in `packages/core`, keep OpenAI behind a backend provider, keep simulator state in browser memory, and protect the simulator API with verified Supabase user identity plus server-side admin membership. The API must be able to boot with WhatsApp disabled.

**Tech Stack:** TypeScript 5.9.3, Node 24, Hono 4.13.7, React 19.3, Vitest 5, Supabase JS 2.116.0, OpenAI SDK 7.15.0.

**Spec:** `docs/superpowers/specs/2026-09-16-briefing-simulator-design.md`

## Global Constraints

- Do not activate customer-facing AI or WhatsApp outbound in this plan.
- Do not write simulator messages to `customers`, `conversations`, `messages`, `briefings`, orders, payments, or shipments.
- OpenAI and Supabase secret keys remain backend-only.
- Verify Admin authorization before every OpenAI briefing call.
- Use exactly one AI extraction request per submitted simulator turn.
- Do not expose chain-of-thought; return only structured facts, normalized next action, and a bounded simulated reply.
- Briefing readiness is deterministic code, never an LLM decision.
- Explicit corrections replace only the targeted field; otherwise previously known facts are preserved.
- OpenAI Responses API requests use Structured Outputs and `store: false`.
- `OPENAI_BRIEFING_MODEL` is configurable; use `gpt-5.6-luna` as the initial low-cost default.
- The API must start successfully when all `WHATSAPP_*` variables are absent.
- Run Supabase security advisors after database authorization changes.

---

### Task 1: Secure Admin Authorization and Make Meta Configuration Optional

**Files:**
- Create the migration with the Supabase migration generator using the name `secure_admin_simulator`, and commit exactly the file path returned by that generator; do not invent a timestamp.
- Modify: `supabase/schema/initial_caneca_facil.sql`
- Create: `apps/api/src/admin/admin-auth.ts`
- Create: `apps/api/src/admin/admin-auth.test.ts`
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/config.test.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Produces: `verifyAdminAccessToken(authorizationHeader, client): Promise<{ userId: string }>`.
- Produces: `ApiConfig.openaiApiKey?: string`, `ApiConfig.openaiBriefingModel: string`, `ApiConfig.adminOrigin?: string`.
- Changes WhatsApp configuration from required-at-startup to optional capability configuration.

- [ ] **Step 1: Write failing config tests proving the API can boot without Meta.**

```ts
it('loads simulator-capable config without WhatsApp variables', () => {
  expect(loadApiConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_test',
    OPENAI_API_KEY: 'sk-test',
  })).toMatchObject({
    supabaseUrl: 'https://example.supabase.co',
    openaiApiKey: 'sk-test',
    openaiBriefingModel: 'gpt-5.6-luna',
    whatsappVerifyToken: undefined,
  });
});
```

- [ ] **Step 2: Run the focused config tests and confirm RED.**

Run: `npm run test --workspace apps/api -- config.test.ts`
Expected: FAIL because WhatsApp fields are still required.

- [ ] **Step 3: Write failing Admin-auth tests.** Cover missing bearer token, invalid token, authenticated non-admin, and authenticated admin. The fake must prove membership lookup receives only the verified `user.id`, never a browser-supplied user ID.

```ts
await expect(verifyAdminAccessToken('Bearer valid', fakeClient)).resolves.toEqual({
  userId: 'admin-user-id',
});
expect(fakeMembershipLookup).toHaveBeenCalledWith('admin-user-id');
```

- [ ] **Step 4: Generate and apply the minimal Supabase authorization migration.** Use the exact migration-generator output path and this SQL:

```sql
alter table private.admin_users enable row level security;

grant select on private.admin_users to service_role;

create or replace view public.admin_membership_lookup
with (security_invoker = true)
as
select user_id
from private.admin_users;

revoke all on public.admin_membership_lookup from public, anon, authenticated;
grant select on public.admin_membership_lookup to service_role;
```

Do not grant browser roles direct access to `private.admin_users` or the lookup view.

- [ ] **Step 5: Verify the migration in Supabase.** Confirm RLS is enabled, the view exists, `anon/authenticated` cannot select it, and service role can query it. Run the security advisor and require zero new security lints before continuing.

- [ ] **Step 6: Implement `verifyAdminAccessToken`.** Use `client.auth.getUser(accessToken)` for authentic identity verification, then query `admin_membership_lookup` with the backend secret-key client and require an exact row for the verified user ID.

- [ ] **Step 7: Refactor `loadApiConfig`.** Keep `SUPABASE_URL` and `SUPABASE_SECRET_KEY` required; make WhatsApp fields optional; load `OPENAI_API_KEY`, `OPENAI_BRIEFING_MODEL`, and `ADMIN_ORIGIN`. A partial WhatsApp configuration must not prevent server boot.

- [ ] **Step 8: Update `.env.example`.** Add `OPENAI_BRIEFING_MODEL=gpt-5.6-luna` and `ADMIN_ORIGIN=http://localhost:5173`; keep `WHATSAPP_*` only as optional examples.

- [ ] **Step 9: Run repository verification.**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 10: Commit.**

```bash
git commit -am "feat: secure admin simulator access"
```

---

### Task 2: Implement Deterministic Briefing Domain Rules

**Files:**
- Modify: `packages/core/src/briefing.ts`
- Create: `packages/core/src/briefing.test.ts`
- Verify exports through existing `packages/core/src/index.ts`.

**Interfaces:**

Make `Briefing.creationMode` optional while a draft is incomplete. Define these exact types in `briefing.ts`:

```ts
export type BriefingField =
  | 'creationMode'
  | 'occasion'
  | 'recipient'
  | 'mainTheme'
  | 'desiredStyle'
  | 'colorPreferences'
  | 'mandatoryText'
  | 'names'
  | 'dates'
  | 'mandatoryElements'
  | 'forbiddenElements'
  | 'references'
  | 'compositionNotes'
  | 'creativeDirection';

export type BriefingEditableFields = Pick<
  Briefing,
  BriefingField
>;

export interface BriefingExtraction {
  set: Partial<BriefingEditableFields>;
  replace: Partial<BriefingEditableFields>;
  creativeFreedom?: boolean;
  confidenceScore: number;
  ambiguousFields: BriefingField[];
}
```

Also produce:
- `createEmptyBriefing()`.
- `mergeBriefing(previous, extraction)`.
- `getMissingBriefingInformation(briefing)`.
- `isBriefingReady(briefing)`.
- `getNextBriefingQuestion(briefing)`.

`set` adds newly learned facts; `replace` is reserved for explicit customer corrections. Array fields in `set` merge/deduplicate. Array fields in `replace` replace only the targeted array. Existing scalar values are not silently overwritten by `set`.

- [ ] **Step 1: Write failing tests for preservation and targeted replacement.**

```ts
const previous = createEmptyBriefing();
previous.desiredStyle = 'minimalista';
previous.colorPreferences = ['azul'];

const next = mergeBriefing(previous, {
  set: { occasion: 'aniversário' },
  replace: { colorPreferences: ['rosa'] },
  confidenceScore: 0.91,
  ambiguousFields: [],
});

expect(next.desiredStyle).toBe('minimalista');
expect(next.colorPreferences).toEqual(['rosa']);
expect(next.occasion).toBe('aniversário');
```

- [ ] **Step 2: Write failing tests for deduplication and mandatory-text preservation.** Ensure `"Ana"` is never silently changed or paraphrased when it is mandatory text.

- [ ] **Step 3: Write failing readiness tests.** Encode this deterministic policy:
  - creation mode must be known;
  - creative context must exist (`mainTheme`, `occasion`, `recipient`, `creativeDirection`, or a reference);
  - `reference` mode requires at least one reference;
  - either `desiredStyle`, `creativeDirection`, or `creativeFreedom=true` must resolve style freedom;
  - model confidence never overrides missing requirements.

- [ ] **Step 4: Write failing next-question tests.** Use fixed priority: `creation_mode` → `reference` when reference mode → `creative_context` → `style_or_creative_freedom`. Return exactly one Portuguese question or `null` when ready.

- [ ] **Step 5: Implement the minimal pure functions.** No database, OpenAI, HTTP, React, or WhatsApp imports are allowed in this file.

- [ ] **Step 6: Run core verification.**

Run: `npm run test --workspace packages/core -- briefing.test.ts && npm run typecheck --workspace packages/core && npm run build --workspace packages/core`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git commit -am "feat: add deterministic briefing rules"
```

---

### Task 3: Add Structured OpenAI Briefing Extraction

**Files:**
- Create: `apps/api/src/ai/briefing-provider.ts`
- Create: `apps/api/src/ai/briefing-provider.test.ts`
- Modify: `apps/api/package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Add exact workspace dependency: `"@caneca-facil/core": "0.1.0"` to `apps/api/package.json`.
- Produces: `BriefingProvider` with `extract(input): Promise<BriefingExtraction>`.
- Produces: `createOpenAIBriefingProvider({ apiKey, model, client? })`.

- [ ] **Step 1: Write failing provider-contract tests using a fake OpenAI client.** Verify one Responses API call, `store: false`, configured model, and strict JSON schema output.

- [ ] **Step 2: Define a strict Structured Outputs schema.** The schema must include `set`, `replace`, `creativeFreedom`, `confidenceScore`, and `ambiguousFields`, with `additionalProperties: false`.

- [ ] **Step 3: Implement the extraction prompt.** It must instruct the model to extract only customer-stated facts, use `replace` only for explicit corrections, never infer mandatory wording, and mark ambiguity rather than guess.

- [ ] **Step 4: Implement response validation.** Empty output, invalid JSON, unknown fields, invalid confidence range, or invalid enum values throw `BriefingProviderError` and do not return partial data.

- [ ] **Step 5: Install/update workspace lockfile and run verification.**

Run: `npm install && npm run test --workspace apps/api -- briefing-provider.test.ts && npm run typecheck --workspace apps/api && npm run build --workspace apps/api`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git commit -am "feat: add structured briefing extraction"
```

---

### Task 4: Build the Stateless Simulator Orchestrator

**Files:**
- Create: `apps/api/src/simulator/briefing-simulator.ts`
- Create: `apps/api/src/simulator/briefing-simulator.test.ts`

**Interfaces:**
- Consumes: `BriefingProvider`, current synthetic briefing, bounded transcript, customer turn.
- Produces: `SimulatorResult` containing `briefing`, `nextAction`, and `assistantReply`.

```ts
export type SimulatorNextAction =
  | { type: 'ask_customer'; question: string }
  | { type: 'ready_to_generate' }
  | { type: 'needs_review'; reason: string };
```

- [ ] **Step 1: Write failing tests for a normal turn.** Assert the provider is called once, domain helpers produce missing fields, and reply equals the deterministic question.

- [ ] **Step 2: Write failing tests for provider failure/ambiguity.** A provider error or unresolved ambiguity must return `needs_review` without persistence.

- [ ] **Step 3: Add input bounds.** Reject empty turn; cap transcript at the latest 12 synthetic messages and 800 characters per message; cap customer turn at 2000 characters.

- [ ] **Step 4: Implement the orchestrator.** It must import the shared functions from `@caneca-facil/core`; it must not import any WhatsApp sender or Supabase data-write store.

- [ ] **Step 5: Run focused verification.**

Run: `npm run test --workspace apps/api -- briefing-simulator.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git commit -am "feat: add stateless briefing simulator"
```

---

### Task 5: Expose a Protected Admin Simulator Route

**Files:**
- Create: `apps/api/src/admin/simulator-route.ts`
- Create: `apps/api/src/admin/simulator-route.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`

**Interfaces:**
- Route: `POST /admin/simulator/briefing`.
- Requires: `Authorization: Bearer <Supabase access token>`.
- Request: `{ briefing, transcript, customerTurn }`.
- Response: `SimulatorResult`.

- [ ] **Step 1: Write failing route tests for 401, 403, 400, 503, and 200.** Prove auth rejection happens before provider invocation.

- [ ] **Step 2: Add Admin-only CORS.** If `ADMIN_ORIGIN` is configured, allow that exact origin on `/admin/*`; do not add permissive `*` CORS to the WhatsApp webhook.

- [ ] **Step 3: Register the route with server-side dependencies.** Build the OpenAI provider from `OPENAI_API_KEY`/`OPENAI_BRIEFING_MODEL`. If OpenAI is not configured, route returns 503 without calling anything external.

- [ ] **Step 4: Parse and validate JSON before orchestration.** Never accept browser-provided `isAdmin`, `userId`, provider model, or API credentials.

- [ ] **Step 5: Add a regression test that `createApiApp()` still serves `/health` without Meta config and does not register/send WhatsApp traffic unless WhatsApp capability is configured.

- [ ] **Step 6: Run API verification.**

Run: `npm run test --workspace apps/api && npm run typecheck --workspace apps/api && npm run build --workspace apps/api`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git commit -am "feat: expose protected briefing simulator"
```

---

### Task 6: Build the `Teste IA` Admin Experience

**Files:**
- Create: `apps/admin/src/services/briefing-simulator.ts`
- Create: `apps/admin/src/services/briefing-simulator.test.ts`
- Create: `apps/admin/src/pages/AiTestPage.tsx`
- Create: `apps/admin/src/pages/AiTestPage.test.tsx`
- Modify: `apps/admin/src/AdminWorkspace.tsx`
- Modify: `apps/admin/src/AdminWorkspace.test.tsx`
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/App.test.tsx`
- Modify: `apps/admin/src/main.tsx`
- Modify: `apps/admin/.env.example`

**Interfaces:**
- `VITE_API_URL` is the only new browser API configuration.
- `submitBriefingSimulation({ apiBaseUrl, accessToken, briefing, transcript, customerTurn })` calls the protected backend.

- [ ] **Step 1: Write failing service tests.** Verify Bearer token header, JSON request body, normalized errors, and no service credentials in browser configuration.

- [ ] **Step 2: Write failing page tests.** The page must render `Conversa simulada`, `Entendimento da IA`, `Próxima ação`, `Enviar como cliente`, and `Nova simulação`.

- [ ] **Step 3: Implement local synthetic state.** Keep transcript, briefing, next action, draft input, loading, and error in React state only. `Nova simulação` resets all of it.

- [ ] **Step 4: Read the current Supabase session access token immediately before each simulator submission.** If there is no session/token, surface an Admin session error and do not call the API.

- [ ] **Step 5: Add `Teste IA` to `AdminSection` and navigation.** Keep existing `Projetos` and `Gabarito` behavior unchanged.

- [ ] **Step 6: Render structured facts only.** Never render provider prompt text, raw OpenAI response, hidden reasoning, or secret values.

- [ ] **Step 7: Wire `VITE_API_URL` from `main.tsx` into `App`/`AdminWorkspace`.** Update `apps/admin/.env.example` with `VITE_API_URL=http://localhost:3000`.

- [ ] **Step 8: Run Admin tests/typecheck/build.**

Run: `npm run test --workspace apps/admin && npm run typecheck --workspace apps/admin && npm run build --workspace apps/admin`
Expected: PASS.

- [ ] **Step 9: Commit.**

```bash
git commit -am "feat: add admin AI briefing simulator"
```

---

### Task 7: Acceptance and Safety Gate

**Files:**
- Create: `docs/acceptance/briefing-simulator.md`

- [ ] **Step 1: Run a deterministic multi-turn test with fakes.** Example path: “quero uma caneca para minha esposa” → choose from scratch → birthday → minimalist/blue → correction to pink → verify old unrelated facts remain.

- [ ] **Step 2: Verify database isolation.** Count `customers`, `conversations`, and `messages` before and after simulator testing and confirm the counts do not change.

- [ ] **Step 3: Verify authorization.** Confirm unauthenticated and authenticated-non-admin requests are rejected before OpenAI provider execution.

- [ ] **Step 4: Verify Meta independence.** Start the production API with no `WHATSAPP_*` environment variables and confirm `GET /health` succeeds and simulator tests remain operational.

- [ ] **Step 5: Run repository-wide gates.**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Run the production API smoke test from CI and Supabase security advisor.** Require no new security findings.

- [ ] **Step 7: Document the acceptance evidence.** Record what was tested, which capabilities remain deliberately disabled, and that live Meta acceptance remains pending.

- [ ] **Step 8: Commit.**

```bash
git commit -am "docs: verify briefing simulator"
```

## Exit Gate

This block is complete only when an authenticated Admin can run a multi-turn synthetic conversation in `Teste IA`, the shared deterministic briefing reaches `ready_to_generate` when appropriate, explicit corrections do not destroy unrelated facts, non-admin users cannot invoke OpenAI, no real customer rows are created or modified, and the API runs without Meta configuration.
