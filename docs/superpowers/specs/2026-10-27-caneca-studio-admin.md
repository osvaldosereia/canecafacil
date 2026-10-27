# Caneca Studio no Admin

## Objetivo

Restaurar no repositório oficial Caneca Fácil uma ferramenta interna para criar uma arte horizontal de caneca e dois mockups, sem depender dos arquivos, do Firebase, do GitHub ou do webhook do SUCEDOAN12.

## Experiência

- O Estúdio aparece como uma seção do Admin atual.
- A equipe informa tema, título opcional, estilo, paleta, detalhes, textos obrigatórios e elementos a evitar.
- A equipe pode anexar uma imagem de referência em PNG, JPEG ou WebP, limitada a 8 MB.
- O fluxo gera uma arte mestre horizontal de 2300×1000 e dois mockups quadrados, um para cada lado da caneca.
- O Admin acompanha o andamento e mostra links privados para visualizar os resultados.
- Cada geração cria um projeto interno com briefing, uma versão de arte e duas versões de mockup; não publica um produto automaticamente.

## Arquitetura

- O Admin envia a sessão Supabase do operador à API Hono.
- A API valida o token com Supabase Auth e confirma a associação em `admin_membership_lookup` antes de aceitar qualquer geração ou leitura.
- A chave OpenAI permanece no ambiente servidor; o navegador nunca recebe a chave.
- A API usa o modelo de imagem configurado no servidor e salva os arquivos nos buckets privados existentes `artwork-master` e `mockups`.
- A API registra briefing, arte e mockups nas tabelas existentes `briefings`, `art_versions` e `mockup_versions`, e atualiza `mug_projects`.
- A geração corre em segundo plano no processo da API; a interface consulta o estado do projeto pela própria API.
- O endpoint só aceita a origem exata configurada em `ADMIN_ORIGIN`.

## Estados e falhas

- Os estados usados são os já existentes: `generating_art`, `generating_mockup`, `needs_review` e `failed`.
- Falhas não removem arte já criada; o projeto permanece registrado e recebe estado `failed`.
- A API devolve URLs assinadas com validade limitada; nenhum bucket é tornado público.
- A aplicação não expõe detalhes internos ou credenciais em mensagens de erro.

## Fora do escopo

- Reativar ou reaproveitar o cenário Make legado, Firebase, ou branch `canecas-media`.
- Inserir automaticamente o resultado no catálogo público ou definir preço.
- Alterar a experiência de conversa do cliente ou o fluxo de checkout.

## Configuração de produção

- `OPENAI_API_KEY`: credencial privada do servidor.
- `ADMIN_ORIGIN`: origem exata do Admin publicado.
- `VITE_API_URL`: URL pública da API, sem a barra final.
- `SUPABASE_URL` e `SUPABASE_SECRET_KEY`: credenciais privadas já usadas pela API.

## Limites conhecidos

- A conclusão depende de uma chave OpenAI válida e de buckets privados/tabelas existentes no projeto Supabase de Caneca Fácil.
- A geração cria um projeto operacional e seus arquivos; cadastro de produto público continua fora do escopo.