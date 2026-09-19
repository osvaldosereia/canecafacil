# Caneca Fácil — Decisions

## Active decisions
- Official and independent repository is `osvaldosereia/canecafacil`; `osvaldosereia/CHAT` is historical only.
- Official Supabase project is `ijquzclfijwfgwupoxmg`.
- Customer channel is first-party own chat. Meta/WhatsApp/Make must not return to runtime.
- Work continues from `main`/Phase A rather than wholesale-merging the old briefing simulator branch.
- Phase B implementation branch: `phase-b-conversational-ai`.
- Briefing truth/readiness stays deterministic in code; the LLM extracts/interprets facts but cannot declare protected state truth.
- Explicit correction changes only targeted facts; unrelated known briefing facts are preserved.
- Rich UI is a bounded, versioned protocol. Unknown/invalid components are rejected or safely reduced to text.
- AI provider is backend-only and replaceable behind typed interfaces.
- Existing `ai | human | paused` conversation ownership remains authoritative; automated replies must not bypass human/paused state.
- Keep AI usage cost-conscious: compact structured context, focused extraction calls, no unnecessary model calls, deterministic code wherever possible.
- Database migrations are forward-only and security review follows schema/security changes.