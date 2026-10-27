# Ativação do Estúdio de Canecas

O código fica no repositório GitHub `osvaldosereia/canecafacil`. A edição do Estúdio usa GitHub Pages para o site e uma Supabase Edge Function para proteger a chave da OpenAI e gravar imagens privadas.

## Destino Supabase

Usar o projeto existente **Dona Antônia Staging** (`crkssjkmdjkohadhcsnb`). Ele foi conferido antes da instalação: estava ativo, sem tabelas de produto, sem migrações próprias, sem buckets e sem Edge Functions. Nenhum projeto novo foi criado e os projetos de produção não foram alterados.

A migração adiciona apenas `public.caneca_studio_jobs` com RLS e policy explícita para o papel interno service_role, sem acesso direto para anon/authenticated, e o bucket privado `caneca-studio-assets`. A Edge Function `caneca-studio` valida a sessão Supabase e compara o e-mail com `STUDIO_ADMIN_EMAILS`.

## O que falta configurar no painel

1. No Supabase, abra **Edge Functions → Secrets** e cadastre `OPENAI_API_KEY` e `STUDIO_ADMIN_EMAILS`. Para a segunda variável, use os e-mails autorizados separados por vírgula. Não coloque a chave OpenAI no GitHub nem no navegador.
2. Em **Authentication → Users**, crie ou convide o usuário com e-mail e senha que entrará no Estúdio. Esse e-mail precisa estar em `STUDIO_ADMIN_EMAILS`.
3. No GitHub, abra **Settings → Pages** e escolha **GitHub Actions** como fonte de publicação. O workflow do repositório constrói o Estúdio e o publica em `https://osvaldosereia.github.io/canecafacil/`.

A conexão GitHub disponível permite editar o repositório, mas não a configuração administrativa de Pages. Por isso, o primeiro passo de Pages depende do dono do repositório. Depois de habilitar, abra **Actions → Deploy Caneca Fácil Studio** e execute novamente se a primeira publicação já tiver falhado.

Cada geração pode fazer até quatro chamadas de imagem (arte inicial, no máximo uma correção e dois mockups), além da revisão visual. Reutilizar o projeto Supabase evita criar outro projeto, mas chamadas OpenAI e uso de armazenamento/tráfego podem gerar consumo conforme os planos existentes.
