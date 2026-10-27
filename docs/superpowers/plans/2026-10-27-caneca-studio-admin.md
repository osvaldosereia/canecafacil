# Caneca Studio — ativação no GitHub

## Objetivo

Publicar a interface interna do Estúdio no GitHub Pages e mover o processamento para uma Supabase Edge Function no projeto Supabase existente Dona Antônia Staging.

## Arquitetura

- Site: GitHub Pages, build estático de `apps/admin` no modo `pages`.
- Autenticação: Supabase Auth; só e-mails em `STUDIO_ADMIN_EMAILS` podem chamar a função.
- Geração: Supabase Edge Function `caneca-studio`, OpenAI Images API para arte/mockups e Responses API para Quality Gate.
- Dados: tabela própria `public.caneca_studio_jobs`; bucket privado `caneca-studio-assets`; RLS bloqueia leitura direta do front-end.
- Execução: uma etapa por chamada para a função, com retomada do estado salvo; no máximo uma regeneração corretiva.

## Tarefas

- [x] Escolher Dona Antônia Staging depois de confirmar que estava vazio e saudável.
- [x] Preparar interface que publica apenas o Estúdio, sem carregar tabelas legadas de produção.
- [x] Preparar workflow de publicação GitHub Pages e base path do repositório.
- [x] Preparar migração isolada e Edge Function com geração e revisão visual.
- [x] Aplicar migrações e publicar função no projeto staging.
- [ ] Ativar Pages nas configurações do repositório (ação manual do proprietário).
- [ ] Inserir segredo OpenAI, allowlist de e-mails e usuário Auth no Supabase.
- [ ] Confirmar a primeira publicação e gerar a primeira amostra.

## Limites

- Nenhuma chave OpenAI ou chave Supabase privilegiada é gravada no repositório.
- Não reativar automações legadas no Make, Firebase, ou SUCEDOAN12.
- GitHub Pages deve ser habilitado pelo proprietário do repositório; a conexão usada para o trabalho não pode mudar essa configuração.
- Não rodar testes/build local nesta etapa. A publicação GitHub Actions só constrói o front-end.

## Modelo

`gpt-image-2.5-sunburst` gera/edita as imagens; `gpt-6-astra` revisa a arte. A geração pode custar por chamada OpenAI e consumir armazenamento/tráfego Supabase, embora não se crie outro projeto.
