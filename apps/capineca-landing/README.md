# CapiNeca

Landing page de vendas consultivas para canecas personalizadas de empresas, profissionais e eventos.

## Oferta

- R$ 19,90 por unidade, com pedido mínimo de 10 canecas.
- Entrega grátis em Cuiabá e Várzea Grande.
- Cartão de crédito em até 3x sem juros.
- Sem checkout ou pagamento online; o fechamento acontece pelo WhatsApp.

## Personalizador empresarial

O cliente envia a logo original, informa a empresa, segmento, quantidade, telefone e site para impressão. A Edge Function `capineca-b2b` pesquisa o domínio público informado, define quatro direções visuais e gera quatro imagens de estampa. O navegador compõe a logo original e os textos exatos em mockups que mostram as duas faces da caneca.

As logos enviadas e as propostas geradas para cada cliente ficam temporariamente no bucket privado `caneca-studio-assets`, no projeto Supabase Dona Antônia existente. Esses trabalhos expiram em 15 dias; uma tarefa diária remove os arquivos e os registros expirados. O código da antiga função `caneca-studio` permanece separado.

## Admin da landing page

`/admin` é o painel da CapiNeca para acompanhar pedidos de orçamento, editar a imagem principal e as quatro peças da vitrine, ajustar os dados da oferta e configurar o WhatsApp. O painel de ecommerce anterior fica preservado em `/admin/legacy`.

As imagens públicas do site são enviadas ao GitHub em `apps/capineca-landing/public/uploads/`. O D1 guarda os textos, os endereços dessas imagens e os dados dos pedidos de orçamento. A landing page não usa Supabase Storage para as imagens públicas da marca. A conexão do GitHub usa um token fine-grained limitado ao repositório, criptografado no servidor; configure `CAPINECA_GITHUB_ENCRYPTION_KEY` como segredo de ambiente antes de conectar o token pelo painel.

O repositório contém exemplos de empresas e contatos fictícios. Imagens, logos e dados de clientes não são publicados no GitHub.

## Configuração

Copie `.env.example` para `.env.local` no ambiente de desenvolvimento. A página precisa de `SUPABASE_URL` e `SUPABASE_ANON_KEY` apenas para o fluxo privado de pesquisa e geração. O número de WhatsApp só deve ser preenchido depois que a linha exclusiva estiver pronta. Configure `NEXT_PUBLIC_SITE_URL` como `https://www.capineca.com.br` após concluir o registro e o DNS. Para publicar imagens pelo admin, configure a chave secreta de criptografia do GitHub no ambiente do Site e conecte no painel um token fine-grained com `Contents: Read and write` restrito ao repositório.

O segredo OpenAI é lido no Supabase pelo mesmo RPC de provedor já usado pelo projeto. Nenhum segredo de servidor é enviado ao navegador.

## Desenvolvimento

Requer Node.js 22.13 ou superior.

```bash
npm run install:ci
npm run dev
```

Gere o artefato de publicação com `npm run build`.

## Rotas comerciais

`POST /api/orders` e a antiga criação de personalizações retornam HTTP 410. Assim, o Site não inicia cobranças online nem cria pedidos pelo fluxo antigo. As páginas de modelos/categorias redirecionam para a nova landing. O painel de ecommerce anterior continua disponível em `/admin/legacy` para registros legados.
