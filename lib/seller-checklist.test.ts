import { describe, expect, it } from "vitest"
import { GOOD_LISTING_SCORE, NEW_SELLER_SALES, buildChecklist, type ChecklistInputs } from "@/lib/seller-checklist"

const base: ChecklistInputs = {
  emailVerified: false,
  profileComplete: false,
  activeListings: 0,
  listingsWithoutPhoto: 0,
  listingsBelowGood: 0,
  goalAvailable: true,
  hasGoal: false,
  completedSales: 0,
  pendingQuestions: 0,
  pendingReviews: 0,
}

const keys = (c: ReturnType<typeof buildChecklist>) => c.steps.map((s) => s.key)

describe("buildChecklist", () => {
  it("vendedor recém-aprovado: sem anúncio não há passo de foto nem de qualidade, e nada está feito", () => {
    const c = buildChecklist(base)
    expect(keys(c)).toEqual(["email", "listing", "profile", "goal", "sale"])
    expect(c.doneCount).toBe(0)
    expect(c.totalCount).toBe(5)
    expect(c.show).toBe(true)
  })

  it("com anúncio ativo entram os passos de foto e de nota, com a contagem do que falta", () => {
    const c = buildChecklist({ ...base, activeListings: 4, listingsWithoutPhoto: 2, listingsBelowGood: 1 })
    expect(keys(c)).toEqual(["email", "listing", "photos", "quality", "profile", "goal", "sale"])
    expect(c.steps.find((s) => s.key === "photos")).toMatchObject({ done: false, detail: "2 anúncios sem foto" })
    expect(c.steps.find((s) => s.key === "quality")).toMatchObject({ done: false, detail: "1 anúncio abaixo disso" })
    expect(c.steps.find((s) => s.key === "quality")?.label).toContain(String(GOOD_LISTING_SCORE))
    expect(c.steps.find((s) => s.key === "listing")?.done).toBe(true)
  })

  it("sem a tabela da meta (migração pendente) o passo da meta nem aparece", () => {
    expect(keys(buildChecklist({ ...base, goalAvailable: false }))).not.toContain("goal")
  })

  it("passos feitos contam no progresso", () => {
    const c = buildChecklist({ ...base, emailVerified: true, activeListings: 1, hasGoal: true })
    expect(c.steps.filter((s) => s.done).map((s) => s.key)).toEqual(["email", "listing", "photos", "quality", "goal"])
    expect(c.doneCount).toBe(5)
    expect(c.totalCount).toBe(7)
  })

  it("perguntas e avaliações sem resposta são 'pendências': só existem enquanto há o que responder e não entram no progresso", () => {
    const none = buildChecklist(base)
    expect(none.pending).toEqual([])
    const c = buildChecklist({ ...base, pendingQuestions: 1, pendingReviews: 3 })
    expect(c.pending.map((p) => [p.key, p.detail])).toEqual([["questions", "1 pergunta"], ["reviews", "3 avaliações sem resposta"]])
    expect(c.totalCount).toBe(none.totalCount)
  })

  it("some quando tudo está feito e não há pendência", () => {
    const done = buildChecklist({ ...base, emailVerified: true, profileComplete: true, activeListings: 2, hasGoal: true, completedSales: 1 })
    expect(done.steps.every((s) => s.done)).toBe(true)
    expect(done.show).toBe(false)
  })

  it("com tudo feito mas uma pergunta esperando, o cartão fica (só enquanto o vendedor é novo)", () => {
    const inputs = { ...base, emailVerified: true, profileComplete: true, activeListings: 2, hasGoal: true, completedSales: 1, pendingQuestions: 2 }
    expect(buildChecklist(inputs).show).toBe(true)
    expect(buildChecklist({ ...inputs, completedSales: NEW_SELLER_SALES }).show).toBe(false)
  })

  it("vendedor com muitas vendas não vê o cartão, mesmo com passos pendentes", () => {
    expect(buildChecklist({ ...base, completedSales: NEW_SELLER_SALES - 1 }).show).toBe(true)
    expect(buildChecklist({ ...base, completedSales: NEW_SELLER_SALES }).show).toBe(false)
  })

  it("cada passo pendente aponta para a tela certa", () => {
    const hrefs = Object.fromEntries(buildChecklist({ ...base, activeListings: 1 }).steps.map((s) => [s.key, s.href]))
    expect(hrefs).toMatchObject({
      email: "/verificar-email",
      listing: "/painel/vendedor/produtos/novo",
      photos: "/painel/vendedor/produtos",
      profile: "/conta",
    })
  })
})
