import { AUTO_RELEASE_DAYS, PLATFORM_FEE_BPS } from "@/lib/money"
import { FIRST_CONTACT_HOURS, RESOLUTION_HOURS, SELLER_RESPONSE_HOURS } from "@/lib/sla"

/**
 * Conteúdo da central de ajuda (/ajuda).
 *
 * Cada resposta descreve o que o sistema faz hoje. Os números vêm das mesmas
 * constantes que o código usa (prazo de liberação, taxa, metas de disputa),
 * para a ajuda não divergir da regra quando ela mudar. Se uma regra mudar em
 * outro lugar sem constante, atualize a resposta correspondente aqui.
 */

export type HelpLink = { label: string; href: string }

export type HelpQuestion = {
  /** Âncora da pergunta (#id). Estável: não renomeie depois de publicado. */
  id: string
  question: string
  /** Um parágrafo por item. */
  answer: string[]
  links?: HelpLink[]
}

export type HelpTopic = {
  id: string
  title: string
  summary: string
  questions: HelpQuestion[]
}

const FEE_PERCENT = PLATFORM_FEE_BPS / 100

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "comeco",
    title: "Primeiros passos",
    summary: "O que a Ellowin é e o que você precisa para usar.",
    questions: [
      {
        id: "pagamento-real",
        question: "O saldo e os pagamentos são reais?",
        answer: [
          "Ainda não. A Ellowin está em fase de demonstração: o saldo que você adiciona é simulado e nenhuma cobrança real é feita. O pagamento intermediado, as disputas e os reembolsos seguem as regras descritas nesta página.",
        ],
        links: [{ label: "Termos e privacidade", href: "/termos" }],
      },
      {
        id: "o-que-preciso",
        question: "O que preciso para comprar ou vender?",
        answer: [
          "Uma conta com CPF válido e e-mail confirmado por código, e o perfil completo (nome, CPF, telefone e data de nascimento). Quem entra com o Google completa esses dados na primeira vez.",
          "Para vender, também é preciso concluir o cadastro de vendedor.",
        ],
        links: [{ label: "Criar conta", href: "/cadastro" }],
      },
      {
        id: "como-protege",
        question: "Como a Ellowin protege a minha compra?",
        answer: [
          "O valor que você paga fica retido pela Ellowin e o vendedor só recebe depois que você confirma o recebimento. Se algo der errado, você pode abrir uma disputa, que é analisada pela moderação. Se o vendedor não entregar no prazo do anúncio, o valor volta para o seu saldo automaticamente.",
        ],
      },
    ],
  },
  {
    id: "comprando",
    title: "Comprando",
    summary: "Do clique em comprar até a confirmação.",
    questions: [
      {
        id: "como-funciona-compra",
        question: "Como funciona uma compra?",
        answer: [
          "Você escolhe o item e confirma a compra. O valor sai do seu saldo e fica retido em custódia. O vendedor é avisado e faz a entrega pelo pedido. Você confere o que recebeu e confirma o recebimento; só então o valor é liberado ao vendedor.",
        ],
        links: [{ label: "Carteira", href: "/carteira" }],
      },
      {
        id: "dados-da-entrega",
        question: "Onde vejo os dados do que comprei?",
        answer: [
          "Na página do pedido, em Minhas compras. Os dados de entrega (login, senha, códigos) aparecem só para o comprador daquele pedido, dentro do site, e nunca são enviados por e-mail.",
        ],
        links: [{ label: "Minhas compras", href: "/pedidos" }],
      },
      {
        id: "prazo-de-entrega",
        question: "Quanto tempo o vendedor tem para entregar?",
        answer: [
          "O prazo está no anúncio e vai de 30 minutos a 72 horas, ou a entrega é automática. Se o prazo passar sem entrega, o pedido é cancelado e o valor volta ao seu saldo automaticamente.",
        ],
      },
      {
        id: "cancelar-pedido",
        question: "Posso cancelar um pedido?",
        answer: [
          "Sim, enquanto o pedido está aguardando entrega: o comprador ou o vendedor pode cancelar e o valor volta ao saldo do comprador. Depois que o vendedor registra a entrega, não dá mais para cancelar. Nesse caso, confirme o recebimento ou abra uma disputa.",
        ],
      },
      {
        id: "tempo-para-conferir",
        question: "Por quanto tempo posso conferir o produto?",
        answer: [
          `Você pode confirmar o recebimento ou abrir uma disputa enquanto o pedido estiver aguardando entrega ou entregue. Se você não fizer nenhum dos dois, o valor é liberado ao vendedor automaticamente ${AUTO_RELEASE_DAYS} dias após a compra. Por isso, confira o produto assim que receber.`,
        ],
      },
      {
        id: "desfazer-confirmacao",
        question: "Confirmei o recebimento. Posso desfazer?",
        answer: [
          "Não. A confirmação libera o pagamento ao vendedor na hora e não pode ser desfeita. Confirme só depois de conferir tudo.",
        ],
      },
    ],
  },
  {
    id: "disputas",
    title: "Disputas e denúncias",
    summary: "Quando algo não saiu como o combinado.",
    questions: [
      {
        id: "quando-abrir-disputa",
        question: "Quando devo abrir uma disputa?",
        answer: [
          "Quando o item não chegou, veio diferente do anúncio ou tem qualquer outro problema. Abra pela página do pedido, enquanto ele estiver aguardando entrega ou entregue. O valor continua retido até a decisão.",
        ],
        links: [{ label: "Minhas compras", href: "/pedidos" }],
      },
      {
        id: "como-resolve-disputa",
        question: "Como a disputa é resolvida?",
        answer: [
          "Comprador e vendedor conversam no chat da disputa e enviam provas. A moderação da Ellowin acompanha o caso: a meta é o primeiro contato em até " +
            `${FIRST_CONTACT_HOURS} horas úteis e a decisão em até ${RESOLUTION_HOURS} horas úteis. Ela decide entre reembolsar o comprador ou liberar o valor ao vendedor.`,
        ],
      },
      {
        id: "vendedor-nao-responde",
        question: "E se o vendedor não responder à disputa?",
        answer: [
          `Se o vendedor não responder em ${SELLER_RESPONSE_HOURS} horas úteis, o comprador é reembolsado automaticamente.`,
        ],
      },
      {
        id: "denunciar",
        question: "Posso denunciar um anúncio ou um usuário?",
        answer: [
          "Sim. Use o botão Denunciar na página do anúncio ou no perfil da loja. A denúncia não envolve dinheiro: ela é analisada pela moderação, que pode agir sobre o anúncio ou a conta. Para um problema com um pedido seu, use a disputa.",
        ],
      },
    ],
  },
  {
    id: "vendendo",
    title: "Vendendo",
    summary: "Cadastro, taxa, recebimento e saque.",
    questions: [
      {
        id: "virar-vendedor",
        question: "Como me torno vendedor?",
        answer: [
          "Em Seja vendedor, conclua as etapas do cadastro: loja, telefone, documento e chave Pix. O e-mail precisa estar confirmado. O nível do seu cadastro aparece em todos os seus anúncios.",
        ],
        links: [{ label: "Seja vendedor", href: "/vender" }],
      },
      {
        id: "taxa",
        question: "Qual é a taxa da Ellowin?",
        answer: [
          `${FEE_PERCENT}% sobre o valor de cada venda concluída, descontados no momento em que o valor é liberado. A taxa é a mesma para todos os vendedores.`,
        ],
      },
      {
        id: "quando-recebo",
        question: "Quando eu recebo o dinheiro de uma venda?",
        answer: [
          "Quando o comprador confirma o recebimento, quando acontece a liberação automática ou quando a moderação decide a seu favor em uma disputa. O valor cai no seu saldo disponível na carteira.",
        ],
      },
      {
        id: "sacar",
        question: "Como faço para sacar o meu saldo?",
        answer: [
          "Na Carteira, para a chave Pix cadastrada. É preciso ser vendedor aprovado e ter o e-mail confirmado. Se você trocar a chave Pix, os saques ficam bloqueados por 24 horas, por segurança.",
          "Hoje o saque é simulado: o saldo é debitado, mas nenhum Pix real é enviado.",
        ],
        links: [{ label: "Carteira", href: "/carteira" }],
      },
      {
        id: "procedencia-da-conta",
        question: "O que é a procedência da conta e o Selo de Certificação?",
        answer: [
          "Ao anunciar uma conta de jogo, o vendedor informa se é o criador da conta e se mantém dados de recuperação. Isso aparece no anúncio.",
          "Vendedores sem registro de conta recuperada ganham o Selo de Certificação. Qualquer pessoa pode consultar um vendedor no Verificador de contas.",
        ],
        links: [{ label: "Verificador de contas", href: "/verificador" }],
      },
    ],
  },
  {
    id: "conta",
    title: "Conta e segurança",
    summary: "Senha, golpes, exclusão e dados pessoais.",
    questions: [
      {
        id: "esqueci-senha",
        question: "Esqueci a minha senha.",
        answer: [
          "Na tela de entrada, use Esqueci minha senha. Enviamos por e-mail um link válido por 1 hora e de uso único. Ao redefinir a senha, todos os seus acessos abertos são encerrados.",
        ],
        links: [{ label: "Esqueci minha senha", href: "/esqueci-senha" }],
      },
      {
        id: "evitar-golpes",
        question: "Como evito golpes?",
        answer: [
          "Negocie só dentro da Ellowin: combinar pagamento fora da plataforma remove a proteção e viola os termos. Desconfie de qualquer pedido de senha ou de código de verificação. Os dados de entrega só aparecem no site, nunca por e-mail ou mensagem.",
        ],
      },
      {
        id: "excluir-conta",
        question: "Como excluo a minha conta?",
        answer: [
          "Em Minha conta, na seção de exclusão. Não pode haver pedido em andamento, anúncio ativo nem saldo na carteira. A conta é anonimizada: o perfil deixa de ser público e o login deixa de funcionar. Os dados que a lei exige (fiscais e de prevenção a fraude) são mantidos pelo prazo legal.",
        ],
        links: [{ label: "Minha conta", href: "/conta" }],
      },
      {
        id: "dados-pessoais",
        question: "Como meus dados pessoais são tratados?",
        answer: [
          "Seu nome legal e seu CPF não aparecem para outros usuários: o que é exibido é sempre o apelido que você escolhe. O texto completo está na seção de privacidade dos Termos.",
        ],
        links: [{ label: "Termos e privacidade", href: "/termos" }],
      },
    ],
  },
]
