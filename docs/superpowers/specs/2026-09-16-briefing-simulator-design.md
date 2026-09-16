# Caneca Fácil — Intelligent Briefing + Admin Simulator Design

**Date:** 2026-09-16  
**Repository:** `osvaldosereia/canecafacil`  
**Status:** Approved design for implementation planning

## 1. Goal

Build an intelligent mug-briefing engine that can be tested entirely inside the Admin before the Meta WhatsApp integration is activated.

The same briefing engine must later serve the real WhatsApp flow. The Admin simulator is only a test surface; it must not create a second AI behavior or a second set of briefing rules.

## 2. Scope

This block includes:

- deterministic briefing merge/readiness logic in `packages/core`;
- backend AI extraction through a structured provider interface;
- a protected Admin-only simulator backend boundary;
- an Admin section named `Teste IA`;
- a multi-turn simulated conversation;
- operator-visible structured understanding and next action;
- tests proving known facts are preserved, explicit corrections replace only targeted facts, and repeated questions are avoided.

This block does **not** activate customer-facing AI, WhatsApp outbound, payment, freight, production, artwork generation, or marketing automation.

## 3. Architecture Decision

Use one shared briefing domain with two adapters:

1. **Production adapter later:** receives normalized WhatsApp text, transcriptions and references.
2. **Admin simulator now:** submits simulated customer turns to the same backend briefing service.

The Admin must never call OpenAI directly. Provider credentials remain backend-only.

The AI provider extracts structured facts. Deterministic code decides whether the briefing is complete and which question should be asked next.

## 4. Briefing Domain

The existing `Briefing` structure remains the canonical domain model and is extended with helper types/functions rather than replaced.

Core behavior:

- `mergeBriefing(previous, extraction)` preserves prior facts unless the new extraction explicitly changes them;
- array facts such as names, mandatory text and forbidden elements are merged without silent loss;
- explicit correction signals may replace a targeted field, e.g. `blue -> pink`;
- `getMissingBriefingInformation(briefing)` returns deterministic missing facts;
- `isBriefingReady(briefing)` is deterministic and does not depend on the language model's confidence alone;
- `getNextBriefingQuestion(briefing)` returns at most one highest-priority question;
- confidence is informational and must not override required-field rules.

Initial required-information policy:

- creation mode must be known;
- the system must know enough creative direction to generate a meaningful design;
- at least one of theme/occasion/recipient/creative direction must define context;
- any user-declared mandatory text/name/date/elements must be preserved exactly;
- reference-based projects may proceed with less textual description when references plus explicit instructions are sufficient;
- missing optional preferences do not block generation if the user grants creative freedom.

The readiness policy must be encoded in code and covered by tests so it can evolve without prompt-only behavior changes.

## 5. AI Extraction Contract

The backend provider receives:

- previous structured briefing;
- current simulated customer message;
- optional prior conversation excerpts needed for context;
- later, transcription/reference metadata when those paths are wired.

The provider returns structured JSON only, containing extracted facts and explicit change intent.

The provider must not decide:

- prices;
- discounts;
- freight;
- payment state;
- production state;
- final readiness rules;
- whether a WhatsApp message should be sent.

Malformed/invalid provider output becomes a recoverable simulator error and must not mutate persisted project/customer state.

## 6. Simulator Isolation

`Teste IA` is a sandboxed Admin experience.

The simulator must not write to:

- `customers`;
- real `conversations`;
- real `messages`;
- orders;
- payments;
- shipments.

For the first version, the complete synthetic transcript and briefing live only in browser memory. Each submitted turn sends the current synthetic briefing plus the new customer message to the protected backend. The backend remains stateless for simulator sessions.

`Nova simulação` clears the browser-side transcript/briefing and starts from a clean synthetic state.

If persistent regression scenarios are added later, they must use dedicated test tables or fixtures, never production customer entities.

## 7. Admin Experience

Add a new Admin navigation section: `Teste IA`.

The page shows three areas:

### 7.1 Conversa simulada

A simple multi-turn transcript with synthetic `Cliente` and `Atendente` messages.

The operator types a customer message and submits it to the backend simulator endpoint/service.

### 7.2 Entendimento da IA

Display structured operational facts only:

- mode of creation;
- occasion;
- recipient;
- theme;
- style;
- colors;
- names;
- dates;
- mandatory text;
- mandatory elements;
- forbidden elements;
- references metadata when available;
- missing information;
- confidence;
- ready/not ready.

Do not expose chain-of-thought or hidden model reasoning.

### 7.3 Próxima ação

Display one normalized action:

- `ask_customer` with one question;
- `ready_to_generate`;
- `needs_review` when provider output is invalid or ambiguous beyond safe handling.

The simulated attendant reply is derived from the normalized next action. It does not trigger a second free-form model call. This keeps cost and behavior bounded.

Buttons:

- `Enviar como cliente`;
- `Nova simulação`.

No button in this page may send external WhatsApp traffic.

## 8. Protected Backend Boundary

Add an Admin-only API boundary for the simulator.

Request shape:

- current synthetic briefing;
- current synthetic transcript excerpt when needed;
- new customer turn.

Processing:

1. verify the Admin's Supabase access token;
2. verify that the authenticated user is an authorized Caneca Fácil admin;
3. invoke `BriefingProvider` for structured extraction;
4. validate provider output;
5. run deterministic merge/readiness/question selection;
6. return updated briefing + normalized next action + bounded simulated attendant reply.

The Admin sends its existing Supabase access token as `Authorization: Bearer <token>`. The API must verify that token server-side and must not rely on a browser-supplied `isAdmin` flag.

### 8.1 Admin authorization source

Reuse the existing `private.admin_users` membership concept instead of inventing a second role list.

The implementation plan must add a minimal authenticated database authorization path that can answer only whether the current Supabase user is an admin. A security-definer helper/RPC may expose a boolean to authenticated sessions while the underlying `private.admin_users` rows remain inaccessible to normal client reads/writes.

The API must not expose the simulator route until this authorization guard is working and tested.

### 8.2 Existing security issue to remediate before enabling the simulator

Current Supabase inspection reports RLS disabled on `private.admin_users`. Before enabling the simulator endpoint, RLS must be enabled on that table with an intentional access strategy. The baseline remediation surfaced by Supabase is:

```sql
ALTER TABLE private.admin_users ENABLE ROW LEVEL SECURITY;
```

This DDL must not be applied automatically from this design step. It requires explicit approval during implementation because enabling RLS without the intended access path could block legitimate admin checks.

## 9. Error Handling

- provider timeout/error: return `needs_review`/simulator error without mutating real data;
- malformed structured output: reject the extraction;
- empty customer turn: validation error;
- contradictory explicit customer correction: new explicit value wins only for the targeted field;
- ambiguous correction: keep existing fact and ask a clarification instead of guessing;
- unknown optional facts: do not invent values;
- missing/invalid Admin token: reject before any OpenAI call;
- authenticated non-admin user: reject before any OpenAI call.

## 10. Testing Strategy

### Core tests

Prove:

- previous known facts survive later turns;
- explicit targeted corrections change only their field;
- repeated data is deduplicated;
- mandatory text is not silently paraphrased or dropped;
- missing-information calculation is deterministic;
- one next question is selected;
- creative freedom can satisfy optional-preference gaps;
- readiness cannot be forced by provider confidence.

### Backend tests

Prove:

- structured provider output is validated;
- invalid provider output is recoverable;
- missing/invalid auth is rejected before provider invocation;
- authenticated non-admin users are rejected before provider invocation;
- simulator orchestration never invokes WhatsApp outbound;
- simulator orchestration does not write customer/conversation/message tables;
- the same domain helpers are used by simulator and future production orchestration.

### Admin tests

Prove:

- `Teste IA` is available in navigation;
- a synthetic customer turn updates the transcript and structured briefing panel;
- `Nova simulação` resets local synthetic state;
- the access token is supplied to the API without exposing service credentials;
- the page does not expose hidden reasoning;
- no WhatsApp action is invoked from the simulator.

## 11. Security and Cost Controls

- OpenAI key stays server-side only;
- Supabase service credentials stay server-side only;
- no real credentials in repository files;
- authorization is checked before invoking OpenAI;
- one extraction call per submitted simulator turn;
- no second free-form model call to compose the simulated reply;
- no automatic background loops;
- no artwork generation in this block;
- no automatic transcription call unless a future simulator input explicitly includes an audio fixture;
- model name remains configurable;
- all simulator responses must be bounded and structured before rendering operational fields.

## 12. Relationship to Existing Roadmap

This design implements the briefing portion of Phase 2 before Meta live acceptance because it can be safely developed and tested offline from the real messaging channel.

The live Meta Phase 1 gate remains pending and unchanged.

After this block is implemented and verified, the next Meta-independent candidates are:

1. model/inspiration library;
2. artwork generation behind a disabled/test-only provider path;
3. two-sided mockup generation;
4. revision/approval simulation.

None of those should be wired to real customer outbound until the Meta acceptance gate is closed.

## 13. Acceptance Criteria

This block is complete when:

1. a tester can open `Teste IA` in Admin;
2. run a multi-turn simulated mug conversation;
3. see the briefing evolve without losing known facts;
4. correct a prior preference without damaging unrelated facts;
5. see exactly one next question while information is missing;
6. reach `ready_to_generate` deterministically when the briefing is sufficient;
7. start a fresh simulation without creating customer/conversation/message records;
8. unauthenticated and non-admin callers cannot invoke the simulator AI provider;
9. repository tests, typecheck and build pass;
10. no WhatsApp send is triggered;
11. no real customer data is required.
