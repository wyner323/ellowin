/**
 * "Complete a sua loja": o passo a passo do vendedor novo, montado só com o que o sistema sabe (nada de promessa de
 * venda). Puro: a tela e os testes usam a mesma função. Os itens fixos contam para o progresso; os de "pendências"
 * (perguntas e avaliações sem resposta) só aparecem quando existem, para o progresso não inflar com o que ainda não houve.
 */

/** Com este número de vendas concluídas o vendedor deixa de ser "novo" e o cartão some. */
export const NEW_SELLER_SALES = 10
/** Nota de qualidade do anúncio (lib/listing-quality.ts) a partir da qual ele conta como "completo". */
export const GOOD_LISTING_SCORE = 80

export type ChecklistInputs = {
  emailVerified: boolean
  /** a loja tem foto e apresentação */
  profileComplete: boolean
  activeListings: number
  listingsWithoutPhoto: number
  /** anúncios ativos com nota de qualidade abaixo de GOOD_LISTING_SCORE */
  listingsBelowGood: number
  /** a tabela da meta existe (migração 0010); senão o item da meta nem aparece */
  goalAvailable: boolean
  hasGoal: boolean
  completedSales: number
  pendingQuestions: number
  pendingReviews: number
}

export type ChecklistItem = { key: string; label: string; done: boolean; detail?: string; href: string }

export type Checklist = {
  /** itens fixos, na ordem em que fazem sentido */
  steps: ChecklistItem[]
  /** pendências (só existem enquanto há algo a responder) */
  pending: ChecklistItem[]
  doneCount: number
  totalCount: number
  /** mostrar o cartão: vendedor novo e ainda há o que fazer */
  show: boolean
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function buildChecklist(i: ChecklistInputs): Checklist {
  const steps: ChecklistItem[] = [
    { key: "email", label: "Confirmar o seu e-mail", done: i.emailVerified, href: "/verificar-email" },
    { key: "listing", label: "Publicar o primeiro anúncio", done: i.activeListings > 0, href: "/painel/vendedor/produtos/novo" },
  ]

  if (i.activeListings > 0) {
    steps.push(
      {
        key: "photos",
        label: "Colocar foto em todos os anúncios",
        done: i.listingsWithoutPhoto === 0,
        detail: i.listingsWithoutPhoto > 0 ? plural(i.listingsWithoutPhoto, "anúncio sem foto", "anúncios sem foto") : undefined,
        href: "/painel/vendedor/produtos",
      },
      {
        key: "quality",
        label: `Deixar os anúncios completos (nota ${GOOD_LISTING_SCORE} ou mais)`,
        done: i.listingsBelowGood === 0,
        detail: i.listingsBelowGood > 0 ? plural(i.listingsBelowGood, "anúncio abaixo disso", "anúncios abaixo disso") : undefined,
        href: "/painel/vendedor/produtos",
      },
    )
  }

  steps.push({ key: "profile", label: "Completar o perfil da loja (foto e apresentação)", done: i.profileComplete, href: "/conta" })
  if (i.goalAvailable) steps.push({ key: "goal", label: "Definir a meta de receita do mês", done: i.hasGoal, href: "/painel/vendedor" })
  steps.push({ key: "sale", label: "Concluir a primeira venda", done: i.completedSales > 0, href: "/painel/vendedor/produtos" })

  const pending: ChecklistItem[] = []
  if (i.pendingQuestions > 0)
    pending.push({ key: "questions", label: "Responder as perguntas dos compradores", done: false, detail: plural(i.pendingQuestions, "pergunta", "perguntas"), href: "/painel/vendedor/perguntas" })
  if (i.pendingReviews > 0)
    pending.push({ key: "reviews", label: "Responder as avaliações recebidas", done: false, detail: plural(i.pendingReviews, "avaliação sem resposta", "avaliações sem resposta"), href: "/painel/vendedor/avaliacoes" })

  const doneCount = steps.filter((s) => s.done).length
  const stepsLeft = doneCount < steps.length
  return {
    steps,
    pending,
    doneCount,
    totalCount: steps.length,
    show: i.completedSales < NEW_SELLER_SALES && (stepsLeft || pending.length > 0),
  }
}
