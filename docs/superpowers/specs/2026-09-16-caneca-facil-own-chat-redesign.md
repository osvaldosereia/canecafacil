# Caneca Fácil — Own AI Chat Redesign

**Status:** Approved architectural direction; implementation plan pending user review of this written spec.

**Date:** 2026-09-16

## 1. Product Decision

Caneca Fácil is no longer a WhatsApp/Meta-first product. The official product becomes an independent conversational-commerce platform with its own customer chat, AI orchestration, storefront components, creative workflow, checkout, human handoff, production and lifecycle automation.

Meta/WhatsApp is removed as a platform dependency. The product must not require Meta webhooks, Graph API, WhatsApp templates, WhatsApp message IDs, WhatsApp media URLs, WhatsApp verification tokens or WhatsApp-specific database fields to operate.

The customer experience is not a traditional ecommerce website with a chat widget. **The conversation itself is the store.**

## 2. Experience Principle: Human Conversation, Not Website

The most important visual rule is that the customer must feel they are talking naturally with a helpful person, not navigating a web store.

The interface must therefore:

- use generous whitespace and large breathing room between conversational moments;
- avoid dense dashboards, product grids, permanent menus and ecommerce chrome;
- show one meaningful decision at a time;
- keep the main focus on the conversational thread;
- render commercial UI only when it helps the current conversation;
- use calm typography, large tap targets and minimal visual noise;
- favor natural transitions and progressive disclosure over pages and forms;
- avoid persistent sidebars on mobile;
- avoid "website sections" such as hero/banner/category walls inside the main chat;
- make cards feel like rich conversational objects, not catalog tiles;
- minimize borders, boxes and nested panels;
- keep actions close to the message that caused them;
- make the AI language concise, warm, conversational and context-aware;
- never make the customer fill a large form when the same data can be gathered conversationally.

The visual benchmark is closer to a modern messaging/AI product than to a marketplace.

### 2.1 Chat rhythm

A typical customer turn should visually have:

1. conversational message;
2. breathing space;
3. at most one rich component or one small action group;
4. breathing space before the next conversational turn.

The UI must avoid stacking a message, six cards, twelve filters and a checkout panel at once.

### 2.2 Responsive behavior

The primary target is mobile. Desktop should preserve the same calm chat rhythm rather than stretching content edge-to-edge. The conversation column should have a comfortable maximum width, while temporary rich content such as model carousels may use controlled wider space when beneficial.

## 3. Recommended Architecture

The platform remains a monorepo and is reorganized around four primary units:

- `apps/chat` — customer-facing conversational application, React/Vite/PWA;
- `apps/admin` — operator/admin application;
- `apps/api` — Hono/Node backend, AI orchestration, business APIs and event execution;
- `packages/core` — shared deterministic domain logic and message/component contracts.

Infrastructure:

- Supabase Postgres for durable business data;
- Supabase Auth for staff/admin authentication;
- Supabase Storage for private customer uploads, artwork, mockups and print files;
- Supabase Realtime where useful for human handoff/operator updates, but not as the AI orchestrator;
- OpenAI behind backend-only providers for language, image understanding, transcription and creative generation;
- external commerce providers such as Melhor Envio and PIX adapters behind provider-neutral interfaces later in the roadmap;
- Node worker/event processing for internal automations.

The backend owns state transitions, permissions, pricing, readiness gates and automation execution. The AI interprets intent and creates content, but cannot directly mutate protected business state.

## 4. Customer Identity and Sessions

Customers do not need to create an account to begin.

### 4.1 Anonymous visitor

On first visit, the chat receives a secure anonymous visitor/session identity. The browser stores only a safe session token/reference; sensitive server secrets never reach the browser.

Core concepts:

- `visitor_id` — durable anonymous browser/device identity when possible;
- `chat_session_id` — current browser/session context;
- `conversation_id` — durable conversation thread;
- `customer_id` — optional until identity is collected or matched.

A customer can start creating a mug before giving name, email, phone or address.

### 4.2 Progressive identification

Identity is collected only when useful, normally close to checkout or when the customer asks to save/recover work.

The conversation may request:

- name;
- email;
- phone;
- shipping address.

Previously supplied information should be reused after confirmation rather than repeatedly requested.

### 4.3 Returning customers

The system should support returning to an unfinished project from the same browser session. Later phases may add secure magic-link recovery and order tracking without conventional password creation.

## 5. Conversation Model

The current WhatsApp-specific ingest model is retired.

New conversation messages are provider-neutral and originated by:

- `customer`;
- `ai`;
- `human`;
- `system`;
- `automation`.

Suggested durable message fields:

- `id`;
- `conversation_id`;
- `sender_type`;
- `message_kind`;
- `text_content` when applicable;
- `structured_content` JSONB when applicable;
- `client_message_id` for browser retry/idempotency;
- `reply_to_message_id` when applicable;
- timestamps;
- delivery/processing state;
- optional correlation/event IDs.

There must be no `whatsapp_message_id`, Graph API ID or provider-specific identifier in the generic message contract.

## 6. Rich Conversational UI Protocol

The AI does not control arbitrary HTML or React. It returns a bounded, validated structured response that the backend converts into supported conversational components.

Initial component types:

- `text`;
- `quick_replies`;
- `action_buttons`;
- `image`;
- `audio`;
- `upload_request`;
- `product_card`;
- `product_carousel`;
- `model_selector`;
- `quantity_selector`;
- `mockup_review`;
- `comparison`;
- `price_summary`;
- `checkout_step`;
- `pix_payment`;
- `order_status`;
- `notice`.

The component contract is versioned. Unknown components are safely rejected or rendered as a fallback text message.

### 6.1 AI component permissions

The AI may request presentation of allowed UI components, but it may not invent prices, discounts, payment status or production state. Values shown by transactional components come from deterministic backend services.

For example, the AI may request `product_carousel` for "canecas com interior colorido", but the backend selects authorized products and injects current product data.

## 7. Chat Transport and Streaming

The customer posts a turn to the Caneca Fácil API. The backend persists the inbound message idempotently and starts the conversational orchestration.

For AI response streaming, the preferred first implementation is Server-Sent Events (SSE):

1. browser sends the turn;
2. server validates session and message idempotency;
3. server processes intent/briefing/tool actions;
4. response text can stream progressively;
5. structured components are emitted as validated events once ready;
6. the durable final assistant turn is persisted.

SSE is preferred initially because the customer path is primarily server-to-client streaming after each request and is simpler to operate than a permanent WebSocket connection.

WebSocket or Supabase Realtime may later support operator-presence features where bidirectional live state is valuable.

## 8. AI Orchestration

The AI layer is split into focused capabilities rather than one unrestricted agent.

### 8.1 Conversation interpreter

Understands the newest customer message plus compact structured context. Produces structured intent/facts/actions, not business-state mutations.

### 8.2 Briefing engine

Existing briefing work remains conceptually valuable and becomes a core product capability. It must:

- merge newly extracted facts into existing structured briefing;
- preserve unrelated known facts;
- make explicit corrections only to targeted fields;
- track references, names, dates, required text and creative constraints;
- calculate deterministic missing information;
- ask the minimum next question;
- decide readiness by code, not by LLM opinion.

The in-progress feature branch must not be merged wholesale because it contains Meta-era assumptions and intermediary changes. Relevant deterministic briefing logic should be salvaged/reimplemented deliberately under the new design.

### 8.3 Tool/action planner

When the conversation requires a deterministic operation, the AI requests a typed action such as:

- show models;
- search products;
- add/select a model;
- request upload;
- generate creative proposal;
- calculate price;
- start checkout;
- ask for human help.

The backend validates every action against session permissions and current domain state.

### 8.4 Creative AI

Separate providers handle artwork generation, reference interpretation, mockup generation and later print-ready production assets. Creative versions remain immutable after approval.

## 9. Media and Audio

The Meta-specific two-step media download flow is removed.

The own chat uploads files directly to the Caneca Fácil backend/storage through controlled upload endpoints or signed upload flows.

Supported customer media in the MVP:

- image references;
- audio messages;
- optional documents if needed later.

Requirements:

- private storage only;
- MIME/type validation;
- file-size limits;
- deterministic paths/IDs;
- no public permanent source URLs;
- audio transcription idempotent by media ID;
- customer can record audio directly in the chat UI;
- transcription is used by the AI but does not have to clutter the customer UI.

The existing private storage concepts and transcription provider can be reused after removal of Meta-specific download code.

## 10. Intelligent Storefront

The storefront is conversational and contextual.

### 10.1 Contextual presentation

Products/models appear when relevant to the conversation. The customer should not be forced into a catalog page unless they explicitly want to browse.

Examples:

- "quero algo barato" → appropriate product choices;
- "quero uma caneca diferente" → visually distinct models;
- "30 unidades para minha empresa" → bulk-suitable options and pricing logic;
- "ver modelos" → explicit full browsing experience inside the conversation shell.

### 10.2 Browse mode

A lightweight browse layer may open over/within the chat, but it must visually remain part of the conversational product. It should include:

- search;
- categories/tags;
- product/model cards;
- price;
- key characteristics;
- select/compare action.

After selection, the user returns seamlessly to the thread with context preserved.

## 11. Art Creation Workflow

The core creative flow remains:

1. customer chooses reference or creation from scratch;
2. uploads images and/or sends text/audio;
3. AI completes structured briefing with minimal questions;
4. artwork version is generated;
5. technical/creative validation runs;
6. two-sided commercial/emotional mug mockup is generated;
7. customer approves or requests changes;
8. changes create new immutable versions;
9. approval locks exact art and mockup version;
10. print-ready asset is produced from the approved version.

No approved artwork is overwritten.

## 12. Human Handoff

The Admin must provide a live conversation workspace.

Conversation ownership states:

- `ai`;
- `human`;
- `paused`.

When an operator takes over:

- automatic AI replies stop immediately;
- the operator can send messages and rich supported components;
- the customer remains in the same own-chat thread;
- structured project/briefing context remains visible to the operator;
- returning control to AI preserves structured state and conversation context.

The Admin must show useful structured facts and message history, not hidden model chain-of-thought.

## 13. Event and Automation Engine

The new architecture includes its own event-driven automation foundation.

Events are append-only domain facts such as:

- `conversation.started`;
- `briefing.updated`;
- `briefing.completed`;
- `media.received`;
- `art.generated`;
- `mockup.generated`;
- `art.revision_requested`;
- `art.approved`;
- `checkout.started`;
- `order.created`;
- `payment.created`;
- `payment.confirmed`;
- `production.ready`;
- `production.started`;
- `shipment.created`;
- `shipment.updated`;
- `order.delivered`.

Automations subscribe to events and execute typed jobs. They must be idempotent and auditable.

This foundation later supports abandoned creation, abandoned checkout, post-sale follow-up, reviews, repurchase and marketing without Make or Meta dependency.

## 14. Commerce and Production

Later phases keep the previously approved deterministic approach:

- products/models have authoritative server-side price and configuration;
- quantity discounts are server rules;
- freight is calculated by a provider adapter, initially Melhor Envio when activated;
- PIX is handled through a provider-neutral interface;
- payment status comes only from verified provider state/webhooks/reconciliation;
- production only releases when payment, approved artwork and valid print asset gates are satisfied;
- shipping and tracking are separate state dimensions.

The AI never determines these values from language.

## 15. Admin Information Architecture

Target navigation remains simple:

- Início;
- Atendimento;
- Pedidos;
- Artes & Produção;
- Clientes;
- Modelos;
- Configurações.

The Admin can look like an operational system; the "no site look" principle applies primarily to the customer chat. Even in Admin, avoid unnecessary density and favor clear operational states.

## 16. Data Migration Strategy

Do not drop production schema blindly.

The redesign uses forward-only migrations.

### 16.1 Keep/reuse

Concepts to retain and adapt:

- `customers`;
- `mug_templates`;
- `mug_projects`;
- `project_media`;
- `audio_transcriptions`;
- `briefings`;
- `art_versions`;
- `mockup_versions`;
- `review_events`;
- private storage buckets;
- admin authorization foundation.

### 16.2 Generalize

- `conversations` becomes own-chat provider-neutral;
- `messages` becomes provider-neutral;
- customer/channel identifiers become visitor/session/customer concepts;
- media source metadata becomes own-upload metadata.

### 16.3 Retire

The following are retired from active architecture:

- `whatsapp_id` semantics;
- `whatsapp_message_id` semantics;
- WhatsApp-only conversation channel checks;
- `ingest_whatsapp_inbound` RPC;
- WhatsApp webhook configuration;
- Graph API credentials and message send client;
- WhatsApp media retrieval code;
- WhatsApp-specific tests and acceptance docs.

Retirement should be staged: stop references in application code, migrate durable generic data where needed, verify no dependency, then remove obsolete database artifacts in a later cleanup migration.

## 17. Repository Migration Strategy

The redesign must start from `main`, not from the unfinished `feat/caneca-facil-briefing-simulator` branch.

Reason: that branch contains useful briefing work but also transitional Meta-era infrastructure. Its useful domain ideas should be selectively ported with tests rather than merging the branch wholesale.

The old Meta-focused specs/plans remain temporarily in Git history but should be marked superseded by this spec. The new roadmap becomes the only implementation authority after the implementation plan is approved.

## 18. Customer Chat Visual System

This is a hard product requirement, not optional polish.

### 18.1 Layout

- centered conversational column;
- comfortable maximum width;
- large vertical rhythm;
- message bubbles used selectively, not for every system object;
- AI messages may use a cleaner open layout rather than enclosing everything in bubbles;
- rich objects can slightly expand beyond text width when visual content needs it;
- composer stays simple and calm;
- mobile safe-area support;
- avoid permanent header clutter.

### 18.2 Product presentation

Product/model cards should:

- use strong imagery;
- show only the most decision-relevant information;
- avoid dense specification tables;
- be horizontally browsable when multiple choices exist;
- return the user to natural conversation after selection.

### 18.3 Human cues

The experience may use:

- subtle typing state;
- short progressive text streaming;
- natural pauses between dependent UI events;
- friendly acknowledgement after uploads/selections;
- concise confirmation language;
- contextual suggestions.

It must avoid fake human deception such as pretending a real employee typed when the response is AI. The product can have a named assistant/persona, but internal/system behavior must remain trustworthy.

### 18.4 Accessibility

- minimum accessible tap targets;
- keyboard support on desktop;
- visible focus states;
- semantic labels for icon-only controls;
- sufficient contrast;
- reduced-motion support;
- upload/audio controls usable with assistive technologies.

## 19. Error Handling

Errors should be conversational when customer-facing.

Examples:

- upload failed → keep the drafted message and offer retry;
- AI temporary failure → preserve the customer's turn and offer retry without duplicating the message;
- streaming disconnect → reconnect/recover from durable message state;
- duplicate browser submission → idempotent `client_message_id` prevents duplicate message/action;
- unsupported structured component → fallback to safe text/notice;
- generation failure → project remains intact and can retry the failed job.

Provider errors and secrets must never be exposed to the customer.

## 20. Security

- no service-role/OpenAI/payment secrets in the browser;
- own-chat session tokens are scoped and revocable;
- staff authentication remains separate from customer anonymous sessions;
- private buckets for customer and creative media;
- signed/controlled file access;
- strict CORS/origin policy for deployed apps;
- idempotency for message sends and event jobs;
- rate limiting/abuse controls before public launch;
- structured AI outputs validated before execution;
- business actions authorized in backend code;
- RLS/security advisors run after schema changes.

## 21. Testing Strategy

Testing is layered:

1. pure domain tests for conversation/briefing/pricing/readiness;
2. component-protocol validation tests;
3. API tests for anonymous session and idempotent message posting;
4. streaming/SSE tests;
5. upload/media tests;
6. AI provider contract tests with mocks;
7. Admin human-handoff tests;
8. Supabase RLS/security tests;
9. browser-level customer journey tests;
10. full flow acceptance with test providers before real commerce activation.

No implementation phase is considered complete from UI screenshots alone.

## 22. Implementation Decomposition

The redesign is intentionally decomposed into sequential sub-projects, each with its own hard gate.

### Phase A — Own Chat Foundation

- supersede Meta architecture;
- provider-neutral conversations/messages;
- anonymous visitor/session identity;
- idempotent own-chat message API;
- SSE response transport;
- new `apps/chat` shell;
- direct private media upload foundation.

### Phase B — Conversational AI

- deterministic briefing engine;
- structured AI interpreter;
- typed UI/action protocol;
- streamed AI replies;
- minimal-question orchestration;
- test/simulator mode using the same engine.

### Phase C — Intelligent Storefront

- model/product database;
- contextual search/recommendation tools;
- product cards/carousels;
- browse mode inside conversational shell;
- model selection and project binding.

### Phase D — Creative Production

- reference analysis;
- artwork generation/versioning;
- validation;
- two-sided mockup;
- revision/approval;
- print-ready asset generation.

### Phase E — Commerce

- products/pricing/quantity discount;
- customer identity/address;
- freight;
- PIX;
- order lifecycle;
- interrupted checkout recovery.

### Phase F — Operations and Automation

- human handoff/live Admin;
- production queue;
- shipping/tracking;
- event automation worker;
- lifecycle notifications within own chat;
- post-sale/remarketing foundation.

## 23. Acceptance of the Redesign

The redesign architecture is considered successfully established when:

- the customer can open Caneca Fácil without Meta/WhatsApp dependencies;
- an anonymous visitor can begin and resume a conversation;
- chat messages persist idempotently;
- AI responses can stream;
- the conversation can render validated rich components;
- images/audio can be uploaded directly;
- the briefing engine progresses naturally;
- the UI visibly follows the human, spacious, non-website design principles;
- a product/model can be selected inside the conversation;
- the same thread can be taken over by a human operator;
- no Meta credential, webhook or Graph API is required for the core product.

## 24. Superseded Direction

This document supersedes all previous Caneca Fácil architectural direction whose primary customer channel is WhatsApp/Meta. Older documents remain historical references only until a later documentation cleanup.

No Meta-focused feature should be implemented from those older plans after this spec becomes the active roadmap authority.
