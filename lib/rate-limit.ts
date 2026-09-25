import { and, eq, gt, lt, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { db } from "@/lib/db"
import { authAttempt } from "@/lib/db/schema"

/**
 * Limitador de taxa em banco, para login e cadastro.
 *
 * Registra a tentativa ANTES de contar (em vez de contar e depois registrar):
 * assim uma rajada de requisições paralelas não passa toda junta pela checagem
 * antes de qualquer uma ter sido contada.
 */
export async function hitRateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  await db.insert(authAttempt).values({ key })

  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(authAttempt)
    .where(
      and(
        eq(authAttempt.key, key),
        gt(authAttempt.createdAt, sql`now() - make_interval(secs => ${windowSeconds})`),
      ),
    )

  // Limpeza oportunista (~1% das chamadas): sem cron dedicado, a tabela não cresce sem fim.
  if (Math.random() < 0.01) {
    await db
      .delete(authAttempt)
      .where(lt(authAttempt.createdAt, sql`now() - interval '1 day'`))
      .catch(() => {})
  }

  return (row?.n ?? 0) <= max
}

/** Zera o contador de uma chave (ex.: login bem-sucedido não deve pesar nas próximas tentativas). */
export async function clearRateLimit(key: string) {
  await db.delete(authAttempt).where(eq(authAttempt.key, key))
}

/** IP do cliente, como a Vercel o informa. `null` se não der pra saber. */
export async function clientIp(): Promise<string | null> {
  const h = await headers()
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
}
