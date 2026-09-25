"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { product, productQuestion } from "@/lib/db/schema"
import { getUserId } from "@/lib/session"
import type { ActionResult } from "@/app/actions/auth"

/** Qualquer visitante logado pode perguntar num anúncio que não é o próprio. */
export async function askProductQuestion(
  productId: number,
  question: string,
): Promise<ActionResult> {
  const userId = await getUserId()

  const trimmed = question.trim()
  if (trimmed.length < 5) {
    return { ok: false, error: "Escreva a pergunta com pelo menos 5 caracteres." }
  }
  if (trimmed.length > 500) {
    return { ok: false, error: "A pergunta pode ter no máximo 500 caracteres." }
  }

  const [item] = await db
    .select({ id: product.id, sellerId: product.sellerId, slug: product.slug })
    .from(product)
    .where(eq(product.id, productId))
    .limit(1)

  if (!item) return { ok: false, error: "Anúncio não encontrado." }
  if (item.sellerId === userId) {
    return { ok: false, error: "Você não pode perguntar no seu próprio anúncio." }
  }

  await db.insert(productQuestion).values({
    productId: item.id,
    askerId: userId,
    question: trimmed,
  })

  revalidatePath(`/produtos/${item.slug}`)
  return { ok: true, message: "Pergunta enviada." }
}

/** Só o dono do anúncio responde — ownership é sempre re-checado aqui, nunca confiado do client. */
export async function answerProductQuestion(
  questionId: number,
  answer: string,
): Promise<ActionResult> {
  const userId = await getUserId()

  const trimmed = answer.trim()
  if (trimmed.length < 2) {
    return { ok: false, error: "Escreva uma resposta." }
  }
  if (trimmed.length > 1000) {
    return { ok: false, error: "A resposta pode ter no máximo 1000 caracteres." }
  }

  const [row] = await db
    .select({
      id: productQuestion.id,
      sellerId: product.sellerId,
      slug: product.slug,
    })
    .from(productQuestion)
    .innerJoin(product, eq(product.id, productQuestion.productId))
    .where(eq(productQuestion.id, questionId))
    .limit(1)

  if (!row || row.sellerId !== userId) {
    return { ok: false, error: "Pergunta não encontrada." }
  }

  await db
    .update(productQuestion)
    .set({ answer: trimmed, answeredAt: new Date() })
    .where(eq(productQuestion.id, questionId))

  revalidatePath(`/produtos/${row.slug}`)
  return { ok: true, message: "Resposta publicada." }
}
