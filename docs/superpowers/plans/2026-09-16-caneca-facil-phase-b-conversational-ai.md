# Caneca Fácil Phase B — Conversational AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase A deterministic placeholder with a safe conversational AI engine that extracts and persists structured mug briefing facts, asks only the minimum next question, streams concise responses, and renders only validated versioned conversational components.

**Architecture:** Keep deterministic briefing rules and component contracts in `packages/core`. Keep OpenAI behind a backend-only provider in `apps/api`, with strict Structured Outputs through the Responses API and a second local validation boundary. Reuse the existing Phase A session, idempotent message persistence, SSE transport and private media upload instead of rebuilding them. Persist partial briefing state in versioned `briefings`; the LLM extracts facts, while code owns merge semantics, missing-information calculation, readiness and conversation ownership.

**Tech Stack:** Node 24, TypeScript 5.9, Hono, React/Vite, Vitest, OpenAI Node SDK, Supabase Postgres/Storage/Auth, SSE.

**Spec:** `docs/superpowers/specs/2026-09-16-caneca-facil-own-chat-redesign.md`

## Global Constraints

- The conversation itself is the store; customer UI stays mobile-first, calm and sparse.
- Meta/WhatsApp must remain absent from active runtime, configuration and customer UI; `npm run check:no-meta` remains a hard gate.
- OpenAI credentials and model configuration are server-only; no OpenAI secret reaches `apps/chat` or `apps/admin`.
- OpenAI interprets customer language but never decides prices, discounts, payment truth, production release or other protected business state.
- Briefing readiness, missing fields and explicit correction semantics are deterministic code decisions.
- Explicit corrections replace only targeted fields; unrelated known facts must survive.
- Customer mandatory wording is preserved exactly as stored; no automatic rewriting of names, dates or required text.
- Structured AI output is rejected unless it passes the local schema/validator after the provider response.
- No arbitrary HTML/React from AI. Only versioned supported conversational components may reach the customer.
- Unknown/invalid components never crash the client and never execute as UI instructions.
- No hidden chain-of-thought, reasoning trace or private scratchpad is stored or exposed.
- Respect `conversations.automation_mode` (`ai | human | paused`) and `needs_attention`; AI may answer only when the deterministic conversation policy permits it.
- Private customer media remains private.
- Database changes are forward-only migrations. Historical migrations are never edited.
- Every task uses RED → GREEN TDD and ends with focused tests before the next task.
- At phase gate run `npm test`, `npm run typecheck`, `npm run check:no-meta`, `npm run build`, API smoke test and Supabase security advisors.

## File Structure and Responsibilities

- `packages/core/src/briefing.ts` — deterministic briefing state, extraction merge rules, missing information, readiness and next-question selection.
- `packages/core/src/briefing.test.ts` — behavior contract for preservation, corrections, reference requirements and readiness.
- `packages/core/src/chat-components.ts` — versioned safe customer component protocol and runtime validation.
- `packages/core/src/chat-components.test.ts` — accepted/rejected component contract.
- `apps/api/src/ai/conversation-interpreter.ts` — provider-neutral interface for extracting intent/facts/component requests from compact context.
- `apps/api/src/ai/openai-conversation-interpreter.ts` — OpenAI Responses API adapter with strict JSON Schema, `store: false`, normalized provider errors and local validation.
- `apps/api/src/briefing/briefing-store.ts` — persistence port for current briefing/project state.
- `apps/api/src/briefing/supabase-briefing-store.ts` — Supabase implementation with append-only briefing versions and current pointers.
- `apps/api/src/chat/orchestrator.ts` — combines interpreter + deterministic briefing engine + ownership policy into a response plan.
- `apps/api/src/chat/message-store.ts` / `supabase-message-store.ts` — persist final assistant text plus validated structured components.
- `apps/api/src/chat/turn-routes.ts` — keeps current session/idempotency/SSE boundary and delegates response generation to the orchestrator.
- `apps/chat/src/components/ConversationComponent.tsx` — safe renderer for Phase B components.
- `apps/chat/src/App.tsx` / `lib/sse.ts` — consume component SSE events and preserve the existing calm conversational shell.
- `apps/api/src/admin/ai-simulator-routes.ts` — protected test endpoint using the same interpreter/orchestrator without sending customer messages.
- `apps/admin/src/components/AiSimulator.tsx` — operator-only test surface; shows structured facts/components, never hidden model reasoning.

---

### Task 1: Port the deterministic briefing engine with fresh tests

**Files:**
- Create: `packages/core/src/briefing.test.ts`
- Modify: `packages/core/src/briefing.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces `createEmptyBriefing(): Briefing`.
- Produces `mergeBriefing(previous: Briefing, extraction: BriefingExtraction): Briefing`.
- Produces `getMissingBriefingInformation(briefing: Briefing): BriefingMissingKey[]`.
- Produces `isBriefingReady(briefing: Briefing): boolean`.
- Produces `getNextBriefingQuestion(briefing: Briefing): BriefingQuestion | null`.
- `BriefingExtraction` separates `set` from explicit `replace`; only `replace` may overwrite populated fields.

- [ ] **Step 1: Write fresh failing domain tests on the new branch**

Cover at minimum:

```ts
it('preserves unrelated facts when one field is explicitly corrected', () => {
  const previous = createEmptyBriefing();
  previous.creationMode = 'from_scratch';
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
});
```

Also test deduped arrays, exact mandatory text, creative-freedom persistence, reference requirement, high provider confidence not overriding deterministic readiness, and exactly one next question by priority.

- [ ] **Step 2: Run the focused test and prove RED**

Run: `npm test --workspace @caneca-facil/core -- --run src/briefing.test.ts`

Expected: FAIL because `createEmptyBriefing`, merge/readiness functions and optional partial creation mode are absent.

- [ ] **Step 3: Implement only the deterministic domain behavior**

Use these durable semantics:

```ts
export interface BriefingExtraction {
  set: Partial<BriefingEditableFields>;
  replace: Partial<BriefingEditableFields>;
  creativeFreedom?: boolean;
  confidenceScore: number;
  ambiguousFields: BriefingField[];
}
```

`set` fills empty scalars and merges array facts without duplicates. `replace` is the only path for explicit correction. `readyToGenerate` is recomputed from deterministic missing keys after every merge.

- [ ] **Step 4: Run focused tests and prove GREEN**

Run the same focused test command. Expected: all briefing tests pass.

- [ ] **Step 5: Commit**

Commit: `feat: add deterministic conversational briefing engine`

---

### Task 2: Allow partial briefing persistence and implement append-only briefing versions

**Files:**
- Apply new forward Supabase migration; after applying, mirror the exact migration version returned by `Supabase.list_migrations` under `supabase/migrations/`.
- Create: `apps/api/src/briefing/briefing-store.ts`
- Create: `apps/api/src/briefing/supabase-briefing-store.ts`
- Create: `apps/api/src/briefing/supabase-briefing-store.test.ts`

**Interfaces:**
- Produces `BriefingStore.loadOrCreate(conversationId): Promise<BriefingState>`.
- Produces `BriefingStore.appendVersion(input): Promise<BriefingState>`.
- `BriefingState` contains `{ projectId, briefingId, version, briefing }`.
- Project/briefing may exist before `creationMode` is known.

- [ ] **Step 1: Write failing store tests**

Require that an empty conversation can create a project/briefing with no creation mode, a second update inserts version 2 rather than mutating version 1, and `mug_projects.current_briefing_id` points to the newest row.

- [ ] **Step 2: Prove RED**

Run: `npm test --workspace @caneca-facil/api -- --run src/briefing/supabase-briefing-store.test.ts`

Expected: FAIL because store and nullable-partial schema support do not exist.

- [ ] **Step 3: Apply the minimal forward schema change**

DDL intent:

```sql
alter table public.mug_projects alter column creation_mode drop not null;
alter table public.briefings alter column creation_mode drop not null;
alter table public.briefings
  add column creative_freedom boolean not null default false;
```

Keep existing check constraints so any non-null creation mode must still be `reference` or `from_scratch`. Do not expose service-role operations to browser roles.

- [ ] **Step 4: Implement the Supabase store**

Create the project lazily for the conversation, insert immutable briefing versions, update only the project pointer/status and conversation `active_project_id`, and map JSONB arrays defensively.

- [ ] **Step 5: Verify DB + focused tests**

Run the focused Vitest suite. Then query live schema to prove nullable creation mode and `creative_freedom` exist. Run Supabase security advisors; expected security lint count: 0.

- [ ] **Step 6: Commit**

Commit: `feat: persist partial versioned briefings`

---

### Task 3: Define a versioned bounded conversational component protocol

**Files:**
- Create: `packages/core/src/chat-components.ts`
- Create: `packages/core/src/chat-components.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces `ChatComponentEnvelopeV1` with `{ version: 1, components: ChatComponentV1[] }`.
- Phase B supported types: `quick_replies`, `action_buttons`, `upload_request`, `notice`.
- Text remains the normal assistant message stream; richer future commerce component types stay reserved for later phases.
- Produces `parseChatComponentEnvelope(value: unknown): ChatComponentEnvelopeV1 | null`.

- [ ] **Step 1: Write failing validation tests**

Examples:

```ts
expect(parseChatComponentEnvelope({
  version: 1,
  components: [{ type: 'quick_replies', options: [{ id: 'from-scratch', label: 'Criar do zero' }] }],
})).not.toBeNull();

expect(parseChatComponentEnvelope({
  version: 1,
  components: [{ type: 'html', html: '<script>alert(1)</script>' }],
})).toBeNull();
```

Also reject unknown version, empty/oversized labels, duplicate IDs and unexpected properties.

- [ ] **Step 2: Prove RED**

Run: `npm test --workspace @caneca-facil/core -- --run src/chat-components.test.ts`.

- [ ] **Step 3: Implement manual runtime validation**

Keep dependency surface small. Validation must copy only known fields into a new object; never pass provider JSON through untouched.

- [ ] **Step 4: Prove GREEN and commit**

Commit: `feat: add safe conversational component protocol`

---

### Task 4: Add the provider-neutral conversation interpreter and strict OpenAI adapter

**Files:**
- Create: `apps/api/src/ai/conversation-interpreter.ts`
- Create: `apps/api/src/ai/openai-conversation-interpreter.ts`
- Create: `apps/api/src/ai/openai-conversation-interpreter.test.ts`
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/config.test.ts`
- Modify: `apps/api/.env.example`
- Modify: root `.env.example`

**Interfaces:**

```ts
export interface ConversationInterpretation {
  extraction: BriefingExtraction;
  intent: 'create_mug' | 'correct_briefing' | 'answer_question' | 'request_human' | 'other';
  suggestedComponents: ChatComponentEnvelopeV1 | null;
}

export interface ConversationInterpreter {
  interpret(input: {
    customerTurn: string;
    previousBriefing: Briefing;
    recentTranscript: Array<{ sender: 'customer' | 'ai'; text: string }>;
  }): Promise<ConversationInterpretation>;
}
```

Config adds required server-only `OPENAI_API_KEY` and `OPENAI_CONVERSATION_MODEL`. Tests use an injected Responses client.

- [ ] **Step 1: Write failing provider tests**

Require exactly one stateless `responses.create` call with `store: false` and `text.format.type = 'json_schema'`, strict schema, no reasoning/chain-of-thought property, and locally validated output. Require malformed JSON, unknown keys, invalid confidence and invalid component payload to throw a normalized `ConversationInterpreterError`.

- [ ] **Step 2: Prove RED**

Run: `npm test --workspace @caneca-facil/api -- --run src/ai/openai-conversation-interpreter.test.ts`.

- [ ] **Step 3: Implement against the current OpenAI Responses API**

Use the installed `openai` SDK and `client.responses.create(...)`. Current official API guidance confirms Structured Outputs through `text.format` with `type: 'json_schema'`; use that boundary instead of legacy JSON mode. Keep `store: false` for customer conversation extraction. Do not request or persist model reasoning.

- [ ] **Step 4: Add configuration tests**

Missing/blank `OPENAI_API_KEY` or `OPENAI_CONVERSATION_MODEL` must fail production config loading. No `VITE_` OpenAI variable is allowed.

- [ ] **Step 5: Prove GREEN and commit**

Commit: `feat: add structured OpenAI conversation interpreter`

---

### Task 5: Build the conversational orchestrator with deterministic ownership and next-question logic

**Files:**
- Create: `apps/api/src/chat/orchestrator.ts`
- Create: `apps/api/src/chat/orchestrator.test.ts`
- Modify: `apps/api/src/conversations/control.ts` only if a reusable read-policy helper is needed.

**Interfaces:**

```ts
export interface ConversationResponsePlan {
  text: string;
  components: ChatComponentEnvelopeV1 | null;
  briefing: Briefing;
  projectId: string;
}

export interface ConversationOrchestrator {
  respond(input: {
    conversationId: string;
    customerMessageId: string;
    customerText: string;
  }): Promise<ConversationResponsePlan>;
}
```

Dependencies: `ConversationInterpreter`, `BriefingStore`, a read-only conversation-control port and recent-message reader.

- [ ] **Step 1: Write failing orchestration tests**

Cases:
- first vague turn asks only creation mode;
- a rich turn that resolves all deterministic requirements does not ask an unnecessary question;
- explicit correction replaces only the intended field;
- `automation_mode=human`, `paused` or `needs_attention=true` produces no AI plan/provider call;
- provider confidence 1.0 cannot make an incomplete briefing ready;
- unsupported provider components are discarded before response plan creation.

- [ ] **Step 2: Prove RED**

Run the focused orchestrator test.

- [ ] **Step 3: Implement orchestration**

Order is fixed: load state → verify AI ownership → call interpreter → deterministic merge → append briefing version → derive one next question/readiness → filter components → return concise response plan.

- [ ] **Step 4: Prove GREEN and commit**

Commit: `feat: orchestrate conversational briefing turns`

---

### Task 6: Integrate the orchestrator into durable SSE turns

**Files:**
- Modify: `apps/api/src/chat/message-store.ts`
- Modify: `apps/api/src/chat/supabase-message-store.ts`
- Modify: `apps/api/src/chat/supabase-message-store.test.ts`
- Modify: `apps/api/src/chat/turn-routes.ts`
- Modify: `apps/api/src/chat/turn-routes.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- `completeAssistant(messageId, { text, structuredContent })` persists both text and a validated component envelope.
- SSE events remain `accepted`, `text_delta`, `done`, `error`; add `components` carrying only a validated `ChatComponentEnvelopeV1`.
- Replaying a completed customer turn re-emits stored text/components without a second OpenAI call.

- [ ] **Step 1: Write failing integration tests**

Require one provider/orchestrator execution for a new idempotent turn, no second execution on replay, component SSE before `done`, and persisted structured content equal to the validated envelope.

- [ ] **Step 2: Prove RED**

Run focused API turn-route/store tests.

- [ ] **Step 3: Replace `createFoundationResponse` injection with orchestrator dependency**

Do not rewrite session, origin, cookie, idempotency or SSE infrastructure. Keep failure behavior: customer turn remains durable, assistant draft becomes failed, SSE emits normalized `response_failed`.

- [ ] **Step 4: Prove GREEN and commit**

Commit: `feat: stream orchestrated AI chat responses`

---

### Task 7: Render safe Phase B components in the customer chat

**Files:**
- Create: `apps/chat/src/components/ConversationComponent.tsx`
- Create: `apps/chat/src/components/ConversationComponent.test.tsx`
- Modify: `apps/chat/src/lib/sse.ts`
- Modify: `apps/chat/src/lib/sse.test.ts`
- Modify: `apps/chat/src/App.tsx`
- Modify: `apps/chat/src/App.test.tsx`
- Modify: `apps/chat/src/styles.css`

**Interfaces:**
- `components` SSE event is parsed with `parseChatComponentEnvelope` from `@caneca-facil/core`.
- Quick reply click submits its label/value as the next normal customer turn through the same idempotent API path.
- `upload_request` triggers the existing private upload flow, not a new storage path.

- [ ] **Step 1: Write failing UI/parser tests**

Require quick replies and upload request to render with accessible buttons, unknown/invalid envelope to render nothing (or a safe notice), no raw HTML injection, and no ecommerce navigation/chrome.

- [ ] **Step 2: Prove RED**

Run focused `@caneca-facil/chat` tests.

- [ ] **Step 3: Implement the minimal renderer**

Keep one action group close to the AI message, large tap targets, visible focus and existing breathing-room rhythm. Do not add product grid/storefront elements in Phase B.

- [ ] **Step 4: Prove GREEN and commit**

Commit: `feat: render validated conversational actions`

---

### Task 8: Add an Admin AI simulator that uses the same engine

**Files:**
- Create: `apps/api/src/admin/ai-simulator-routes.ts`
- Create: `apps/api/src/admin/ai-simulator-routes.test.ts`
- Create: `apps/admin/src/components/AiSimulator.tsx`
- Create: `apps/admin/src/components/AiSimulator.test.tsx`
- Create: `apps/admin/src/services/ai-simulator.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/admin/src/AdminWorkspace.tsx`
- Modify: `apps/admin/src/AdminWorkspace.test.tsx`

**Interfaces:**
- Simulator endpoint requires a verified Supabase staff token plus existing admin membership.
- It invokes the same `ConversationInterpreter` + deterministic briefing engine, but uses ephemeral simulator state supplied by the Admin request; it does not write customer messages or send anything to the customer chat.
- Response contains `briefing`, `text`, `components`, `missingInformation`, `readyToGenerate`; never provider reasoning.

- [ ] **Step 1: Write failing authorization and same-engine tests**

Unauthenticated/non-admin -> 401/403. Admin -> response generated through the injected shared engine. Assert no customer message-store call occurs.

- [ ] **Step 2: Prove RED**

Run focused API/Admin tests.

- [ ] **Step 3: Implement backend route and simple `Teste IA` Admin section**

Keep simulator state in the Admin component for Phase B. No production conversation is created.

- [ ] **Step 4: Prove GREEN and commit**

Commit: `feat: add shared-engine AI simulator`

---

### Task 9: Phase B acceptance and regression gate

**Files:**
- Create: `docs/acceptance/phase-b-conversational-ai.md`
- Add or modify focused tests only where acceptance uncovers a real gap.

**Acceptance scenario:**
1. Start with a fresh anonymous chat session.
2. Customer says: `Quero uma caneca para aniversário da Ana, azul, mas ainda não sei se vou mandar uma foto.`
3. Engine persists the known facts and asks exactly one unresolved question.
4. Customer chooses reference or from-scratch through a validated quick reply.
5. Customer later says: `Troca azul por rosa. O resto continua igual.`
6. Latest briefing has pink instead of blue while recipient/occasion/other facts remain intact.
7. Invalid/unknown component from a mocked provider is rejected and never rendered.
8. Replay the same `client_message_id`; no duplicate customer message, briefing version or OpenAI interpretation is created.
9. Set conversation to `human` or `paused`; no AI reply occurs.
10. Return to `ai`; structured state is preserved and AI resumes from current briefing.

- [ ] **Step 1: Run complete repository verification**

Run:
- `npm test`
- `npm run typecheck`
- `npm run check:no-meta`
- `npm run build`
- production API smoke test used by CI.

Expected: 0 failures.

- [ ] **Step 2: Run live Supabase verification**

Verify migration list, current briefing schema, project/current-briefing pointer behavior in a transaction with `ROLLBACK`, and security advisors. Expected: no new security lint.

- [ ] **Step 3: Review OpenAI boundary**

Confirm server-only key/model config, `store: false`, strict JSON Schema output, local validation, no reasoning field, and normalized provider errors.

- [ ] **Step 4: Document evidence and open PR**

Record exact CI run, DB assertions and any known non-blocking performance notices. Request review before merge.

---

## Self-Review

### Spec coverage

- Deterministic briefing merge/readiness/minimum question: Tasks 1, 2, 5.
- Structured backend-only OpenAI interpretation: Task 4.
- Versioned bounded components and no arbitrary UI: Tasks 3, 6, 7.
- Streaming AI text/components over existing SSE: Task 6.
- Same engine in simulator/test mode: Task 8.
- No chain-of-thought exposure: Tasks 4, 8, 9.
- Human/AI/paused ownership semantics: Tasks 5 and 9.
- Idempotent replay and durable final assistant result: Tasks 6 and 9.
- Partial conversational state without large forms: Tasks 1, 2, 5.
- Meta remains retired: global constraint + Task 9 gate.

### Placeholder scan

The plan contains no implementation placeholders such as TBD/TODO. Later storefront, artwork, commerce and production behavior is intentionally outside Phase B and remains assigned to roadmap Phases C–F rather than hidden inside this plan.

### Type consistency

`BriefingExtraction` is produced by the interpreter and consumed only by deterministic `mergeBriefing`; `ChatComponentEnvelopeV1` is validated in core, returned by the orchestrator, persisted in assistant `structured_content`, emitted as an SSE `components` event and parsed again by the customer client. `ConversationOrchestrator.respond` is the single integration boundary consumed by turn routes and simulator mode.