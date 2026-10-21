"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { product, sellerApplication } from "@/lib/db/schema"
import { pingIndexNow } from "@/lib/indexnow"
import { hitRateLimit } from "@/lib/rate-limit"
import { accountBlock, getUserId } from "@/lib/session"
import { VACATION_STATUS } from "@/lib/store-vacation"
import type { ActionResult } from "@/app/actions/auth"

/**
 * Liga ou desliga o modo férias da loja: tira da vitrine todos os anúncios ativos (status "ferias") ou devolve
 * só os que o modo escondeu. Pedidos já feitos não mudam: o prazo de entrega continua valendo. Só vendedor
 * aprovado e só os próprios anúncios; voltar a vender exige e-mail confirmado, como reativar um anúncio.
 */
export async function setStoreVacation(on: boolean): Promise<ActionResult> {
  const userId = await getUserId()

  const [application] = await db.select({ status: sellerApplication.status }).from(sellerApplication).where(eq(sellerApplication.userId, userId)).limit(1)
  if (!application || application.status !== "aprovado") return { ok: false, error: "Apenas vendedores aprovados podem usar o modo férias." }

  if (!(await hitRateLimit(`store-vacation:${userId}`, 10, 60 * 60))) return { ok: false, error: "Muitas alterações em pouco tempo. Tente de novo mais tarde." }

  if (!on) {
    const blocked = await accountBlock(userId, "voltar a vender")
    if (blocked) return blocked
  }

  const from = on ? "ativo" : VACATION_STATUS
  const to = on ? VACATION_STATUS : "ativo"
  const changed = await db
    .update(product)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(product.sellerId, userId), eq(product.status, from)))
    .returning({ slug: product.slug })

  if (changed.length === 0) {
    return { ok: false, error: on ? "Você não tem anúncios ativos para colocar em férias." : "Nenhum anúncio está em férias." }
  }

  revalidatePath("/painel/vendedor")
  revalidatePath("/painel/vendedor/produtos")
  revalidatePath("/")
  pingIndexNow(changed.slice(0, 100).map((p) => `/produtos/${p.slug}`))

  const n = changed.length
  return {
    ok: true,
    message: on
      ? `Loja em férias: ${n} ${n === 1 ? "anúncio saiu" : "anúncios saíram"} da vitrine.`
      : `Bem-vindo de volta! ${n} ${n === 1 ? "anúncio voltou" : "anúncios voltaram"} à vitrine.`,
  }
}
