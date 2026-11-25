# CapiNeca — landing page e personalizador empresarial

## Objetivo
Transformar o Site existente Canecas em uma landing page de vendas consultivas da CapiNeca para empresas, profissionais liberais, brindes e eventos. O cliente vê quatro exemplos fictícios, envia logo e informações, descreve como imagina a personalização, recebe quatro propostas visuais com frente e verso e solicita orçamento pelo WhatsApp. Não há checkout nem pagamento online.

## Marca e direção
Usar a logo CapiNeca existente e a paleta café #34221B, creme #F6EFDF e vermelho queimado #D83D2C. A página combina fotografia de produto, respiro editorial e grafismos retrô discretos. A capivara aparece como mascote de apoio, sem transformar a página em uma peça infantil. Não usar avaliações, contagens ou depoimentos inventados.

## Funil
Aplicar AIDA e PAS em sequência: chamar atenção com uma promessa para marca e evento; demonstrar usos e qualidade; apresentar preço e vantagens reais; conduzir para o personalizador e depois para o orçamento. Os CTAs principais levam à galeria ou ao formulário.

## Oferta confirmada
- R$ 19,90 por unidade.
- Pedido mínimo: 10 unidades; total mínimo: R$ 199,00.
- Entrega gratuita em Cuiabá e Várzea Grande.
- Até 3x sem juros no cartão.
- Não existe pagamento online.

## Personalizador
Campos: logo PNG/JPEG/WebP de até 8 MB; nome da empresa; telefone e site da empresa (ambos opcionais para impressão); descrição livre da personalização desejada (até 500 caracteres); segmento; finalidade; quantidade (mínimo 10); cidade de entrega e data do evento opcionais. O endereço do site informado é composto como texto exato no verso e o domínio também orienta a pesquisa pública da marca. Sem site, a análise usa os campos informados e pode pesquisar o setor.

O fluxo tem dois módulos: análise/pesquisa que devolve briefing e quatro direções distintas; geração de imagem que cria uma arte horizontal por direção. As direções cobrem (1) assinatura minimalista, (2) pattern delicado em tom claro, (3) acabamento lateral e (4) composição autoral para as duas faces. Todas mantêm a cerâmica, a alça e o interior brancos, com a maior parte da estampa também branca. A imagem gerada não contém logo nem texto. A interface compõe a logo original e os dados exatos: frente com marca/nome, verso com telefone/site quando informados. Cada conceito aparece como mockup frente e verso e permite salvar a prévia.

A vitrine pública apresenta quatro mockups de demonstração com marcas, nomes profissionais e contatos fictícios, identificados como exemplos. As artes usam a caneca branca real e exibem aplicação nos dois lados.

As logos enviadas e as propostas geradas para cada cliente ficam em bucket privado e em tabela separada no projeto Supabase Dona Antônia já existente. Links de imagem são temporários; trabalhos expiram e são apagados após 15 dias. O formulário explica a pesquisa do site e pede consentimento para usar os dados e a logo na prévia. As imagens públicas da marca e da vitrine são versionadas no GitHub; o conteúdo editável e os pedidos de orçamento ficam no D1 do Site.

## Contato e domínio
O número exclusivo de WhatsApp ainda não existe; o CTA fica preparado por configuração e não usa número fictício. Enquanto faltar o número, a página permite copiar a mensagem e informa que o canal está em configuração. O domínio www.capineca.com.br está sendo registrado; o Site mantém a URL atual da plataforma e a URL canônica passa para o domínio quando ele estiver ligado.

## Arquitetura
Reaproveitar o Site Canecas, seus arquivos e painel existentes. Criar a Edge Function capineca-b2b e as tabelas privadas no Supabase Dona Antônia existente. A pesquisa usa Responses API com web_search e gpt-6.2-sol com raciocínio baixo; as quatro artes usam o endpoint de imagens com gpt-image-2.5-flare em qualidade baixa. Cada geração avança uma etapa por chamada para evitar uma requisição longa. O serviço reutiliza o bucket privado caneca-studio-assets sem mudar a função caneca-studio existente.

O painel da landing em `/admin` gerencia quatro áreas: visão geral, caixa de orçamentos com status e observações, conteúdo da landing/vitrine e integrações. A imagem principal, os quatro exemplos corporativos, a oferta e o WhatsApp podem ser atualizados sem editar código. `/admin/legacy` preserva o painel anterior. Novas imagens públicas são enviadas ao GitHub por uma conexão fine-grained, enquanto os arquivos dos clientes seguem privados no fluxo de geração.

