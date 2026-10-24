# Entrega automática de verdade — desenho

Estado (2026-10-24): **implementado, desligado em produção até o dono definir `DELIVERY_ENCRYPTION_KEY` e aplicar a migração 0011** (passos em `PENDENCIAS.md`). O documento abaixo é o desenho original; onde a implementação difere:
a coluna `mask` foi acrescentada à tabela, existe um CHECK ligando `payload` nulo a `orderId` preenchido, e o aviso por e-mail da compra automática é um só (já diz que foi entregue). Escrito em 2026-10-21 a partir do código atual (`app/actions/orders.ts`, `lib/secret-box.ts`, `lib/reconcile.ts`, `lib/delivery.ts`).

## 1. O problema de hoje

"Entrega automática" é só um rótulo. O vendedor marca `deliveryType = "automatica"` e o prazo vira `INSTANT_DELIVERY_TIME`, mas **nada entrega sozinho**: a compra cria o pedido em `aguardando_entrega` e o vendedor ainda registra a entrega à mão (`markDelivered`).

Pior: `hoursForDeliveryTime("Imediata (entrega automática)")` devolve `null`, então o pedido nasce com `deliveryDueAt = null` e a varredura `sweepDeliveryDeadline` **nunca o reembolsa por atraso**. Um anúncio "automático" que não entrega deixa o comprador esperando sem prazo e sem reembolso automático. Isso é um furo que existe agora, independente da feature nova, e o desenho abaixo o fecha (seção 7).

## 2. Objetivo

Um anúncio de entrega automática tem um **estoque de itens** (códigos, chaves ou logins) cadastrado pelo vendedor. A compra reserva um item e o entrega na mesma transação que move o dinheiro para a custódia. O comprador vê os dados na hora; o resto do fluxo (7 dias para conferir, confirmar, disputar, liberar) não muda.

## 3. Modelo de dados (migração 0011)

Tabela nova `delivery_stock_item`:

| coluna | tipo | observação |
|---|---|---|
| `id` | serial | |
| `variantId` | int → `product_variant` | de qual item do anúncio |
| `sellerId` | text → `user` | repetido para escopo e para as consultas do painel |
| `payload` | text, nulo | cifrado (`encryptField`, contexto `stock:<variantId>`); vira **nulo** quando vendido |
| `payloadHash` | text | HMAC-SHA256 do valor com a chave de entrega; `UNIQUE (variantId, payloadHash)` barra código repetido sem guardar nada legível |
| `orderId` | int → `order`, **único**, nulo | nulo = disponível; preenchido = vendido |
| `createdAt`, `soldAt` | timestamp | |

Sem coluna nova em `product` ou `order`. `product_variant.stock` continua existindo e passa a ser **derivado** nos anúncios automáticos: igual ao número de itens disponíveis (assim vitrine, filtros, "últimas unidades" e o alerta de estoque baixo continuam funcionando sem mudança).

## 4. Fluxo da compra (dentro do `purchase` atual)

Na mesma transação, depois de `moveToEscrow` e do `stock - 1`, só se `product.deliveryType = 'automatica'`:

1. `SELECT … FROM delivery_stock_item WHERE variantId = $1 AND orderId IS NULL ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`. A linha da variante já está travada (`FOR UPDATE OF v`), então duas compras do último item não pegam o mesmo código.
2. Sem item disponível, lança `PurchaseError("Item esgotado.")` e tudo desfaz, **mesmo que `stock` diga que há**. Vender sem ter o que entregar fica impossível por construção.
3. Decifra com o contexto `stock:<variantId>` e cifra de novo com `order:<id>` (é o contexto que `getOrderDetail` usa para ler). Grava em `order.deliveryPayload`, passa o pedido para `entregue` com `deliveredAt = agora` e `autoReleaseAt = agora + AUTO_RELEASE_DAYS`, e marca o item (`orderId`, `soldAt`, `payload = NULL`). O dado **muda de lugar, não é copiado**.
4. Depois do commit: `notifyOrder("order_created")` e `notifyOrder("order_delivered")` (e-mails sem dado de entrega, como hoje). A tela do pedido já mostra o conteúdo.

O que **não muda**: `confirmReceipt`, disputa, liberação automática em 7 dias, taxa, conciliação de dinheiro.

## 5. Segurança

- **Sem chave, sem estoque.** `DELIVERY_ENCRYPTION_KEY` precisa existir: cadastrar itens é recusado se faltar (o `secret-box` hoje cai para texto puro, o que é inaceitável para um estoque inteiro de códigos). Pré-requisito do dono, já na lista de pendências. Perder a chave = perder os códigos: guardar cópia fora do Vercel.
- **O vendedor não relê os códigos.** O painel mostra só a máscara (2 primeiros e 2 últimos caracteres) e a contagem. Para corrigir, apaga o item disponível e cadastra de novo. Staff também não vê item não vendido; o dado vendido segue a regra atual (staff só vê durante disputa aberta).
- **Item nunca volta ao estoque.** Disputa resolvida a favor do comprador reembolsa o dinheiro, mas o código já foi exibido e pode ter sido usado: fica marcado como vendido. O vendedor repõe cadastrando outro.
- **Tetos.** Até 500 itens por envio, 500 caracteres por item, 10.000 disponíveis por item do anúncio, 30 envios por hora por vendedor (`hitRateLimit`). Linhas vazias ignoradas, repetidas descartadas, erro aponta o número da linha.
- **Nada em log.** Os campos de código entram na lista de `scrubSensitiveData`; a ação nunca devolve o conteúdo enviado.
- **LGPD.** Ao anonimizar uma conta, os itens ainda disponíveis dela são apagados (segredo do vendedor, sem razão de retenção).
- **Categorias.** Só `gift-cards` e `contas` aceitam entrega automática. Moedas e boosting exigem interação (troca no jogo, serviço), então continuam manuais; o servidor valida como já faz com `categorySlug`.

## 6. Conciliação

Duas verificações novas em `lib/reconcile.ts` (hoje são 10):

1. Todo item com `orderId` aponta para um pedido que existe e não está em `aguardando_entrega`.
2. Para variantes de anúncio automático, `stock` = itens com `orderId IS NULL`. Divergência avisa (e-mail ao admin, como as demais).

A unicidade de `orderId` já impede dois itens no mesmo pedido.

## 7. Anúncios "automáticos" que já existem

Hoje eles são o furo da seção 1. Duas saídas, a escolher:

- **Recomendada:** a migração converte todo anúncio `automatica` existente para `manual` com prazo `Até 24 horas`. Passam a ter prazo real e reembolso automático por atraso. O vendedor pode voltar a "Automática" quando cadastrar itens.
- Deixar como está e só aplicar a regra nova a anúncios criados depois (mantém o furo para os antigos).

Antes de aplicar, rodo uma consulta só de leitura para dizer quantos são.

## 8. Interface do vendedor

- Formulário do anúncio: ao escolher "Automática", o campo de estoque some e aparece "O estoque é o número de itens cadastrados". Anúncio nasce com 0 e só vai à venda quando houver itens.
- Nova tela `/painel/vendedor/produtos/[id]/estoque`: por item do anúncio, contagem de disponíveis e vendidos; caixa de texto "um por linha"; lista mascarada dos disponíveis com botão de apagar. `updateProduct` passa a ignorar `stock` vindo do formulário nos anúncios automáticos.
- "Meus anúncios" e o alerta de estoque baixo já funcionam porque `stock` é derivado.

## 9. Etapas e esforço

0. **Dono:** `DELIVERY_ENCRYPTION_KEY` no Vercel e rodar `scripts/encrypt-delivery-payloads.mjs`; `pnpm db:migrate` (0009, 0010, depois 0011).
1. Tabela, `lib/delivery-stock.ts` (cadastro, remoção, leitura de linhas, máscara) e testes em PGlite. *Médio.*
2. Integração no `purchase`, conciliação, testes de concorrência lógica e de "não volta ao estoque". *A parte de risco: mexe em dinheiro.*
3. Tela de estoque e ajustes do formulário. *Médio.*
4. Conversão dos antigos, textos de ajuda e documentação. *Pequeno.*

Cada etapa sobe com CI verde e, nas que tocam dinheiro, verificação por mutação (quebrar a regra e ver o teste falhar): item não pode ser entregue duas vezes, compra sem item não pode passar, reembolso não pode devolver item ao estoque, chave ausente não pode aceitar cadastro.

## 10. Decisões do dono (respondidas em 2026-10-24)

1. **Categorias:** só `gift-cards` e `contas`.
2. **Anúncios automáticos antigos:** converter para manual com prazo "Até 24 horas" (parte da migração 0011).
3. **Vendedor novo:** **sem trava**: qualquer vendedor aprovado pode usar entrega automática. O risco de código falso em massa fica coberto só pela custódia de 7 dias e pela disputa; vale acompanhar a taxa de disputa dos vendedores automáticos e reavaliar uma trava depois.
4. **Janela de conferência:** 7 dias, igual à entrega manual.
5. **Limite do estoque:** 10.000 itens disponíveis por item do anúncio.

Pré-requisito que continua com o dono: `DELIVERY_ENCRYPTION_KEY` no Vercel (sem ela o cadastro de itens é recusado, então a funcionalidade nasce desligada em produção).

## 11. Fora do escopo desta versão

Entrega automática parcial dentro do mesmo anúncio (alguns itens automáticos, outros manuais), importação por CSV, reposição por API do vendedor, e-mail de aviso de estoque baixo.
