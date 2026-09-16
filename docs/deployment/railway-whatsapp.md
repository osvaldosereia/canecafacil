# Caneca Fácil — Railway + Meta WhatsApp deployment

This document describes the Phase 1 production deployment contract for the Node/Hono API.

## Repository

Canonical repository: `osvaldosereia/canecafacil`

Railway reads `railway.toml` from the repository root.

## Build and start

- Build: `npm ci && npm run build`
- Start: `npm run start --workspace @caneca-facil/api`
- Healthcheck: `GET /health`

A healthy API returns HTTP 200 with:

```json
{
  "status": "ok",
  "service": "caneca-facil-api"
}
```

## Required server-side environment variables

Never commit real values to GitHub.

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
WHATSAPP_VERIFY_TOKEN
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_GRAPH_VERSION
WHATSAPP_APP_SECRET
```

`PORT` is optional. The API defaults to `3000`, and the hosting platform may inject its own `PORT` value.

## Meta webhook endpoints

After deployment, assuming the public API base URL is `https://<api-host>`:

- Callback URL: `https://<api-host>/webhooks/whatsapp`
- Verification: Meta calls the callback with `hub.mode`, `hub.verify_token`, and `hub.challenge`.
- Inbound events: Meta sends `POST https://<api-host>/webhooks/whatsapp`.

`WHATSAPP_VERIFY_TOKEN` must be the same private value configured in Meta.

When `WHATSAPP_APP_SECRET` is configured, inbound POST requests must carry a valid `X-Hub-Signature-256`; invalid signatures are rejected before persistence.

## Supabase

Production project: `ijquzclfijwfgwupoxmg` (`Caneca Fácil`).

The API uses a server-side Supabase secret key. It must never be exposed to the React Admin or any browser bundle.

## Phase 1 real-environment acceptance

Do not mark Phase 1 complete until all checks below are performed against the deployed API:

1. `GET /health` returns HTTP 200.
2. Meta webhook verification succeeds.
3. Send one real WhatsApp inbound text to the business number.
4. Confirm exactly one customer, one open conversation, and one inbound message are persisted.
5. Replay the same WhatsApp message/event and confirm no duplicate inbound row is created.
6. Send one outbound WhatsApp text through the official Cloud API and confirm it is persisted with the provider message ID.
7. Switch the conversation AI → human and confirm automatic AI reply eligibility is blocked.
8. Switch human → AI and confirm conversation context remains intact.
9. Run repository tests, typecheck, and build.
10. Run Supabase security advisor and confirm no newly introduced security issue.

## Secret-handling rule

The GitHub repository is public. Only placeholder values belong in `.env.example`. Real Meta, Supabase secret, OpenAI, payment, and shipping credentials must live in the deployment platform's private environment/secrets store.
