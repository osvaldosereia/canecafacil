> Repositório oficial e independente do projeto Caneca Fácil: `osvaldosereia/canecafacil`.

# Caneca Fácil

Plataforma própria de comércio conversacional para criação e venda de canecas personalizadas. A experiência do cliente acontece em um chat first-party, humano e visual, sem depender de Meta/WhatsApp.

## Direção atual

O chat é a própria loja: conversa, envio de imagem/áudio, vitrine contextual, criação de arte, mockup, aprovação e checkout evoluem dentro do mesmo fluxo. A interface do cliente é mobile-first, espaçosa e evita aparência de site/e-commerce tradicional.

## Estrutura

```text
apps/
  chat/    experiência conversacional do cliente
  admin/   painel operacional da equipe
  api/     backend Hono/Node e orquestração
packages/
  core/    contratos e regras determinísticas compartilhadas
supabase/
  migrations/
docs/superpowers/
  specs/
  plans/
```

## Arquitetura ativa

- React/Vite/PWA no chat do cliente;
- Hono/Node no backend;
- Supabase Postgres/Auth/Storage;
- sessões anônimas com cookie HttpOnly;
- mensagens provider-neutral e idempotentes;
- streaming de resposta por SSE;
- uploads privados próprios de imagem e áudio;
- OpenAI entra atrás do backend nas fases de IA, sem controlar regras transacionais.

## Documentação oficial

- Especificação atual: `docs/superpowers/specs/2026-09-16-caneca-facil-own-chat-redesign.md`
- Roadmap atual: `docs/superpowers/plans/2026-09-16-caneca-facil-own-chat-roadmap.md`
- Fase A: `docs/superpowers/plans/2026-09-16-caneca-facil-phase-a-own-chat-foundation.md`

Planos anteriores centrados em WhatsApp/Meta são históricos e não são autoridade de implementação.
