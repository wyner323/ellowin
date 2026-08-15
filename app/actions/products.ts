"use server"

import { del } from "@vercel/blob"
import { and, asc, eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { product, productImage, productVariant, sellerApplication } from "@/lib/db/schema"
import { parseToCents } from "@/lib/money"
import { getUserId } from "@/lib/session"
import type { ActionResult } from "@/app/actions/auth"

const MAX_IMAGES = 5

/**
 * Só aceitamos URLs de imagem que vieram do nosso próprio Blob. Isso impede que
 * alguém injete uma URL externa arbitrária no anúncio pelo payload.
 */
function sanitizeImages(images: string[] | undefined): string[] {
  if (!Array.isArray(images)) return []
  const seen = new Set<string>()
  const clean: string[] = []

  for (const raw of images) {
    if (typeof raw !== "string" || seen.has(raw)) continue
    try {
      const url = new URL(raw)
      if (url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com")) {
        seen.add(raw)
        clean.push(raw)
      }
    } catch {
      // URL inválida: ignora.
    }
    if (clean.length >= MAX_IMAGES) break
  }

  return clean
}

/** Regrava as fotos do produto na ordem recebida (0 = capa). */
async function replaceProductImages(productId: number, images: string[]) {
  await db.delete(productImage).where(eq(productImage.productId, productId))
  if (images.length === 0) return
  await db.insert(productImage).values(
    images.map((url, i) => ({ productId, url, sortOrder: i })),
  )
}

/** Vendedor precisa ter concluído o cadastro (nível 4 / aprovado) para anunciar. */
async function requireSeller(userId: string) {
  const [s] = await db
    .select({ level: sellerApplication.level, status: sellerApplication.status })
    .from(sellerApplication)
    .where(eq(sellerApplication.userId, userId))
    .limit(1)

  if (!s || s.status !== "aprovado") return null
  return s
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
}

/** Garante slug único acrescentando um sufixo numérico quando necessário. */
async function uniqueSlug(base: string) {
  const root = base || "anuncio"
  let candidate = root
  let n = 1

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [existing] = await db
      .select({ id: product.id })
      .from(product)
      .where(eq(product.slug, candidate))
      .limit(1)

    if (!existing) return candidate
    n += 1
    candidate = `${root}-${n}`
  }
}

export type VariantInput = {
  label: string
  price: string
  stock: string
  deliveryNote?: string
}

function validateVariants(variants: VariantInput[]) {
  const parsed: {
    label: string
    priceCents: number
    stock: number
    deliveryNote: string | null
  }[] = []

  for (const [index, v] of variants.entries()) {
    const label = v.label.trim()
    if (label.length < 2) {
      return {
        error: `Dê um nome ao item ${index + 1} (ex.: "1.000 Robux").`,
        parsed: null,
      }
    }

    const priceCents = parseToCents(v.price)
    if (priceCents === null || priceCents < 100) {
      return { error: `O preço de "${label}" deve ser de no mínimo R$ 1,00.`, parsed: null }
    }

    const stock = Number.parseInt(v.stock, 10)
    if (!Number.isFinite(stock) || stock < 0) {
      return { error: `O estoque de "${label}" é inválido.`, parsed: null }
    }

    parsed.push({
      label,
      priceCents,
      stock,
      deliveryNote: v.deliveryNote?.trim() || null,
    })
  }

  if (parsed.length === 0) {
    return { error: "Cadastre pelo menos um item para venda.", parsed: null }
  }

  return { error: null, parsed }
}

export async function createProduct(input: {
  title: string
  categorySlug: string
  game: string
  description: string
  deliveryType: string
  deliveryTime: string
  images?: string[]
  variants: VariantInput[]
}): Promise<ActionResult & { slug?: string }> {
  const userId = await getUserId()

  if (!(await requireSeller(userId))) {
    return {
      ok: false,
      error: "Conclua o cadastro de vendedor antes de anunciar.",
    }
  }

  const title = input.title.trim()
  if (title.length < 8)
    return { ok: false, field: "title", error: "O título precisa ter ao menos 8 caracteres." }
  if (!input.categorySlug)
    return { ok: false, field: "categorySlug", error: "Escolha a categoria do anúncio." }
  if (input.description.trim().length < 20)
    return {
      ok: false,
      field: "description",
      error: "Descreva o que o comprador recebe com pelo menos 20 caracteres.",
    }

  const { error, parsed } = validateVariants(input.variants)
  if (error || !parsed) return { ok: false, field: "variants", error: error ?? undefined }

  const slug = await uniqueSlug(slugify(title))

  const [created] = await db
    .insert(product)
    .values({
      sellerId: userId,
      slug,
      title,
      categorySlug: input.categorySlug,
      game: input.game.trim() || null,
      description: input.description.trim(),
      deliveryType: input.deliveryType === "automatica" ? "automatica" : "manual",
      deliveryTime: input.deliveryTime.trim() || "até 24h",
    })
    .returning({ id: product.id })

  await db.insert(productVariant).values(
    parsed.map((v, i) => ({
      productId: created.id,
      label: v.label,
      priceCents: v.priceCents,
      stock: v.stock,
      deliveryNote: v.deliveryNote,
      sortOrder: i,
    })),
  )

  await replaceProductImages(created.id, sanitizeImages(input.images))

  revalidatePath("/painel/vendedor/produtos")
  revalidatePath("/")
  revalidatePath(`/catalogo/${input.categorySlug}`)

  return { ok: true, message: "Anúncio publicado.", slug }
}

export async function updateProduct(input: {
  productId: number
  title: string
  categorySlug: string
  game: string
  description: string
  deliveryType: string
  deliveryTime: string
  images?: string[]
  variants: (VariantInput & { id?: number })[]
}): Promise<ActionResult> {
  const userId = await getUserId()

  const [owned] = await db
    .select({ id: product.id, slug: product.slug })
    .from(product)
    .where(and(eq(product.id, input.productId), eq(product.sellerId, userId)))
    .limit(1)

  if (!owned) return { ok: false, error: "Anúncio não encontrado." }

  const title = input.title.trim()
  if (title.length < 8)
    return { ok: false, field: "title", error: "O título precisa ter ao menos 8 caracteres." }

  const { error, parsed } = validateVariants(input.variants)
  if (error || !parsed) return { ok: false, field: "variants", error: error ?? undefined }

  await db
    .update(product)
    .set({
      title,
      categorySlug: input.categorySlug,
      game: input.game.trim() || null,
      description: input.description.trim(),
      deliveryType: input.deliveryType === "automatica" ? "automatica" : "manual",
      deliveryTime: input.deliveryTime.trim() || "até 24h",
      updatedAt: new Date(),
    })
    .where(eq(product.id, owned.id))

  const keptIds: number[] = []

  for (const [i, v] of input.variants.entries()) {
    const data = parsed[i]

    if (v.id) {
      await db
        .update(productVariant)
        .set({
          label: data.label,
          priceCents: data.priceCents,
          stock: data.stock,
          deliveryNote: data.deliveryNote,
          sortOrder: i,
          active: true,
        })
        .where(
          and(eq(productVariant.id, v.id), eq(productVariant.productId, owned.id)),
        )
      keptIds.push(v.id)
      continue
    }

    const [inserted] = await db
      .insert(productVariant)
      .values({
        productId: owned.id,
        label: data.label,
        priceCents: data.priceCents,
        stock: data.stock,
        deliveryNote: data.deliveryNote,
        sortOrder: i,
      })
      .returning({ id: productVariant.id })

    keptIds.push(inserted.id)
  }

  // Variantes removidas na edição são desativadas, não apagadas: pedidos
  // antigos precisam continuar apontando para elas.
  await db
    .update(productVariant)
    .set({ active: false })
    .where(
      and(
        eq(productVariant.productId, owned.id),
        keptIds.length
          ? sql`${productVariant.id} not in (${sql.join(
              keptIds.map((id) => sql`${id}`),
              sql`, `,
            )})`
          : sql`true`,
      ),
    )

  // Sincroniza as fotos: regrava na nova ordem e apaga do Blob as que saíram.
  const nextImages = sanitizeImages(input.images)
  const previous = await db
    .select({ url: productImage.url })
    .from(productImage)
    .where(eq(productImage.productId, owned.id))
    .orderBy(asc(productImage.sortOrder))

  await replaceProductImages(owned.id, nextImages)

  const removed = previous.map((p) => p.url).filter((url) => !nextImages.includes(url))
  if (removed.length) {
    // Falha ao apagar o arquivo não deve derrubar o salvamento do anúncio.
    try {
      await del(removed)
    } catch (error) {
      console.error("[v0] Falha ao remover imagens antigas do Blob:", error)
    }
  }

  revalidatePath("/painel/vendedor/produtos")
  revalidatePath(`/produtos/${owned.slug}`)
  revalidatePath("/")

  return { ok: true, message: "Anúncio atualizado." }
}

export async function toggleProductStatus(productId: number): Promise<ActionResult> {
  const userId = await getUserId()

  const [owned] = await db
    .select({ id: product.id, status: product.status, slug: product.slug })
    .from(product)
    .where(and(eq(product.id, productId), eq(product.sellerId, userId)))
    .limit(1)

  if (!owned) return { ok: false, error: "Anúncio não encontrado." }

  const next = owned.status === "ativo" ? "pausado" : "ativo"

  await db
    .update(product)
    .set({ status: next, updatedAt: new Date() })
    .where(eq(product.id, owned.id))

  revalidatePath("/painel/vendedor/produtos")
  revalidatePath(`/produtos/${owned.slug}`)

  return {
    ok: true,
    message: next === "ativo" ? "Anúncio reativado." : "Anúncio pausado.",
  }
}
