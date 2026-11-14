# Pesquisa: como GGMAX e Eldorado vendem contas, itens e gift cards (e o que a Ellowin pode adotar)

Pesquisa de 2026-11-14. Objetivo do dono: (1) mais opções de venda para os vendedores escolherem; (2) entender como essas plataformas
garantem a veracidade de gift cards e como trazer isso para a Ellowin.

## Como ler este documento (limites da pesquisa)

- **Eldorado: fonte oficial lida direto.** Central de ajuda (`support.eldorado.gg`), artigos atualizados em outubro de 2026. Confiança alta.
- **GGMAX: só por indireto.** `ggmax.com.br` responde 403 (desafio do Cloudflare) para leitura automática, inclusive no navegador do app; **não contornei
  a proteção**. O que consta abaixo vem de resumos dos buscadores sobre as páginas oficiais (Taxas e prazos, Termos, Política de reembolso, blog) e de
  anúncios de vendedores. Algumas páginas são antigas (a FAQ tem ~1.300 dias; o artigo de anúncios dinâmicos ~766 dias). Confiança média: confirmar
  no site antes de copiar qualquer número.
- Nenhuma das duas plataformas publica um mecanismo de "checar o código do gift card na emissora". Isso é uma conclusão da leitura das regras, não
  uma garantia de que não exista algo interno.

---

## 1. O que cada plataforma deixa o vendedor vender

| Formato | Eldorado (oficial) | GGMAX (indireto) | Ellowin hoje |
|---|---|---|---|
| Contas | Sim, só acesso total (e-mail + senha da conta), vendedor verificado; várias contas idênticas num anúncio só ("Add more accounts"); até 5 imagens | Sim, inclusive contas **offline/compartilhadas** de Steam e PlayStation; garantia de 7/30 dias definida pelo vendedor no texto | Sim (`contas`), com procedência declarada e entrega manual ou por estoque |
| Moeda de jogo | Sim, qualquer vendedor verificado; vendedor cobre taxas do jogo (ex.: 5% de transferência do EA FC) | Sim (moedas, gold) | Sim (`moedas`) |
| Itens | Sim, conteúdo fixo e descrito (nome, quantidade, jogo, servidor); **proíbe item aleatório/caixa** e arquivos | Sim | Misturado em `moedas` (tipo "Moeda/Itens"), sem regras próprias |
| Boosting / serviços | Sim; regras de prova (prints de progresso), proíbe cheat sem o comprador pedir; **pedidos de boost** (o comprador publica, vendedores respondem) | Sim (powerlevel, serviços) | Sim (`boosting`) |
| Gift cards | Sim, **só vendedor aprovado**, 0% de comissão, até 4 códigos por pedido, só código/chave/link (nunca imagem) | Sim (Steam, Google Play, Xbox, Apple, Uber, Roblox...) | Sim (`gift-cards`), com estoque cifrado e entrega automática |
| Top-ups (recarga por ID) e assinaturas | Sim, **categoria restrita: 250 vendas e 98% de avaliação**, 0% de comissão padrão | "Assinaturas e Premium" | **Não existe** |
| Redes sociais, cursos, softwares, keys | Não | Sim ("Redes Sociais", "Cursos e Treinamentos", "Códigos e Keys", contas Mega) | Não |

Recursos de venda que eles têm e a Ellowin não:

- **Oferta personalizada** (Eldorado): o vendedor cria uma oferta sob medida para um comprador e manda o link.
- **Pedido de serviço** (Eldorado, boosting): o comprador descreve e vendedores se oferecem.
- **Mensagem automática ao comprador** (GGMAX, plano Max): texto do vendedor enviado ao chat assim que a venda é aprovada (instruções de resgate etc.).
- **Estoque automático e anúncio dinâmico** (GGMAX): a Ellowin já tem os dois (estoque cifrado e itens do anúncio).
- **Taxa por categoria** (Eldorado): gift card e top-up 0%, moeda 5%, contas/itens/boosting 10%, com exceções por jogo (contas de GTA 30%, Roblox 15%).
  GGMAX: planos Prata 9,99% / Ouro 11,99% / Diamante 12,99%, mais promoções por categoria e o Plano Max (+2,99% por anúncio: estoque automático, saque
  acelerado, pontos, mensagem automática). A Ellowin cobra 8% fixo (`PLATFORM_FEE_BPS`).
- **Vendedor estabelecido** (Eldorado): 200 pedidos + US$ 3.000 + cancelamento ≤ 15% em 180 dias dispensam a retenção extra.
- **Tempo de resposta inicial** (Eldorado): pedido com prazo de 1 h ou mais exige mensagem do vendedor em 30 minutos, senão pode ser cancelado.
- **Dados do comprador no pedido** (todas): ID do jogo, região, apelido. Hoje a Ellowin só tem o chat.

### Prazos de retenção do dinheiro

| | Eldorado | GGMAX | Ellowin |
|---|---|---|---|
| Gift cards | 3 dias para o comprador conferir + **4 dias** depois de "recebido" | não achei o prazo de gift card; a tabela geral diz 4 dias para moedas/itens | 7 dias contados da entrega (`AUTO_RELEASE_DAYS`) |
| Contas | 3 + **5 dias** (10 a 14 em jogos visados: GTA 5, Fortnite, R6) | **7 dias** (4 se o e-mail não está verificado; 21 em Clash of Clans/Brawl Stars) | 7 dias da entrega |
| Metade do prazo | — | se o comprador confirma e avalia positivo | a confirmação libera na hora |

Na prática a Ellowin já retém tanto quanto a Eldorado nos gift cards. O ponto frágil é outro: fraude com cartão roubado aparece depois de semanas (ver 3).

---

## 2. Como cada uma trata a veracidade do gift card

### Eldorado (regras oficiais de gift card)

1. **Quem vende:** só vendedor **aprovado** (além do documento + selfie obrigatórios para qualquer vendedor).
2. **O que vale como entrega:** código, chave de ativação ou link de resgate. **Proíbe** print de cartão, imagem, cartão físico e qualquer formato que não seja código ou link.
3. **Valor inteiro:** o comprador recebe o valor anunciado em um código ou em até **4 códigos** (US$ 100 = 4 × US$ 25).
4. **Região igual à pedida:** proíbe entregar cartão de outra região, mesmo de valor "equivalente".
5. **Prova de resgate:** se pedido, o vendedor confere o cartão num verificador de saldo ou **fala com a emissora** para confirmar o resgate.
6. **Prazo de reclamação:** resolver em **120 h (5 dias)**.
7. **Origem:** "só cartões genuínos, legítimos e obtidos legalmente"; cartão de origem ilegal, roubada ou restrita = **suspensão permanente**.
8. **Dinheiro:** retido 4 dias após o recebimento; a proteção de pagamento (TradeShield) cobre fraude de pagamento e disputa no meio de pagamento.

Ou seja: a Eldorado **não valida o código sozinha**. Ela filtra quem vende (aprovação, documento), limita o formato, manda o vendedor provar se houver
problema, segura o dinheiro e pune pesado quem entrega código ruim.

### GGMAX (indireto)

- Não encontrei regra pública de verificação de gift card nem selo de "código verificado".
- Entrega: o código vai pelo chat do pedido logo após o pagamento (entrega automática quando o vendedor usa o estoque automático).
- Quem fixa a garantia é o vendedor no texto do anúncio: é comum "sem reembolso depois que o código for entregue", prazo de 7 dias para resgatar (um vendedor de Roblox) ou 1 ano (um vendedor de Apple).
  Isso protege o vendedor, não o comprador, e é o oposto do modelo da Ellowin (proteção da plataforma, disputa com moderação).
- Reputação: no Reclame Aqui a GGMAX aparece como "Não recomendada", com reclamações de retenção de saldo e banimento sem solução. Não achei reclamação específica de
  "código já resgatado" na GGMAX, mas o mesmo problema aparece em lojas concorrentes de gift card (Gift Card Pro: Apple "já resgatado" na primeira tentativa; Fast Cards: código inválido).

### Eneba / G2A / Kinguin (para comparar)

- Só entram comerciantes que compram de **distribuidores autorizados**; a plataforma pode pedir **comprovante de compra** do estoque.
- Reembolso em 14 dias se a chave ainda não foi exibida, é inválida ou já foi usada (prova: print do erro de ativação).

### O que a indústria de antifraude recomenda (fornecedores, então com cautela)

- O golpe típico: comprar gift card com cartão roubado e revender barato; o estorno chega depois e a emissora já não consegue anular o código.
- Contramedidas citadas: hash de cada código com alerta de uso duplicado, limite de taxa em consulta de saldo, detecção de compras de alto valor em sequência, e **camadas**
  de controle em vez de um único teste.

### Conclusão sobre "verificar o código"

Para Steam, Google Play, Apple, Xbox e PlayStation **não existe, de forma pública, uma consulta que diga se o código é válido sem resgatá-lo**.
Só um distribuidor autorizado (via API B2B) ou o próprio resgate prova a validade. Por isso os marketplaces trabalham em quatro frentes:
**quem vende** (identidade, aprovação), **de onde vem o estoque** (declaração e comprovante), **o que acontece se falhar** (retenção + disputa + punição) e **sinais de abuso**
(código repetido, falhas por vendedor, volume atípico). É isso que dá para construir na Ellowin sem depender de terceiros.

---

## 3. Proposta para a Ellowin: sistema de confiança para gift cards

O que já existe e continua valendo (CLAUDE.md, "Automatic delivery"): código cifrado e nunca em e-mail; `payloadHash` (HMAC) que **recusa o mesmo código duas vezes, mesmo depois de vendido**;
só a máscara aparece no painel; entrega dentro da mesma transação do pagamento; dinheiro em custódia; disputa; sinalização de vendedor; limites de volume.

### Camada 1: estrutura (sem dependência externa, ~baixo esforço)

1. **Campos estruturados do gift card:** marca, região e valor de face (mesmo padrão de `lib/game-attributes.ts`). Habilita filtro de busca, "região do comprador", e as validações abaixo.
2. **Validação de formato por marca** ao colar o estoque (Steam, Google Play, Xbox, Apple, PlayStation, Roblox, Netflix, Spotify...). Pega erro de digitação e lixo; **não prova que o código é verdadeiro**.
   Os padrões (tamanho, grupos, prefixos) precisam ser conferidos marca a marca antes de entrar no código; errar o padrão bloquearia estoque legítimo.
3. **Um item = o valor de face anunciado** (ou até 4 códigos somando o valor, como na Eldorado), para o comprador nunca receber menos do que o título diz.
4. **Declaração de origem do estoque** (comprado na loja oficial da marca / distribuidor autorizado / promoção ou brinde / outro), gravada no chat do pedido na compra, igual à procedência das contas (`originPurchaseNote`).
   É uma declaração do vendedor: o texto tem de dizer que a Ellowin não confere (regra de cópia do projeto).
5. **Só texto:** já é assim (sem imagem); manter e documentar.

### Camada 2: comportamento (o que mais protege o comprador)

6. **"Resgatei, funcionou" / "Não funcionou"** na página do pedido, com motivo (inválido, já usado, região errada, bloqueado). Os dois botões alimentam a disputa já existente e as estatísticas do vendedor.
   "Funcionou" pode antecipar a liberação (o comprador já confirma hoje; aqui o botão vem com a instrução de resgatar na hora).
7. **Lote de estoque:** cada envio de códigos recebe um `batchId`. Dois "não funcionou" no mesmo lote **colocam o resto do lote em quarentena** (para de vender) até a moderação olhar. Para o golpe do estoque ruim é a defesa mais eficaz, porque o lote inteiro costuma ter a mesma origem.
8. **Taxa de falha por vendedor** com freio automático (pausa dos anúncios de gift card acima de um limite, com mínimo de pedidos para não punir quem vendeu 2 cartões). Estende `lib/auto-delivery-monitor.ts` / `/admin/entrega-automatica`.
9. **Limite de volume para vendedor novo em gift card:** teto de pedidos ou valor por dia até N vendas concluídas (a Eldorado usa "vendedor estabelecido" para o mesmo fim).
10. **Quem entrega para a Ellowin vê o que o comprador viu:** a moderação lê o código só enquanto a disputa está aberta (regra que já existe).

### Camada 3: depende de decisão do dono ou de terceiros

11. **Comprovante de compra do estoque** (nota fiscal/fatura do distribuidor) enviado pelo vendedor acima de um volume; guardado em área privada, só moderação vê.
12. **Verificação real de identidade** (documento + selfie por um provedor de KYC) para liberar a categoria. **Hoje a Ellowin não verifica nada disso** (o KYC guarda só o nome do arquivo), então **nenhum texto pode dizer "vendedor verificado"**
    (testes de cópia em `lib/help-content.test.ts`, `lib/seo.test.ts`, `lib/catalog.test.ts` banem isso). Sem provedor, a categoria de gift card fica "qualquer vendedor aprovado + camadas 1 e 2".
13. **Retenção maior ou reserva para vendedor novo**, porque estorno de cartão roubado aparece depois de 7 dias. Faz sentido de verdade só com o **gateway de pagamento** (que é o que recebe o estorno); sem ele a carteira é simulada.
14. **Venda direta de distribuidor por API** (a Ellowin vende o cartão, a validade é do distribuidor): muda o negócio (estoque, fiscal, margem). Só para discutir depois.

### Ordem sugerida

1 → 6 → 7 → 8 → 4 → 9 (um bloco só, sem migração de risco; as migrações são aditivas e as telas toleram a tabela faltando, como nas outras levas) e deixar 11–14 para a decisão do dono.

---

## 4. Proposta: novas opções de venda para os vendedores

Ordenadas por valor para o vendedor ÷ esforço, com o risco principal:

| # | Opção | O que muda | Esforço | Risco |
|---|---|---|---|---|
| A | **Mensagem automática pós-venda** | campo no anúncio; vira mensagem de sistema no chat na compra (ex.: como resgatar o código) | baixo | não pode conter dado de entrega; mesma regra de cópia |
| B | **Dados do comprador no pedido** (ID do jogo, região, apelido) | campos exigidos no checkout por tipo de anúncio; mostrados só às partes | médio | dado pessoal: só às duas partes e à moderação em disputa |
| C | **Recarga por ID (top-up)** (diamantes, V-Bucks, Robux) | nova categoria/tipo; precisa de B; prova de entrega (print do saldo) | médio | fraude de cartão roubado na recarga; a Eldorado restringe a 250 vendas + 98%: usar porta parecida |
| D | **Assinaturas e premium** (Spotify, Netflix, Discord, ChatGPT) | categoria nova, entrega por código/conta; "12 meses = 1 código" | médio | contas compartilhadas e plano família; exigir origem oficial |
| E | **Itens de jogo** como categoria própria | conteúdo fixo (nome, quantidade, jogo, servidor); proíbe aleatório | baixo | separar de `moedas` para regras e filtros próprios |
| F | **Oferta personalizada** (link para um comprador) | vendedor cria oferta privada a partir do chat | médio | preço combinado fora da plataforma: a oferta precisa nascer e pagar dentro dela |
| G | **Pedido de serviço** (boost) | comprador publica; vendedores propõem | alto | moderação de conteúdo e disputa de proposta |
| H | **Taxa por categoria** | `PLATFORM_FEE_BPS` vira função da categoria (ex.: menor em gift card) | baixo em código | **decisão comercial do dono**: a Eldorado cobra 0% em gift card e top-up; 8% fixo deixa a Ellowin cara nessa categoria |
| I | **Tempo de resposta inicial** como métrica pública | calcula do primeiro retorno do vendedor no chat | baixo | só mostrar com amostra mínima (regra de números reais) |
| J | **Vendedor estabelecido** (menos retenção) | critério por volume e cancelamento | médio | só depois do gateway |

**Não recomendo** copiar da GGMAX: contas **compartilhadas/offline** (a Eldorado proíbe: acesso não total, risco de ban e de "conta recuperada", que já é a reclamação nº 1 contra a GGMAX),
cláusula "sem reembolso" escrita pelo vendedor (anula a proteção da plataforma), redes sociais afiliadas e cursos (fora do foco, risco alto, retorno baixo).

---

## 5. Decisões que dependem do dono

1. Gift card: **qualquer vendedor aprovado** (como está) ou **aprovação própria** (volume mínimo, comprovante, ou KYC com provedor)?
2. Vai contratar um **provedor de KYC** (para poder dizer "vendedor verificado" com verdade)? Sem isso a camada 3 não sai.
3. **Taxa por categoria** (H): reduzir em gift card/top-up para competir com a Eldorado?
4. Entram **top-up (C)** e **assinaturas (D)** agora ou só depois do gateway e de mais vendas?
5. Ordem: primeiro o pacote de confiança de gift card (seção 3, camadas 1–2) ou as opções A + B + E (seção 4)?

## Fontes

Eldorado (oficial, outubro/2026):
[Start selling](https://support.eldorado.gg/en/articles/8409007-start-selling) ·
[Seller rules](https://support.eldorado.gg/en/articles/8408997-seller-rules) ·
[Gift card seller guidelines](https://support.eldorado.gg/en/articles/11703747-gift-card-seller-guidelines) ·
[Top up and subscription seller guidelines](https://support.eldorado.gg/en/articles/12032614-top-up-and-subscription-seller-guidelines) ·
[Item seller guidelines](https://support.eldorado.gg/en/articles/13859389-item-seller-guidelines) ·
[Currency seller guidelines](https://support.eldorado.gg/en/articles/13917846-currency-seller-guidelines) ·
[Boosting seller guidelines](https://support.eldorado.gg/en/articles/13917635-boosting-seller-guidelines) ·
[Account seller guidelines](https://support.eldorado.gg/en/articles/13859407-account-seller-guidelines) ·
[Sell an account](https://support.eldorado.gg/en/articles/8409002-sell-an-account) ·
[TradeShield protection for sellers](https://support.eldorado.gg/en/articles/8409006-tradeshield-protection-for-sellers) ·
[Seller fees](https://support.eldorado.gg/en/articles/8409025-seller-fees) ·
[Seller verification guide](https://support.eldorado.gg/en/articles/9896838-seller-verification-guide) ·
[Order dispute process](https://intercom.help/eldoradogg/en/articles/8409016-order-dispute-process)

GGMAX (indireto, via resumos de busca; o site bloqueia leitura automática):
[Taxas e prazos](https://ggmax.com.br/taxas-e-prazos) ·
[Termos de uso](https://ggmax.com.br/termos-de-uso) ·
[Política de reembolso](https://ggmax.com.br/politica-de-reembolso) ·
[Anúncios dinâmicos e estoque automático](https://ggmax.com.br/blog/anuncios-dinamicos-e-estoque-automatico-como-configurar-meu-anuncio) ·
[Torne-se vendedor](https://ggmax.com.br/torne-se-vendedor) ·
[Reclame Aqui: GGMAX](https://www.reclameaqui.com.br/empresa/ggmax/lista-reclamacoes/)

Outros:
[Eneba: revenda e distribuidores](https://www.eneba.com/support/article/can-buy-other-vendors-resell) ·
[Gift card fraud (Chargeflow)](https://www.chargeflow.io/blog/gift-card-fraud) ·
[Gift card fraud (Riskified)](https://www.riskified.com/learning/ecommerce-fraud/gift-card-fraud/) ·
[Gift card fraud (SEON)](https://seon.io/resources/gift-card-fraud/)
