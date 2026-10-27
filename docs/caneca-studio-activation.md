# Ativação do Estúdio de Canecas

O site está no GitHub Pages em [Caneca Fácil](https://osvaldosereia.github.io/canecafacil/), e a automação de arte roda na Edge Function `caneca-studio` do projeto Supabase existente **Dona Antônia** (`ssbesxgaijknwsjbsbcz`). Nenhum projeto Railway ou novo projeto Supabase é usado.

## Acesso direto

O Estúdio abre sem cadastro, e-mail ou senha. Cada navegador cria um identificador aleatório para manter os trabalhos separados. A função valida esse identificador, aceita chamadas do domínio do GitHub Pages e limita a criação a cinco trabalhos por endereço IP em 24 horas.

Como o acesso é público, qualquer pessoa com o endereço do site pode abrir o formulário. A tabela de trabalhos não fica acessível diretamente pelo navegador: a função usa a credencial interna do Supabase, devolve URLs temporárias para imagens no bucket privado e nunca envia a chave OpenAI ao site.

## Automação

O briefing pode começar do zero ou usar uma imagem PNG, JPEG ou WebP de até 8 MB. A função cria a arte panorâmica, faz a revisão visual pelo Quality Gate, pode corrigir uma vez e prepara dois mockups. Os arquivos ficam no bucket privado `caneca-studio-assets`; a interface mostra links assinados temporários para visualização.

A função recupera a credencial OpenAI já salva no Vault do projeto por meio da RPC interna `get_conversation_worker_provider_secret_v1`. Os modelos padrão são `gpt-image-2.5-sunburst` para gerar e editar imagens e `gpt-6-astra` para revisar a arte. A chave nunca é gravada no repositório, no HTML ou no navegador.

## Publicação

O workflow **Deploy Caneca Fácil Studio** compila `apps/admin` no modo Pages e publica em:

`https://osvaldosereia.github.io/canecafacil/`

A origem de Pages deve permanecer **GitHub Actions**. As migrações e a função ficam versionadas em `supabase/`; não é necessário criar outro projeto. Gerações consomem a conta OpenAI já conectada e o armazenamento do projeto atual.
