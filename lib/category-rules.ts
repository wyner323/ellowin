/**
 * Regras por categoria, num lugar só (puro: tela, servidor e testes leem daqui). O que muda de uma categoria para outra:
 * se o vendedor precisa de aprovação da moderação, se aceita entrega automática (um código, chave ou login por venda), se
 * declara procedência (contas), se o comprador informa dados no pagamento (ID do jogador numa recarga) e as regras que o
 * vendedor aceita ao anunciar. Para criar uma categoria nova: entrada em `lib/catalog.ts` + entrada aqui.
 *
 * Os textos só descrevem o que o sistema faz ou exige. Nada de "verificado", "garantido" ou "validado": a Ellowin não
 * confere o conteúdo entregue (os testes de cópia vigiam isso).
 */

/** Tamanho da explicação que o vendedor escreve ao pedir aprovação numa categoria. */
export const MIN_STATEMENT = 20
export const MAX_STATEMENT = 600

export type BuyerField = {
  key: string
  label: string
  placeholder: string
  required: boolean
  maxLength: number
}

export type CategoryRule = {
  slug: string
  /** O vendedor precisa ser aprovado pela moderação NESTA categoria antes de anunciar (ver lib/category-approval.ts). */
  restricted: boolean
  /** Aceita entrega automática: cada venda entrega um item cadastrado (código, chave, link ou login). */
  autoDelivery: boolean
  /** O vendedor declara a procedência da conta (lib/account-origin.ts). */
  declaresOrigin: boolean
  /** Estoque automático novo passa pela análise da moderação antes de entrar à venda (ver lib/stock-review.ts). */
  stockReview: boolean
  /** Dados que o comprador informa ao pagar (o vendedor só os recebe junto com o pedido). */
  buyerFields: BuyerField[]
  /** Regras mostradas ao vendedor ao pedir aprovação e ao anunciar. */
  sellerRules: string[]
  /** O que o vendedor declara ao pedir aprovação (origem do estoque, experiência...). */
  approvalPrompt: string
}

const PLAYER_ID: BuyerField = {
  key: "playerId",
  label: "ID ou apelido no jogo",
  placeholder: "Como aparece no seu perfil do jogo",
  required: true,
  maxLength: 80,
}

const SERVER: BuyerField = {
  key: "server",
  label: "Servidor ou região",
  placeholder: "Ex.: Brasil, América do Sul",
  required: false,
  maxLength: 60,
}

const RULES: CategoryRule[] = [
  {
    slug: "contas",
    restricted: false,
    autoDelivery: true,
    declaresOrigin: true,
    stockReview: false,
    buyerFields: [],
    sellerRules: [
      "Entregue a conta com acesso total: login e senha da conta e, se houver, do e-mail ligado a ela.",
      "Descreva o que a conta tem de verdade (nível, itens, região, punições). Sem exageros nem faixas.",
      "Depois da venda, nunca entre na conta nem tente recuperá-la.",
    ],
    approvalPrompt: "",
  },
  {
    slug: "moedas",
    restricted: false,
    autoDelivery: false,
    declaresOrigin: false,
    stockReview: false,
    buyerFields: [PLAYER_ID, SERVER],
    sellerRules: [
      "Só ofereça moeda que você consegue entregar no prazo escolhido e que foi obtida pelas regras do jogo.",
      "Marque como entregue só depois de o comprador ter recebido o valor inteiro.",
      "Se entrar na conta do comprador para entregar, avise para ele trocar a senha em seguida.",
    ],
    approvalPrompt: "",
  },
  {
    slug: "itens",
    restricted: false,
    autoDelivery: false,
    declaresOrigin: false,
    stockReview: false,
    buyerFields: [PLAYER_ID, SERVER],
    sellerRules: [
      "Diga exatamente o que o comprador recebe: nome do item, quantidade, jogo e servidor. Sem faixas nem “talvez raro”.",
      "Não vendemos item aleatório, caixa de surpresa ou pacote de conteúdo indefinido.",
      "A entrega é dentro do jogo. Não envie arquivos, mods ou scripts.",
      "Marque como entregue só depois de o item estar com o comprador.",
    ],
    approvalPrompt: "",
  },
  {
    slug: "gift-cards",
    restricted: true,
    autoDelivery: true,
    declaresOrigin: false,
    stockReview: true,
    buyerFields: [],
    sellerRules: [
      "Entregue só código, chave ou link de resgate. Nunca imagem, print ou cartão físico.",
      "O valor e a região do cartão têm de ser os do anúncio. Cartão de outra região não vale como entrega.",
      "Só venda cartão que você obteve de forma legal e pode provar (loja oficial, distribuidor ou promoção sua).",
      "Se o comprador disser que o código não funciona, responda e resolva em até 5 dias.",
    ],
    approvalPrompt: "De onde vêm os cartões que você vai vender? (loja oficial, distribuidor, importação...)",
  },
  {
    slug: "recargas",
    restricted: true,
    autoDelivery: false,
    declaresOrigin: false,
    stockReview: false,
    buyerFields: [PLAYER_ID, SERVER],
    sellerRules: [
      "A recarga vem de um canal oficial do jogo ou da plataforma. Não vendemos recarga paga com cartão de terceiros.",
      "Recarregue só o ID que o comprador informou na compra e entregue o valor inteiro.",
      "Mande a prova no chat do pedido logo depois: print do saldo atualizado ou o recibo da recarga.",
      "Não peça para o comprador criar conta nova nem combinar pagamento fora da Ellowin.",
    ],
    approvalPrompt: "Como você faz as recargas? (canal oficial, loja de recarga, revendedor autorizado...)",
  },
  {
    slug: "assinaturas",
    restricted: true,
    autoDelivery: true,
    declaresOrigin: false,
    stockReview: true,
    buyerFields: [],
    sellerRules: [
      "Entregue a assinatura inteira: se o anúncio diz 12 meses, é um código, link ou conta com 12 meses, nunca vários curtos.",
      "Não venda período de teste como se fosse assinatura completa.",
      "Diga se a assinatura é em conta nova, na conta do comprador ou por código, e a região.",
      "A origem tem de ser oficial. Não vendemos assinatura paga com cartão de terceiros.",
    ],
    approvalPrompt: "De onde vêm as assinaturas que você vai vender? (compra oficial, plano próprio, revendedor autorizado...)",
  },
  {
    slug: "keys",
    restricted: true,
    autoDelivery: true,
    declaresOrigin: false,
    stockReview: true,
    buyerFields: [],
    sellerRules: [
      "A chave é de um distribuidor autorizado ou da própria loja do jogo. Informe a plataforma e a região no anúncio.",
      "Cada chave é entregue uma vez e nunca volta ao estoque depois de mostrada ao comprador.",
      "Não revenda chave de brinde, de bundle com revenda proibida ou comprada com cartão de terceiros.",
      "Se a chave falhar, resolva em até 5 dias com o comprador e a moderação.",
    ],
    approvalPrompt: "De onde vêm as chaves? (distribuidor autorizado, loja oficial, produtora...)",
  },
  {
    slug: "redes-sociais",
    restricted: true,
    autoDelivery: true,
    declaresOrigin: true,
    stockReview: false,
    buyerFields: [],
    sellerRules: [
      "Descreva o perfil sem exagero: plataforma, seguidores, ano de criação, conteúdo e punições.",
      "Entregue o acesso completo (login, senha e e-mail ligado) e declare a procedência. Depois da venda, nunca recupere o perfil.",
      "Perfil criado com robôs, comprado de terceiros sem direito de revenda ou obtido por invasão não pode ser vendido.",
      "Algumas redes proíbem a venda de contas nos próprios termos. O risco desse tipo de venda é de quem vende e de quem compra.",
    ],
    approvalPrompt: "Como você criou ou conseguiu os perfis que vai vender?",
  },
  {
    slug: "cursos",
    restricted: false,
    autoDelivery: true,
    declaresOrigin: false,
    stockReview: false,
    buyerFields: [],
    sellerRules: [
      "Venda só conteúdo seu ou com licença de revenda. Material pirateado ou copiado é removido e leva à suspensão do vendedor.",
      "Diga o que o comprador recebe (módulos, horas, formato) e como acessa: link, código ou arquivo na nuvem.",
      "Não prometa resultado financeiro nem ganho certo.",
    ],
    approvalPrompt: "",
  },
  {
    slug: "boosting",
    restricted: false,
    autoDelivery: false,
    declaresOrigin: false,
    stockReview: false,
    buyerFields: [{ ...PLAYER_ID, required: false }],
    sellerRules: [
      "Só aceite pedido que você consegue concluir no prazo. Cancelamentos em excesso são acompanhados pela moderação.",
      "Mande atualizações e prints do progresso no chat do pedido.",
      "Sem robôs, trapaça ou perder partida de propósito. Nunca guarde nem use o login do comprador para outra coisa.",
    ],
    approvalPrompt: "",
  },
]

const BY_SLUG = new Map(RULES.map((r) => [r.slug, r]))

const FALLBACK: CategoryRule = {
  slug: "",
  restricted: false,
  autoDelivery: false,
  declaresOrigin: false,
  stockReview: false,
  buyerFields: [],
  sellerRules: [],
  approvalPrompt: "",
}

export function categoryRule(slug: string): CategoryRule {
  return BY_SLUG.get(slug) ?? FALLBACK
}

export const CATEGORY_RULE_SLUGS = RULES.map((r) => r.slug)

/** Categorias que exigem aprovação do vendedor pela moderação. */
export const RESTRICTED_CATEGORY_SLUGS = RULES.filter((r) => r.restricted).map((r) => r.slug)

export function isRestrictedCategory(slug: string) {
  return categoryRule(slug).restricted
}

/** Texto único de um dado do comprador no formato guardado no pedido. */
export type BuyerInfo = Record<string, string>

/**
 * Valida e limpa o que o comprador digitou: só as chaves da categoria, com limite de tamanho, sem quebra de linha. Devolve o erro
 * do primeiro campo obrigatório vazio (o servidor nunca confia no que o navegador diz ser obrigatório).
 */
export function sanitizeBuyerInfo(
  categorySlug: string,
  input: Record<string, string> | undefined,
): { info: BuyerInfo; missing: BuyerField | null } {
  const fields = categoryRule(categorySlug).buyerFields
  const info: BuyerInfo = {}
  let missing: BuyerField | null = null
  for (const field of fields) {
    const raw = typeof input?.[field.key] === "string" ? input[field.key] : ""
    const value = raw.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, field.maxLength)
    if (value) info[field.key] = value
    else if (field.required && !missing) missing = field
  }
  return { info, missing }
}

/** "ID ou apelido no jogo: Fulano; Servidor ou região: Brasil" — para a mensagem de sistema do pedido e a tela. */
export function describeBuyerInfo(categorySlug: string, info: BuyerInfo): { label: string; value: string }[] {
  return categoryRule(categorySlug)
    .buyerFields.filter((f) => info[f.key])
    .map((f) => ({ label: f.label, value: info[f.key] }))
}
