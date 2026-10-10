/**
 * Texto de apoio das páginas `/jogos/[slug]` (o que conferir antes de comprar e
 * perguntas frequentes). Serve a quem compra e ao buscador, então cada jogo tem
 * texto próprio — o mesmo parágrafo repetido em dezenas de páginas não ajuda
 * ninguém.
 *
 * Regras de escrita (o teste em `lib/game-seo.test.ts` barra algumas):
 * - só o que o sistema faz hoje: pagamento retido até a confirmação, disputa com
 *   moderação, prazo de entrega do anúncio, perguntas públicas e chat do pedido.
 *   Nada de garantia em dias, "verificado", "24/7" ou prazo em minutos;
 * - nada que envelheça rápido do jogo em si (preços, patches, eventos);
 * - os números da Ellowin (dias de liberação automática etc.) vêm das constantes,
 *   no componente, nunca digitados aqui.
 */

export type GameSeoFaq = { id: string; question: string; answer: string }

export type GameSeo = {
  /** `<meta name="description">` da página do jogo (até ~160 caracteres). */
  metaDescription: string
  intro: string
  /** O que conferir no anúncio antes de comprar. */
  tips: string[]
  faq: GameSeoFaq[]
}

const DISPUTE_ANSWER =
  "Abra uma disputa pela página do pedido enquanto ele estiver aguardando entrega ou entregue. O valor continua retido até a decisão da moderação."

export const GAME_SEO: Record<string, GameSeo> = {
  valorant: {
    metaDescription:
      "Compre Valorant na Ellowin: anúncios com região, rank e skins informados, filtros por esses campos e pagamento retido até você confirmar o recebimento.",
    intro:
      "Esta página reúne os anúncios de Valorant da Ellowin. Nos anúncios de conta, o vendedor informa região, rank e a faixa de skins, e você pode filtrar por esses campos na lista acima.",
    tips: [
      "Confira a região da conta: ela define em quais servidores você vai jogar.",
      "Compare o rank e a quantidade de skins do anúncio com as fotos e, se tiver dúvida, pergunte ao vendedor na seção de perguntas do anúncio.",
      "Leia a procedência da conta: o anúncio informa se foi criada pelo vendedor e se ele mantém dados de recuperação.",
      "Ao receber os dados, confira a conta inteira antes de confirmar o recebimento.",
    ],
    faq: [
      {
        id: "rank",
        question: "Como sei o rank de uma conta de Valorant?",
        answer:
          "O vendedor escolhe o rank atual em uma lista fixa, de Ferro a Radiante, e ele aparece no anúncio. Se quiser provas, peça imagens na pergunta pública do anúncio antes de comprar.",
      },
      {
        id: "diferente",
        question: "E se a conta não for como o anúncio?",
        answer: DISPUTE_ANSWER,
      },
    ],
  },

  "counter-strike-2": {
    metaDescription:
      "Compre Counter-Strike 2 na Ellowin: contas com status Prime, patente e nível Faceit informados e pagamento retido até a confirmação do recebimento.",
    intro:
      "Aqui ficam os anúncios de Counter-Strike 2. Nas contas, o vendedor declara se tem Prime, a patente e o nível Faceit, e dá para filtrar por eles na lista acima.",
    tips: [
      "Veja se a conta tem Prime ou não: o status aparece como destaque no card e na página do anúncio.",
      "Confira a patente e o nível Faceit declarados e compare com as imagens que o vendedor mostrar.",
      "Leia a procedência da conta e a descrição para saber o que está incluído, como inventário e itens.",
      "Faça a conferência completa assim que receber os dados, antes de confirmar o recebimento.",
    ],
    faq: [
      {
        id: "prime",
        question: "A conta tem Prime?",
        answer:
          "O vendedor marca “Com Prime” ou “Sem Prime” no anúncio, e você pode usar o filtro de Status Prime desta página. Em caso de dúvida, pergunte ao vendedor antes de comprar.",
      },
      {
        id: "problema",
        question: "O que fazer se a conta chegar diferente do anunciado?",
        answer: DISPUTE_ANSWER,
      },
    ],
  },

  steam: {
    metaDescription:
      "Gift cards e produtos da Steam na Ellowin: região informada em cada anúncio e pagamento retido até você confirmar o recebimento.",
    intro:
      "Os anúncios da Steam na Ellowin incluem gift cards, e cada gift card informa a região a que pertence. Use o filtro de região acima para ver só os que servem para a sua conta.",
    tips: [
      "Escolha o gift card da região que corresponde à da sua conta Steam: o saldo é ligado a uma região e a uma moeda.",
      "Leia a descrição do anúncio para saber como o código é entregue e se há alguma condição de uso.",
      "Resgate o código logo depois de receber e só então confirme o recebimento.",
    ],
    faq: [
      {
        id: "regiao",
        question: "Gift card de outra região funciona na minha conta?",
        answer:
          "Gift cards são ligados a uma região e a uma moeda. Prefira o da mesma região da sua conta e confirme as regras da Steam para o seu caso antes de comprar.",
      },
      {
        id: "codigo",
        question: "O código não funcionou. E agora?",
        answer: DISPUTE_ANSWER,
      },
    ],
  },

  roblox: {
    metaDescription:
      "Compre Robux e contas de Roblox na Ellowin com pagamento retido até você confirmar o recebimento e disputa analisada pela moderação.",
    intro:
      "Esta página lista os anúncios de Roblox da Ellowin, como Robux e contas. A forma de entrega muda de anúncio para anúncio, então a descrição de cada um é a referência.",
    tips: [
      "Leia como o vendedor faz a entrega e o que ele precisa de você; isso varia entre anúncios.",
      "Combine tudo pelo chat do pedido, assim a conversa fica registrada caso precise de uma disputa.",
      "Veja o prazo de entrega do anúncio: se ele passar sem entrega, o valor volta para o seu saldo.",
    ],
    faq: [
      {
        id: "entrega",
        question: "Como recebo os Robux?",
        answer:
          "Depende do anúncio. O vendedor descreve a forma de entrega e acompanha você pelo chat do pedido. Confira a descrição e tire dúvidas na seção de perguntas antes de comprar.",
      },
      {
        id: "atraso",
        question: "E se o vendedor não entregar?",
        answer:
          "Se o prazo do anúncio passar sem entrega, o pedido é cancelado e o valor volta ao seu saldo automaticamente.",
      },
    ],
  },

  "league-of-legends": {
    metaDescription:
      "Anúncios de League of Legends na Ellowin: contas, serviços e itens com pagamento retido até você confirmar o recebimento.",
    intro:
      "Aqui estão os anúncios de League of Legends da Ellowin. Em contas, olhe o servidor, o elo e a quantidade de campeões e skins descritos pelo vendedor.",
    tips: [
      "Confirme o servidor da conta no anúncio antes de comprar.",
      "Peça ao vendedor prints do elo, dos campeões e das skins pela pergunta pública do anúncio.",
      "Em serviços como elojob e coaching, leia a descrição para saber como o serviço é feito e o prazo prometido.",
      "Depois de receber, confira tudo antes de confirmar o recebimento.",
    ],
    faq: [
      {
        id: "servico",
        question: "Como funciona a compra de um serviço, como elojob?",
        answer:
          "É uma compra como as demais: o valor fica retido, o vendedor realiza o serviço dentro do prazo do anúncio e você confirma o recebimento quando estiver satisfeito.",
      },
      {
        id: "problema",
        question: "O serviço não foi como combinado. O que faço?",
        answer: DISPUTE_ANSWER,
      },
    ],
  },

  "free-fire": {
    metaDescription:
      "Compre Free Fire na Ellowin: contas e itens de vendedores com nível visível e pagamento retido até você confirmar o recebimento.",
    intro:
      "Esta página mostra os anúncios de Free Fire disponíveis na Ellowin. Compare o nível e as vendas do vendedor, que aparecem em cada card.",
    tips: [
      "Veja o nível e a quantidade de vendas do vendedor no card do anúncio.",
      "Leia a descrição para saber exatamente o que vem na conta ou no item.",
      "Tire dúvidas na seção de perguntas do anúncio antes de comprar.",
    ],
    faq: [
      {
        id: "nivel",
        question: "O que significa o nível do vendedor?",
        answer:
          "É o nível do cadastro de vendedor na Ellowin: ele cresce conforme o vendedor conclui as etapas do cadastro (e-mail, telefone, documento e dados de saque).",
      },
      {
        id: "problema",
        question: "O item não chegou ou veio errado. E agora?",
        answer: DISPUTE_ANSWER,
      },
    ],
  },

  fortnite: {
    metaDescription:
      "Anúncios de Fortnite na Ellowin: contas e itens com pagamento retido até você confirmar o recebimento e disputa com moderação.",
    intro:
      "Aqui você encontra os anúncios de Fortnite da Ellowin. Como a entrega varia entre contas e itens, confira sempre a descrição do que está incluído.",
    tips: [
      "Em contas, veja o que está incluído (skins, itens, plataformas vinculadas) na descrição e nas imagens.",
      "Confira a procedência da conta indicada no anúncio.",
      "Combine a entrega pelo chat do pedido e confirme o recebimento só depois de conferir tudo.",
    ],
    faq: [
      {
        id: "incluido",
        question: "Como sei o que a conta de Fortnite inclui?",
        answer:
          "Pela descrição do anúncio e pelas imagens do vendedor. Se algo não estiver claro, pergunte na seção de perguntas antes de comprar.",
      },
      {
        id: "diferente",
        question: "A conta veio diferente do anúncio. O que faço?",
        answer: DISPUTE_ANSWER,
      },
    ],
  },

  "genshin-impact": {
    metaDescription:
      "Compre Genshin Impact na Ellowin: contas e itens com pagamento retido até você confirmar o recebimento e disputa analisada pela moderação.",
    intro:
      "Esta página reúne os anúncios de Genshin Impact da Ellowin. Em contas, confira o servidor e o que está incluído, como personagens e armas.",
    tips: [
      "Veja o servidor da conta no anúncio: ele não muda depois da compra.",
      "Compare os personagens e as armas descritos com as imagens enviadas pelo vendedor.",
      "Leia a procedência da conta e o que o vendedor mantém de dados de recuperação.",
      "Confira a conta inteira antes de confirmar o recebimento.",
    ],
    faq: [
      {
        id: "servidor",
        question: "Posso trocar o servidor da conta depois de comprar?",
        answer:
          "Em geral não, por isso confira o servidor no anúncio antes. Se não estiver informado, pergunte ao vendedor na seção de perguntas.",
      },
      {
        id: "problema",
        question: "O que fazer se a conta não corresponder ao anúncio?",
        answer: DISPUTE_ANSWER,
      },
    ],
  },

  minecraft: {
    metaDescription:
      "Anúncios de Minecraft na Ellowin: contas e itens com pagamento retido até você confirmar o recebimento e disputa com moderação.",
    intro:
      "Aqui estão os anúncios de Minecraft da Ellowin. Confira no anúncio a qual edição ele se refere, porque Java e Bedrock são produtos diferentes.",
    tips: [
      "Veja a edição do jogo (Java ou Bedrock) na descrição antes de comprar.",
      "Leia o que está incluído e como o vendedor faz a entrega.",
      "Pergunte ao vendedor qualquer detalhe pela seção de perguntas do anúncio.",
    ],
    faq: [
      {
        id: "edicao",
        question: "Como sei se o anúncio é de Minecraft Java ou Bedrock?",
        answer:
          "A edição deve estar na descrição do anúncio. Se não estiver, pergunte ao vendedor na seção de perguntas antes de comprar.",
      },
      {
        id: "problema",
        question: "Recebi algo diferente do anunciado. E agora?",
        answer: DISPUTE_ANSWER,
      },
    ],
  },

  "call-of-duty": {
    metaDescription:
      "Compre Call of Duty na Ellowin: contas e itens com pagamento retido até você confirmar o recebimento e disputa analisada pela moderação.",
    intro:
      "Esta página lista os anúncios de Call of Duty da Ellowin. Como existem versões diferentes do jogo, confirme no anúncio a qual delas ele se refere.",
    tips: [
      "Confirme a versão e a plataforma da conta ou do item na descrição.",
      "Compare o conteúdo descrito com as imagens do vendedor.",
      "Cheque o prazo de entrega do anúncio e acompanhe pelo chat do pedido.",
    ],
    faq: [
      {
        id: "versao",
        question: "Como sei a que versão de Call of Duty o anúncio se refere?",
        answer:
          "Pela descrição e pelo título do anúncio. Havendo dúvida, pergunte ao vendedor na seção de perguntas antes de comprar.",
      },
      {
        id: "problema",
        question: "O que faço se o item não chegar?",
        answer:
          "Se o prazo de entrega do anúncio passar, o valor volta ao seu saldo automaticamente. Se chegar algo diferente do combinado, abra uma disputa pela página do pedido.",
      },
    ],
  },
}

export function getGameSeo(slug: string): GameSeo | null {
  return GAME_SEO[slug] ?? null
}
