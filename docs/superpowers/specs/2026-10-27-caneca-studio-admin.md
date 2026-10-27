# Caneca Studio no GitHub Pages

## Objetivo

Disponibilizar o Estúdio de Canecas da Caneca Fácil no GitHub, usando um projeto Supabase já existente e geração de imagem pela API da OpenAI. A ferramenta é interna, exige login, gera uma arte panorâmica e dois mockups privados e deixa tudo aguardando revisão humana.

## Experiência

- O GitHub Pages serve uma versão isolada do Admin, apenas com login e Estúdio; o Admin completo do repositório permanece disponível no código original.
- A equipe informa tema, título opcional, estilo, paleta, detalhes, textos obrigatórios e elementos a evitar.
- É possível anexar referência PNG, JPEG ou WebP de até 8 MB. Ela é guardada em bucket privado.
- A geração produz arte horizontal 2400×960, passa pelo Quality Gate visual e pode fazer uma correção. Depois são gerados dois mockups quadrados de 1024×1024.
- Cada etapa é invocada pela interface e retorna o estado do trabalho. O processo não depende de manter um servidor Hono ligado.
- Arte e mockups permanecem privados; a interface recebe URLs assinadas por 15 minutos.
- A ferramenta não publica produtos no catálogo.

## Arquitetura

- O front-end React/Vite é publicado pelo GitHub Pages em `https://osvaldosereia.github.io/canecafacil/`.
- O front usa apenas a URL do projeto Supabase, a chave publishable e uma sessão Auth; a chave da OpenAI nunca vai ao navegador.
- A função Supabase `caneca-studio` verifica o JWT, valida o e-mail contra `STUDIO_ADMIN_EMAILS`, controla cada etapa e chama OpenAI Images/Responses.
- O destino é o projeto existente Dona Antônia Staging (`crkssjkmdjkohadhcsnb`), escolhido por estar vazio. A migração cria somente `caneca_studio_jobs` e o bucket privado `caneca-studio-assets`; Uma policy RLS explícita permite somente service_role; anon/authenticated não têm acesso direto.
- A chave secreta OpenAI fica em `OPENAI_API_KEY` nos secrets do Supabase. Os modelos padrão são `gpt-image-2.5-sunburst` para imagem e `gpt-6-astra` para revisão.

## Segurança e custos

- E-mail de administrador é allowlist explícita em `STUDIO_ADMIN_EMAILS`; nenhuma decisão de autorização usa `user_metadata`.
- A tabela não é acessível diretamente por anon/authenticated. A função de servidor usa o service role interno e só devolve URLs temporárias.
- As imagens de referência também ficam no bucket privado.
- Não foi criado projeto Supabase novo. A geração OpenAI e o uso de armazenamento/tráfego ainda podem consumir os limites ou gerar cobrança dos planos já existentes.

## Dependências de ativação

- Habilitar GitHub Pages em **Settings → Pages → GitHub Actions**.
- Definir `OPENAI_API_KEY` e `STUDIO_ADMIN_EMAILS` em **Supabase → Edge Functions → Secrets**.
- Criar/convidar em **Authentication → Users** o usuário correspondente ao e-mail allowlisted.

## Referência histórica

A automação anterior já usava arte plana horizontal, dois mockups, saída WebP e um Quality Gate que comparava textos, briefing, bordas e problemas visuais. O código mantém o limite de uma única correção e continua sem usar o Make/Firebase/SUCEDOAN12.
