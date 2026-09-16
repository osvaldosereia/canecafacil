# Caneca Fácil — Own Chat Implementation Roadmap

**Date:** 2026-09-16

**Architecture authority:** `docs/superpowers/specs/2026-09-16-caneca-facil-own-chat-redesign.md`

This roadmap replaces the older Meta/WhatsApp-first implementation sequence. The customer channel is now the Caneca Fácil own chat. Older Meta plans remain historical only and must not drive new implementation.

## Delivery Rule

Each phase is a separate implementation project with its own plan, TDD cycle, CI gate, Supabase security review when schema changes, and acceptance checkpoint. A later phase must not compensate for an incomplete earlier phase.

## Phase A — Own Chat Foundation

Detailed plan: `docs/superpowers/plans/2026-09-16-caneca-facil-phase-a-own-chat-foundation.md`

Outcome:

- Meta runtime dependency removed;
- provider-neutral conversation/message schema;
- anonymous visitor and revocable session identity;
- secure HttpOnly session cookie;
- idempotent customer turns;
- SSE streaming transport;
- conversation history recovery;
- private direct media upload foundation;
- new `apps/chat` mobile-first conversational shell;
- generous whitespace, no ecommerce-site chrome;
- no OpenAI dependency required to exercise the foundation.

Gate: a fresh browser can start a session, send/retry a message without duplicates, receive a streamed deterministic response, reload and recover history, upload an allowed private file, and run with no Meta credential configured.

## Phase B — Conversational AI

Planned implementation document: `docs/superpowers/plans/2026-09-16-caneca-facil-phase-b-conversational-ai.md`

Outcome:

- deterministic briefing engine ported from useful prior work;
- structured OpenAI interpreter behind backend-only provider;
- versioned rich conversational component protocol;
- minimal-next-question orchestration;
- streaming AI text plus validated components;
- simulator/test mode using the same engine;
- no chain-of-thought exposure;
- human/AI ownership semantics preserved.

Gate: multi-turn text/reference scenario reaches a deterministic briefing state, explicit corrections preserve unrelated facts, and the customer receives only validated supported UI components.

## Phase C — Intelligent Storefront

Planned implementation document: `docs/superpowers/plans/2026-09-16-caneca-facil-phase-c-intelligent-storefront.md`

Outcome:

- product/model domain;
- categories/tags/search;
- contextual recommendations;
- conversational product cards and carousels;
- lightweight browse mode inside the chat shell;
- model comparison and selection;
- project binding to authoritative model data.

Gate: a customer can ask naturally for a type of mug, browse relevant models inside the conversation, select one, and return to the thread without losing context.

## Phase D — Creative Production

Planned implementation document: `docs/superpowers/plans/2026-09-16-caneca-facil-phase-d-creative-production.md`

Outcome:

- image/audio reference interpretation;
- artwork generation;
- immutable art versions;
- validation and bounded correction;
- commercial/emotional two-sided mockup;
- revision loop;
- immutable approval;
- print-ready asset tied to the approved version.

Gate: reference/audio/text → briefing → art → mockup → requested revision → second version → explicit approval → correct print asset.

## Phase E — Commerce

Planned implementation document: `docs/superpowers/plans/2026-09-16-caneca-facil-phase-e-commerce.md`

Outcome:

- authoritative pricing and quantity discounts;
- progressive customer identity;
- multiple addresses;
- order domain and event history;
- freight provider adapter;
- PIX provider adapter;
- webhook/reconciliation-confirmed payment;
- resumable conversational checkout.

Gate: approved art → quantity → address → freight → final total → PIX → confirmed payment, with deterministic arithmetic and resumable state.

## Phase F — Operations and Automation

Planned implementation document: `docs/superpowers/plans/2026-09-16-caneca-facil-phase-f-operations-automation.md`

Outcome:

- live Admin conversation workspace;
- human takeover and return to AI;
- production gates/queue;
- label/shipping/tracking;
- append-only domain events;
- idempotent internal automation worker;
- in-chat lifecycle notifications;
- foundation for abandonment, post-sale, review, repurchase and campaigns.

Gate: paid approved order → production → shipment → delivery, with an operator able to take over the same customer thread at any time and all automation effects auditable.

## Cross-Phase Non-Negotiables

- Customer experience must feel like a calm human conversation, not a website.
- Mobile-first; generous breathing room; one meaningful decision at a time.
- AI never owns prices, discounts, payment truth, production release or protected business-state transitions.
- All structured AI output is schema-validated before use.
- Private customer/creative media stays private.
- Browser never receives service-role, OpenAI, payment or provider secrets.
- Message writes and automation jobs are idempotent.
- Database changes are forward-only migrations applied through Supabase migration tooling.
- Run `npm test`, `npm run typecheck`, `npm run build` at every phase gate.
- Run Supabase security advisors after every schema/security change.
- Do not merge the unfinished `feat/caneca-facil-briefing-simulator` branch wholesale; selectively port only compatible domain behavior with fresh tests.
