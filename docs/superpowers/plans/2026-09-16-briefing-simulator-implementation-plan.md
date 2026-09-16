# Intelligent Briefing + Admin Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic mug-briefing engine and a protected Admin-only `Teste IA` simulator that works without Meta/WhatsApp.

**Architecture:** Keep briefing rules in `packages/core`, keep OpenAI behind a backend provider, keep simulator state in browser memory, and protect the simulator API with verified Supabase user identity plus server-side admin membership. The API must boot with WhatsApp disabled.

**Tech Stack:** TypeScript 5.9.3, Node 24, Hono 4.13.7, React 19.3, Vitest 5, Supabase JS 2.116.0, OpenAI SDK 7.15.0.

**Spec:** `docs/superpowers/specs/2026-09-16-briefing-simulator-design.md`

## Global Constraints

- Do not activate customer-facing AI or WhatsApp outbound.
- Do not write simulator turns to `customers`, `conversations`, `messages`, `briefings`, orders, payments, or shipments.
- OpenAI and Supabase secret keys remain backend-only.
- Verify Admin authorization before every OpenAI briefing call.
- Use exactly one AI extraction request per submitted simulator turn.
- Do not expose chain-of-thought; return only structured facts, normalized next action, and a bounded simulated reply.
- Briefing readiness is deterministic code, never an LLM decision.
- Explicit corrections replace only the targeted field; previously known unrelated facts are preserved.
- OpenAI Responses API uses Structured Outputs with `store: false`.
- `OPENAI_BRIEFING_MODEL` is configurable; initial default is `gpt-5.6-luna`.
- The API must start when every `WHATSAPP_*` variable is absent.
- Run Supabase security advisors after authorization changes.

---

### Task 1: Secure Admin Authorization and Make Meta Configuration Optional

**Files:**
- Create the migration with the Supabase migration generator named `secure_admin_simulator`; commit exactly the filename produced by that generator.
- Modify: `supabase/schema/initial_caneca_facil.sql`
- Create: `apps/api/src/admin/admin-auth.ts`
- Create: `apps/api/src/admin/admin-auth.test.ts`
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/config.test.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Produces `verifyAdminAccessToken(authorizationHeader, client): Promise<{ userId: string }>`.
- Adds `ApiConfig.openaiApiKey?: string`, `ApiConfig.openaiBriefingModel: string`, `ApiConfig.adminOrigin?: string`.
- Makes WhatsApp configuration an optional capability instead of a server-start requirement.

- [ ] **Step 1: Write the failing config test.**

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

- [ ] **Step 2: Run the focused config test and confirm RED.**

Run: `npm run test --workspace apps/api -- config.test.ts`
Expected: FAIL because WhatsApp fields are still required.

- [ ] **Step 3: Write failing Admin-auth tests.** Cover missing bearer token, invalid token, authenticated non-admin, and authenticated admin. Prove membership lookup receives only the verified `user.id`.

```ts
await expect(verifyAdminAccessToken('Bearer valid', fakeClient)).resolves.toEqual({
  userId: 'admin-user-id',
});
expect(fakeMembershipLookup).toHaveBeenCalledWith('admin-user-id');
```

- [ ] **Step 4: Generate and apply the Supabase authorization migration.** Use this SQL in the migration generated for `secure_admin_simulator`:

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

- [ ] **Step 5: Verify the migration.** Confirm RLS is enabled on `private.admin_users`; the view exists; `anon`/`authenticated` cannot select it; service role can query it. Run the Supabase security advisor and require no new security lint.

- [ ] **Step 6: Implement `verifyAdminAccessToken`.** Use `client.auth.getUser(accessToken)` to verify the JWT, then query `admin_membership_lookup` with the backend secret-key client and require an exact row for that verified user ID.

- [ ] **Step 7: Refactor `loadApiConfig`.** Keep `SUPABASE_URL` and `SUPABASE_SECRET_KEY` required. Make all WhatsApp values optional. Load `OPENAI_API_KEY`, `OPENAI_BRIEFING_MODEL`, and `ADMIN_ORIGIN`. Partial WhatsApp configuration must not block server boot.

- [ ] **Step 8: Update `apps/api/.env.example`.** Include `OPENAI_BRIEFING_MODEL=gpt-5.6-luna` and `ADMIN_ORIGIN=http://localhost:5173`; keep `WHATSAPP_*` as optional examples.

- [ ] **Step 9: Run verification.**

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
- Verify existing export: `packages/core/src/index.ts`

**Interfaces:**

Change the draft domain so `creationMode` may be absent before the customer chooses it, and persist creative freedom in the briefing state:

```ts
export interface Briefing {
  creationMode?: CreationMode;
  occasion?: string;
  recipient?: string;
  mainTheme?: string;
  desiredStyle?: string;
  colorPreferences: string[];
  mandatoryText: string[];
  names: string[];
  dates: string[];
  mandatoryElements: string[];
  forbiddenElements: string[];
  references: BriefingReference[];
  compositionNotes?: string;
  creativeDirection?: string;
  creativeFreedom: boolean;
  missingInformation: string[];
  confidenceScore: number;
  readyToGenerate: boolean;
}
```

Define:

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

export type BriefingEditableFields = Pick<Briefing, BriefingField>;

export interface BriefingExtraction {
  set: Partial<BriefingEditableFields>;
  replace: Partial<BriefingEditableFields>;
  creativeFreedom?: boolean;
  confidenceScore: number;
  ambiguousFields: BriefingField[];
}
```

Also produce `createEmptyBriefing()`, `mergeBriefing(previous, extraction)`, `getMissingBriefingInformation(briefing)`, `isBriefingReady(briefing)`, and `getNextBriefingQuestion(briefing)`.

- [ ] **Step 1: Write the failing preservation/correction test.**

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

- [ ] **Step 2: Write failing creative-freedom persistence tests.** `createEmptyBriefing()` must initialize `creativeFreedom: false`; an extraction with `creativeFreedom: true` must set it true; an extraction omitting the flag must preserve its previous value.

- [ ] **Step 3: Write failing deduplication and mandatory-text tests.** Array facts in `set` merge without duplicates; mandatory text retains exact spelling/case. Array facts in `replace` replace only that array.

- [ ] **Step 4: Write failing readiness tests.** The deterministic policy is:
  - creation mode must be known;
  - creative context must exist through `mainTheme`, `occasion`, `recipient`, `creativeDirection`, or a reference;
  - `reference` mode requires at least one reference;
  - style is resolved by `desiredStyle`, `creativeDirection`, or persisted `creativeFreedom === true`;
  - provider confidence never overrides missing requirements.

- [ ] **Step 5: Write failing next-question tests.** Priority is `creation_mode` → `reference` for reference mode → `creative_context` → `style_or_creative_freedom`; return one Portuguese question or `null` when ready.

- [ ] **Step 6: Implement minimal pure functions.** `mergeBriefing` applies `extraction.creativeFreedom` only when it is explicitly boolean; otherwise it preserves `previous.creativeFreedom`. No database, OpenAI, HTTP, React, or WhatsApp imports are allowed.

- [ ] **Step 7: Run core verification.**

Run: `npm run test --workspace packages/core -- briefing.test.ts && npm run typecheck --workspace packages/core && npm run build --workspace packages/core`
Expected: PASS.

- [ ] **Step 8: Commit.**

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
- Add exact workspace dependency `"@caneca-facil/core": "0.1.0"` to `apps/api/package.json`.
- Produce `BriefingProvider.extract(input): Promise<BriefingExtraction>`.
- Produce `createOpenAIBriefingProvider({ apiKey, model, client? })`.

- [ ] **Step 1: Write failing provider-contract tests with a fake OpenAI client.** Verify one Responses API call, `store: false`, configured model, and strict JSON schema output.

- [ ] **Step 2: Define the strict Structured Outputs schema.** Include `set`, `replace`, `creativeFreedom`, `confidenceScore`, and `ambiguousFields`; use `additionalProperties: false` throughout objects.

- [ ] **Step 3: Implement the extraction prompt.** Instruct the model to extract only customer-stated facts, use `replace` only for explicit corrections, never paraphrase mandatory wording, never invent optional facts, and mark ambiguity rather than guess.

- [ ] **Step 4: Implement response validation.** Empty output, invalid JSON, unknown fields, invalid confidence range, or invalid enum values throw `BriefingProviderError`; no partial extraction is returned.

- [ ] **Step 5: Update lockfile and verify.**

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

```ts
export type SimulatorNextAction =
  | { type: 'ask_customer'; question: string }
  | { type: 'ready_to_generate' }
  | { type: 'needs_review'; reason: string };
```

The orchestrator consumes `BriefingProvider`, the current synthetic `Briefing`, a bounded transcript, and a customer turn. It returns `{ briefing, nextAction, assistantReply }`.

- [ ] **Step 1: Write failing normal-turn tests.** Assert one provider call, deterministic merge/readiness, and a reply equal to the one normalized question.

- [ ] **Step 2: Write failing error/ambiguity tests.** Provider failure or unresolved `ambiguousFields` returns `needs_review` without persistence.

- [ ] **Step 3: Write failing input-bound tests.** Reject blank customer turn; cap to 2000 chars. Keep only the latest 12 synthetic messages and cap each to 800 chars.

- [ ] **Step 4: Implement the orchestrator.** Import the shared functions from `@caneca-facil/core`. Do not import WhatsApp sender code or Supabase data-write stores.

- [ ] **Step 5: Verify.**

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
- Route `POST /admin/simulator/briefing`.
- Authorization `Bearer <Supabase access token>`.
- Request `{ briefing, transcript, customerTurn }`.
- Response `SimulatorResult`.

- [ ] **Step 1: Write failing route tests for 401, 403, 400, 503, and 200.** Assert unauthorized/non-admin rejection happens before provider invocation.

- [ ] **Step 2: Add exact Admin CORS.** If `ADMIN_ORIGIN` exists, allow only that origin on `/admin/*`; do not add permissive `*` CORS to WhatsApp paths.

- [ ] **Step 3: Register server dependencies.** Build the provider from `OPENAI_API_KEY` and `OPENAI_BRIEFING_MODEL`. Without an OpenAI key, return 503 and do not make an external call.

- [ ] **Step 4: Validate the JSON request.** Reject browser-provided `isAdmin`, `userId`, provider model, or API credentials.

- [ ] **Step 5: Add the Meta-independence regression test.** `createApiApp()` and `/health` work with no Meta configuration; the simulator does not import or call WhatsApp outbound.

- [ ] **Step 6: Verify API.**

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
- New browser config: `VITE_API_URL`.
- Produce `submitBriefingSimulation({ apiBaseUrl, accessToken, briefing, transcript, customerTurn })`.

- [ ] **Step 1: Write failing service tests.** Verify Bearer token, JSON payload, normalized errors, and absence of service credentials from browser config.

- [ ] **Step 2: Write failing page tests.** Require `Conversa simulada`, `Entendimento da IA`, `Próxima ação`, `Enviar como cliente`, and `Nova simulação`.

- [ ] **Step 3: Implement local state only.** Keep transcript, briefing, next action, draft, loading, and error in React state. `Nova simulação` restores `createEmptyBriefing()` and an empty transcript.

- [ ] **Step 4: Read the current Supabase session access token before every submission.** Without a token, show an Admin session error and do not call the API.

- [ ] **Step 5: Add `Teste IA` to `AdminSection` and navigation.** Preserve `Projetos` and `Gabarito` behavior.

- [ ] **Step 6: Render operational data only.** Show structured briefing fields, missing information, confidence, `creativeFreedom`, readiness, and normalized action. Never render provider prompt, raw OpenAI payload, hidden reasoning, or secrets.

- [ ] **Step 7: Wire API URL.** Pass `VITE_API_URL` from `main.tsx` through `App`/`AdminWorkspace`. Add `VITE_API_URL=http://localhost:3000` to the Admin `.env.example`.

- [ ] **Step 8: Verify Admin.**

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

- [ ] **Step 1: Run a multi-turn deterministic acceptance path with fakes.** Use: “quero uma caneca para minha esposa” → select creation from scratch → birthday → minimalist/blue → explicit correction to pink. Confirm wife/birthday/style remain unchanged while only color is replaced.

- [ ] **Step 2: Verify creative freedom across turns.** Set creative freedom in one turn, omit it in the next, and confirm it remains true until explicitly changed.

- [ ] **Step 3: Verify database isolation.** Count `customers`, `conversations`, and `messages` before and after simulator testing; counts must not change.

- [ ] **Step 4: Verify authorization.** Unauthenticated and authenticated-non-admin requests must be rejected before provider invocation.

- [ ] **Step 5: Verify Meta independence.** Start the production API without any `WHATSAPP_*` variables and confirm `GET /health` returns 200.

- [ ] **Step 6: Run repository gates.**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 7: Run production smoke CI and Supabase security advisor.** Require no new security finding.

- [ ] **Step 8: Document evidence.** Record tests, DB isolation, authorization, and that real Meta remains deliberately pending.

- [ ] **Step 9: Commit.**

```bash
git commit -am "docs: verify briefing simulator"
```

## Exit Gate

This block is complete only when an authenticated Admin can run a multi-turn synthetic conversation in `Teste IA`; the shared deterministic briefing reaches `ready_to_generate` only when requirements are satisfied; creative freedom and known facts survive later turns; explicit corrections do not damage unrelated facts; non-admin users cannot invoke OpenAI; no real customer rows are created or modified; and the API runs without Meta configuration.
