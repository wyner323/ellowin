import * as Sentry from "@sentry/nextjs"
import { pool } from "@/lib/db"

/**
 * Contador de visualizações da página de um anúncio, por dia de Brasília. É só um número agregado: não guarda IP,
 * cookie nem quem viu, então não é dado pessoal. Serve à taxa de conversão do painel do vendedor (visitas → pedidos).
 */

// Robôs de busca, pré-visualização de links e ferramentas de linha de comando: não são compradores.
const BOT_PATTERN = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|curl|wget|python-requests|httpclient|headless|lighthouse|pagespeed|monitor|uptime/i

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  // Sem User-Agent não é navegador de gente.
  if (!userAgent || userAgent.trim().length < 8) return true
  return BOT_PATTERN.test(userAgent)
}

/** Quem pode gerar visualização: anúncio ativo, visitante que não é o dono e que não parece robô. */
export function countsAsView(opts: {
  productStatus: string
  sellerId: string
  viewerId: string | null
  userAgent: string | null | undefined
}): boolean {
  if (opts.productStatus !== "ativo") return false
  if (opts.viewerId !== null && opts.viewerId === opts.sellerId) return false
  return !isLikelyBot(opts.userAgent)
}

/**
 * Soma 1 à visualização do dia. Um UPSERT atômico (sem ler antes): visitas simultâneas não se perdem.
 * Nunca lança: contar visita é secundário e não pode derrubar a página (ex.: tabela ainda não migrada).
 */
export async function recordProductView(productId: number): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO "product_view_daily" ("productId", "day", "views")
       VALUES ($1, (now() AT TIME ZONE 'America/Sao_Paulo')::date, 1)
       ON CONFLICT ("productId", "day") DO UPDATE SET "views" = "product_view_daily"."views" + 1`,
      [productId],
    )
  } catch (error) {
    console.error("[product-views] não contou a visualização:", error instanceof Error ? error.message : error)
    Sentry.captureException(error, { tags: { area: "product-views" } })
  }
}
