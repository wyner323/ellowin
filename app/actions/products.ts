"use server"

import { del } from "@vercel/blob"
import { and, asc, eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { product, productImage, productVariant, sellerApplication } from "@/lib/db/schema"
import { isOwnBlobUrl } from "@/lib/blob-urls"
import { pingIndexNow } from "@/lib/indexnow"
import {
  DEFAULT_MANUAL_DELIVERY_TIME,
  INSTANT_DELIVERY_TIME,
  hoursForDeliveryTime,
} from "@/lib/delivery"
import { isValidAccountOrigin } from "@/lib/account-origin"
import { sanitizeAttributes } from "@/lib/game-attributes"
import { MAX_DESCRIPTION, MAX_TITLE } from "@/lib/listing-checks"
import { parseToCents } from "@/lib/money"
import { slugifyGame } from "@/lib/product-catalog"
import { getCategory } from "@/lib/catalog"
import { accountBlock, getUserId } from "@/lib/session"
import { allowsAutoDelivery } from "@/lib/delivery-stock-lines"
import { autoDeliveryAvailable, availableStockInProduct } from "@/lib/delivery-stock"
import type { ActionResult } from "@/app/actions/auth"

const AUTO_CATEGORY_ERROR = "A entrega automática só está disponível para gift cards e contas."
const AUTO_UNAVAILABLE_ERROR = "A entrega automática ainda não está disponível. Use a entrega manual por enquanto."

const MAX_IMAGES = 5

// Tetos de tamanho (espelhados em lib/listing-checks.ts e nos maxLength do
// formulário): sem eles um anúncio podia guardar textos e números absurdos.
const MAX_GAME = 80
const MAX_LABEL = 80
const MAX_NOTE = 200
const MAX_PRICE_CENTS = 10_000_000 // R$ 100.000,00 por item
const MAX_STOCK = 100_000

/**
 * Entrega automática é sempre instantânea — nunca confia no que o cliente
 * mandou pra esse par, recalcula sempre a partir do tipo de entrega.
 */
function normalizeDelivery(deliveryType: string, deliveryTime: string) {
  if (deliveryType === "automatica") {
    return { deliveryType: "automatica" as const, deliveryTime: INSTANT_DELIVERY_TIME }
  }
  return {
    deliveryType: "manual" as const,
    deliveryTime: deliveryTime.trim() || DEFAULT_MANUAL_DELIVERY_TIME,
  }
}

/**
 * Só a categoria "contas" declara procedência — pra qualquer outra o valor é
 * sempre limpo, mesmo que o cliente mande algo (nunca confia no client pra
 * essa decisão, mesmo motivo de normalizeDelivery acima).
 */
function normalizeAccountOrigin(categorySlug: string, accountOrigin: string | undefined) {
  if (categorySlug !== "contas") return null
  const value = (accountOrigin ?? "").trim()
  return isValidAccountOrigin(value) ? value : null
}

/**
 * Só aceitamos URLs de imagem que ESTE vendedor subiu (produtos/<id>/…). Checar
 * só o domínio deixava passar a foto de outro vendedor — e como remover uma
 * foto do anúncio apaga o arquivo do Blob, dava pra destruir a imagem alheia.
 */
function sanitizeImages(images: string[] | undefined, userId: string): string[] {
  if (!Array.isArray(images)) return []
  const seen = new Set<string>()
  const clean: string[] = []

  for (const raw of images) {
    if (seen.has(raw) || !isOwnBlobUrl(raw, "produtos", userId)) continue
    seen.add(raw)
    clean.push(raw)
    if (clean.length >= MAX_IMAGES) break
  }

  return clean
}

/**
 * O prazo manual precisa ser uma das opções fixas (DELIVERY_TIME_OPTIONS): um
 * texto livre não vira prazo em horas, e sem prazo o reembolso automático por
 * atraso nunca dispara. `current` deixa um anúncio antigo manter o valor legado
 * que já tinha até o vendedor escolher outro.
 */
function isAcceptableDeliveryTime(deliveryType: string, deliveryTime: string, current?: string) {
  if (deliveryType === "automatica") return true
  const value = deliveryTime.trim()
  if (!value) return true // cai no padrão em normalizeDelivery
  return hoursForDeliveryTime(value) !== null || value === current
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

/** Pra revalidar a loja pública do vendedor depois de criar/editar/pausar um anúncio. */
async function getStoreSlug(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ storeSlug: sellerApplication.storeSlug })
    .from(sellerApplication)
    .where(eq(sellerApplication.userId, userId))
    .limit(1)
  return row?.storeSlug ?? null
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

  // Uma consulta só (e não uma por sufixo tentado): títulos repetidos, como "conta-valorant", fariam
  // cada publicação custar tantas idas ao banco quanto anúncios iguais já existem. `root` só tem
  // [a-z0-9-], então não há metacaractere de regex para escapar.
  const rows = await db
    .select({ slug: product.slug })
    .from(product)
    .where(sql`${product.slug} ~ ${`^${root}(-[0-9]+)?$`}`)
  const taken = new Set(rows.map((r) => r.slug))

  let candidate = root
  let n = 1
  while (taken.has(candidate)) {
    n += 1
    candidate = `${root}-${n}`
  }
  return candidate
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
    if (label.length > MAX_LABEL) {
      return { error: `O nome do item ${index + 1} pode ter até ${MAX_LABEL} caracteres.`, parsed: null }
    }
    if ((v.deliveryNote ?? "").trim().length > MAX_NOTE) {
      return { error: `A observação de "${label}" pode ter até ${MAX_NOTE} caracteres.`, parsed: null }
    }

    const priceCents = parseToCents(v.price)
    if (priceCents === null || priceCents < 100) {
      return { error: `O preço de "${label}" deve ser de no mínimo R$ 1,00.`, parsed: null }
    }

    if (priceCents > MAX_PRICE_CENTS) {
      return { error: `O preço de "${label}" passa do máximo de R$ 100.000,00.`, parsed: null }
    }

    const stock = Number.parseInt(v.stock, 10)
    if (!Number.isFinite(stock) || stock < 0 || stock > MAX_STOCK) {
      return { error: `O estoque de "${label}" é inválido (0 a ${MAX_STOCK}).`, parsed: null }
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
  accountOrigin?: string
  attributes?: Record<string, string>
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

  {
    const blocked = await accountBlock(userId, "anunciar")
    if (blocked) return blocked
  }

  const title = input.title.trim()
  if (title.length < 8)
    return { ok: false, field: "title", error: "O título precisa ter ao menos 8 caracteres." }
  if (title.length > MAX_TITLE)
    return { ok: false, field: "title", error: `O título pode ter até ${MAX_TITLE} caracteres.` }
  if (input.description.trim().length > MAX_DESCRIPTION)
    return { ok: false, field: "description", error: `A descrição pode ter até ${MAX_DESCRIPTION} caracteres.` }
  if (input.game.trim().length > MAX_GAME)
    return { ok: false, field: "game", error: `O nome do jogo pode ter até ${MAX_GAME} caracteres.` }
  if (!input.categorySlug || !getCategory(input.categorySlug))
    return { ok: false, field: "categorySlug", error: "Escolha a categoria do anúncio." }
  if (input.description.trim().length < 20)
    return {
      ok: false,
      field: "description",
      error: "Descreva o que o comprador recebe com pelo menos 20 caracteres.",
    }
  if (input.categorySlug === "contas" && !isValidAccountOrigin((input.accountOrigin ?? "").trim()))
    return {
      ok: false,
      field: "accountOrigin",
      error: "Informe a procedência da conta.",
    }

  const attrs = sanitizeAttributes(input.game, input.categorySlug, input.attributes)
  if (attrs.missing)
    return { ok: false, field: "attributes", error: `Informe: ${attrs.missing.label}.` }

  if (!isAcceptableDeliveryTime(input.deliveryType, input.deliveryTime))
    return { ok: false, field: "deliveryTime", error: "Escolha um prazo de entrega da lista." }

  const { error, parsed } = validateVariants(input.variants)
  if (error || !parsed) return { ok: false, field: "variants", error: error ?? undefined }

  const automatic = input.deliveryType === "automatica"
  if (automatic) {
    if (!allowsAutoDelivery(input.categorySlug)) return { ok: false, field: "deliveryType", error: AUTO_CATEGORY_ERROR }
    if (!(await autoDeliveryAvailable())) return { ok: false, field: "deliveryType", error: AUTO_UNAVAILABLE_ERROR }
  }

  const slug = await uniqueSlug(slugify(title))
  const delivery = normalizeDelivery(input.deliveryType, input.deliveryTime)
  const accountOrigin = normalizeAccountOrigin(input.categorySlug, input.accountOrigin)

  const [created] = await db
    .insert(product)
    .values({
      sellerId: userId,
      slug,
      title,
      categorySlug: input.categorySlug,
      game: input.game.trim() || null,
      description: input.description.trim(),
      deliveryType: delivery.deliveryType,
      deliveryTime: delivery.deliveryTime,
      accountOrigin,
      attributes: attrs.attributes,
    })
    .returning({ id: product.id })

  await db.insert(productVariant).values(
    parsed.map((v, i) => ({
      productId: created.id,
      label: v.label,
      priceCents: v.priceCents,
      // Anúncio automático: o estoque é o número de itens cadastrados (começa em zero), nunca o que o formulário diz.
      stock: automatic ? 0 : v.stock,
      deliveryNote: v.deliveryNote,
      sortOrder: i,
    })),
  )

  await replaceProductImages(created.id, sanitizeImages(input.images, userId))

  const storeSlug = await getStoreSlug(userId)
  revalidatePath("/painel/vendedor/produtos")
  revalidatePath("/")
  revalidatePath(`/catalogo/${input.categorySlug}`)
  if (storeSlug) revalidatePath(`/loja/${storeSlug}`)
  if (input.game.trim()) revalidatePath(`/jogos/${slugifyGame(input.game.trim())}`)

  pingIndexNow([`/produtos/${slug}`, `/catalogo/${input.categorySlug}`, ...(input.game.trim() ? [`/jogos/${slugifyGame(input.game.trim())}`] : [])])

  return {
    ok: true,
    message: automatic ? "Anúncio publicado. Cadastre os itens do estoque para ele entrar à venda." : "Anúncio publicado.",
    slug,
  }
}

export async function updateProduct(input: {
  productId: number
  title: string
  categorySlug: string
  game: string
  description: string
  deliveryType: string
  deliveryTime: string
  accountOrigin?: string
  attributes?: Record<string, string>
  images?: string[]
  variants: (VariantInput & { id?: number })[]
}): Promise<ActionResult> {
  const userId = await getUserId()

  const [owned] = await db
    .select({
      id: product.id,
      slug: product.slug,
      categorySlug: product.categorySlug,
      deliveryTime: product.deliveryTime,
      deliveryType: product.deliveryType,
    })
    .from(product)
    .where(and(eq(product.id, input.productId), eq(product.sellerId, userId)))
    .limit(1)

  if (!owned) return { ok: false, error: "Anúncio não encontrado." }

  {
    const blocked = await accountBlock(userId, "editar anúncios")
    if (blocked) return blocked
  }

  const title = input.title.trim()
  if (title.length < 8)
    return { ok: false, field: "title", error: "O título precisa ter ao menos 8 caracteres." }
  if (title.length > MAX_TITLE)
    return { ok: false, field: "title", error: `O título pode ter até ${MAX_TITLE} caracteres.` }
  if (input.description.trim().length < 20)
    return {
      ok: false,
      field: "description",
      error: "Descreva o que o comprador recebe com pelo menos 20 caracteres.",
    }
  if (input.description.trim().length > MAX_DESCRIPTION)
    return { ok: false, field: "description", error: `A descrição pode ter até ${MAX_DESCRIPTION} caracteres.` }
  if (input.game.trim().length > MAX_GAME)
    return { ok: false, field: "game", error: `O nome do jogo pode ter até ${MAX_GAME} caracteres.` }
  if (!getCategory(input.categorySlug))
    return { ok: false, field: "categorySlug", error: "Escolha a categoria do anúncio." }
  if (!isAcceptableDeliveryTime(input.deliveryType, input.deliveryTime, owned.deliveryTime))
    return { ok: false, field: "deliveryTime", error: "Escolha um prazo de entrega da lista." }
  if (input.categorySlug === "contas" && !isValidAccountOrigin((input.accountOrigin ?? "").trim()))
    return {
      ok: false,
      field: "accountOrigin",
      error: "Informe a procedência da conta.",
    }

  const attrs = sanitizeAttributes(input.game, input.categorySlug, input.attributes)
  if (attrs.missing)
    return { ok: false, field: "attributes", error: `Informe: ${attrs.missing.label}.` }

  const { error, parsed } = validateVariants(input.variants)
  if (error || !parsed) return { ok: false, field: "variants", error: error ?? undefined }

  // Entrega automática (docs/entrega-automatica.md): só nas categorias que aceitam, só ligada com a chave e a tabela
  // presentes, e o estoque dos itens é derivado dos itens cadastrados, nunca do formulário.
  const wasAutomatic = owned.deliveryType === "automatica"
  const automatic = input.deliveryType === "automatica"
  if (automatic) {
    if (!allowsAutoDelivery(input.categorySlug)) return { ok: false, field: "deliveryType", error: AUTO_CATEGORY_ERROR }
    if (!wasAutomatic && !(await autoDeliveryAvailable())) return { ok: false, field: "deliveryType", error: AUTO_UNAVAILABLE_ERROR }
  }
  if (wasAutomatic && !automatic && (await availableStockInProduct(owned.id)) > 0) {
    return {
      ok: false,
      field: "deliveryType",
      error: "Apague os itens do estoque (aba Estoque do anúncio) antes de mudar para entrega manual.",
    }
  }

  const delivery = normalizeDelivery(input.deliveryType, input.deliveryTime)
  const accountOrigin = normalizeAccountOrigin(input.categorySlug, input.accountOrigin)

  await db
    .update(product)
    .set({
      title,
      categorySlug: input.categorySlug,
      game: input.game.trim() || null,
      description: input.description.trim(),
      deliveryType: delivery.deliveryType,
      deliveryTime: delivery.deliveryTime,
      accountOrigin,
      attributes: attrs.attributes,
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
          ...(automatic ? {} : { stock: data.stock }),
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
        stock: automatic ? 0 : data.stock,
        deliveryNote: data.deliveryNote,
        sortOrder: i,
      })
      .returning({ id: productVariant.id })

    keptIds.push(inserted.id)
  }

  // Passou de manual para automático: o estoque manual deixa de valer (ainda não há itens cadastrados).
  if (automatic && !wasAutomatic) {
    await db.update(productVariant).set({ stock: 0 }).where(eq(productVariant.productId, owned.id))
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
  const nextImages = sanitizeImages(input.images, userId)
  const previous = await db
    .select({ url: productImage.url })
    .from(productImage)
    .where(eq(productImage.productId, owned.id))
    .orderBy(asc(productImage.sortOrder))

  await replaceProductImages(owned.id, nextImages)

  // Só apaga do Blob o que é do próprio vendedor, mesmo que o banco já tenha
  // uma URL alheia de antes desta validação existir.
  const removed = previous
    .map((p) => p.url)
    .filter((url) => !nextImages.includes(url) && isOwnBlobUrl(url, "produtos", userId))
  if (removed.length) {
    // Falha ao apagar o arquivo não deve derrubar o salvamento do anúncio.
    try {
      await del(removed)
    } catch (error) {
      console.error("[v0] Falha ao remover imagens antigas do Blob:", error)
    }
  }

  const storeSlug = await getStoreSlug(userId)
  revalidatePath("/painel/vendedor/produtos")
  revalidatePath(`/produtos/${owned.slug}`)
  revalidatePath("/")
  revalidatePath(`/catalogo/${input.categorySlug}`)
  if (owned.categorySlug !== input.categorySlug) revalidatePath(`/catalogo/${owned.categorySlug}`)
  if (storeSlug) revalidatePath(`/loja/${storeSlug}`)
  if (input.game.trim()) revalidatePath(`/jogos/${slugifyGame(input.game.trim())}`)

  pingIndexNow([`/produtos/${owned.slug}`])

  return { ok: true, message: "Anúncio atualizado." }
}

export async function toggleProductStatus(productId: number): Promise<ActionResult> {
  const userId = await getUserId()

  const [owned] = await db
    .select({
      id: product.id,
      status: product.status,
      slug: product.slug,
      game: product.game,
      categorySlug: product.categorySlug,
    })
    .from(product)
    .where(and(eq(product.id, productId), eq(product.sellerId, userId)))
    .limit(1)

  if (!owned) return { ok: false, error: "Anúncio não encontrado." }

  const next = owned.status === "ativo" ? "pausado" : "ativo"

  // Pausar é sempre permitido; só reativar (voltar a vender) exige email confirmado.
  if (next === "ativo") {
    const blocked = await accountBlock(userId, "reativar o anúncio")
    if (blocked) return blocked
  }

  await db
    .update(product)
    .set({ status: next, updatedAt: new Date() })
    .where(eq(product.id, owned.id))

  const storeSlug = await getStoreSlug(userId)
  revalidatePath("/painel/vendedor/produtos")
  revalidatePath(`/produtos/${owned.slug}`)
  revalidatePath("/")
  revalidatePath(`/catalogo/${owned.categorySlug}`)
  if (storeSlug) revalidatePath(`/loja/${storeSlug}`)
  if (owned.game) revalidatePath(`/jogos/${slugifyGame(owned.game)}`)

  // Pausar também vale: o buscador relê a página e vê o noindex.
  pingIndexNow([`/produtos/${owned.slug}`])

  return {
    ok: true,
    message: next === "ativo" ? "Anúncio reativado." : "Anúncio pausado.",
  }
}
