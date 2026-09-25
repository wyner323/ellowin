import { parseToCents } from "@/lib/money"

/**
 * Regras de "anúncio pronto para publicar", espelhando o que
 * app/actions/products.ts exige no servidor (título ≥ 8, descrição ≥ 20,
 * procedência em contas, itens com nome, preço ≥ R$ 1 e estoque ≥ 0). Puro, para
 * a tela mostrar o que falta ANTES de enviar e para poder ser testado.
 */

export const MIN_TITLE = 8
export const MIN_DESCRIPTION = 20
export const MAX_TITLE = 100
export const MAX_DESCRIPTION = 4000

export type ListingDraft = {
  title: string
  categorySlug: string
  description: string
  accountOrigin: string
  rows: { label: string; price: string; stock: string }[]
}

export type ListingCheck = { key: string; label: string; ok: boolean; required: boolean }

export function isRowValid(row: { label: string; price: string; stock: string }) {
  const cents = parseToCents(row.price)
  const stock = Number.parseInt(row.stock, 10)
  return (
    row.label.trim().length >= 2 &&
    row.label.trim().length <= 80 &&
    cents !== null &&
    cents >= 100 &&
    cents <= 10_000_000 &&
    Number.isFinite(stock) &&
    stock >= 0 &&
    stock <= 100_000
  )
}

export function listingChecks(draft: ListingDraft, imageCount: number): ListingCheck[] {
  const checks: ListingCheck[] = [
    { key: "title", label: `Título com ao menos ${MIN_TITLE} caracteres`, ok: draft.title.trim().length >= MIN_TITLE, required: true },
    { key: "category", label: "Categoria escolhida", ok: Boolean(draft.categorySlug), required: true },
  ]

  if (draft.categorySlug === "contas") {
    checks.push({
      key: "origin",
      label: "Procedência da conta informada",
      ok: Boolean(draft.accountOrigin),
      required: true,
    })
  }

  checks.push(
    {
      key: "description",
      label: `Descrição com ao menos ${MIN_DESCRIPTION} caracteres`,
      ok: draft.description.trim().length >= MIN_DESCRIPTION,
      required: true,
    },
    {
      key: "items",
      label: "Todos os itens com nome, preço (mín. R$ 1,00) e estoque",
      ok: draft.rows.length > 0 && draft.rows.every(isRowValid),
      required: true,
    },
    { key: "photos", label: "Ao menos uma foto (recomendado)", ok: imageCount > 0, required: false },
  )

  return checks
}

export function isListingReady(checks: ListingCheck[]) {
  return checks.filter((c) => c.required).every((c) => c.ok)
}
