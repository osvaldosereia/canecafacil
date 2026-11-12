# Caneca 360 — Criação, edição e impressão

O estúdio do Caneca Fácil fica no GitHub Pages em [Caneca Fácil](https://osvaldosereia.github.io/canecafacil/). A automação reutiliza a Edge Function `caneca-studio`, a tabela `caneca_studio_jobs` e o bucket privado `caneca-studio-assets` do projeto Supabase existente **Dona Antônia** (`ssbesxgaijknwsjbsbcz`). Não criar outro projeto, tabela ou bucket.

## Acesso e segurança

O Caneca 360 abre sem login, e-mail ou senha. Cada navegador cria um UUID aleatório e só consegue listar e abrir os trabalhos vinculados a esse UUID. A função aceita chamadas da origem GitHub Pages, valida o UUID e aplica o limite de cinco ações de geração por endereço IP em 24 horas antes de ler a chave OpenAI. O gateway JWT fica desligado para permitir acesso anônimo; a chave OpenAI continua no segredo existente e nunca é enviada ao navegador.

## Fluxo de criação

O briefing pode começar do zero ou usar uma referência PNG, JPEG ou WebP de até 8 MB. A geração inicial cria uma arte panorâmica de 2400 × 960 px e revisa texto, composição e margens. Se o Quality Gate pedir uma correção objetiva, a função pode fazer uma correção automática. O operador pode pedir novos ajustes em linguagem natural; cada ajuste cria uma versão imutável e mantém as anteriores no histórico.

Os dois mockups são opcionais e só são gerados quando solicitados. Eles usam imagens adicionais da API OpenAI e servem como prévia de produto; a impressão usa a arte panorâmica aberta. As imagens ficam no bucket privado e a interface recebe URLs assinadas temporárias.

## Aprovação e impressão

O operador escolhe uma versão e aprova a quantidade antes de imprimir. A fila é interna ao Caneca 360: ela não confirma pagamento e não sincroniza pedidos da loja.

O perfil Epson L1250 usa papel de 106 × 247 mm, área de arte de 235 × 106 mm, rotação de 90° e espelhamento único no arquivo. A imagem usa ajuste proporcional para caber sem corte. Na janela do navegador, selecionar o papel personalizado e escala de 100%; manter o espelhamento desligado no driver. Cada cópia só entra na contagem após confirmação. Reimpressões exigem justificativa.

## Custos e publicação

O workflow **Deploy Caneca Fácil Studio** compila `apps/admin` para o modo Pages e publica em `https://osvaldosereia.github.io/canecafacil/`. O deploy da função existente é feito separadamente e não executa migrações.

O projeto Supabase atual já está no plano Pro; esta versão não cria nem contrata recursos adicionais. Chamadas de função, banco e Storage continuam usando as cotas desse projeto e podem contar como uso variável se excederem o que o plano inclui. Geração, edição, correção automática e mockups consomem créditos da API OpenAI. O limite é de cinco ações de geração por endereço IP em 24 horas; mockups podem gerar duas imagens em uma ação. Como o estúdio é público, esse limite não impede que alguém abra o site; ele limita os pedidos de geração.
