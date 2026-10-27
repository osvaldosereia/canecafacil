# Ativação do Estúdio de Canecas

O código fica no repositório GitHub `osvaldosereia/canecafacil`. O front-end é publicado como site estático no GitHub Pages; a geração e o armazenamento das imagens ficam em uma Supabase Edge Function.

## Projeto Supabase reutilizado

O Estúdio usa o projeto já existente **Dona Antônia** (`ssbesxgaijknwsjbsbcz`). A integração OpenAI já está configurada no Vault desse projeto sob o nome `openai_conversation_worker_key_v1`. A função `caneca-studio` resolve a chave usando a RPC existente `get_conversation_worker_provider_secret_v1`, executada apenas com o papel interno `service_role`; essa RPC valida que a credencial esteja ativa. A chave não é copiada para o repositório nem enviada ao navegador.

O acesso usa a sessão Auth existente e valida que o usuário conste como ativo com papel `owner` na tabela `public.admin_users`. Não é preciso cadastrar outra chave, allowlist nem usuário.

A instalação acrescenta somente a tabela privada `public.caneca_studio_jobs`, uma policy restrita a `service_role`, o bucket privado `caneca-studio-assets` e a Edge Function `caneca-studio`. Nenhuma tabela, dado, função ou tela do site/administrador existentes é alterada.

## Publicação

No GitHub, abra **Settings → Pages** e escolha **GitHub Actions** como fonte de publicação. Depois, o workflow **Deploy Caneca Fácil Studio** publica em `https://osvaldosereia.github.io/canecafacil/`. Se uma execução anterior já falhou antes dessa configuração, execute novamente a execução em **Actions**.

## Geração e consumo

Cada briefing gera uma arte horizontal, faz uma revisão visual, permite no máximo uma correção e cria dois mockups da caneca. A geração usa a conta OpenAI já conectada ao projeto e pode consumir chamadas de API, armazenamento e tráfego, conforme os planos existentes. Nenhum projeto Supabase novo é criado.
