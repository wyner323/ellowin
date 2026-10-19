import { after } from "next/server"
import { SITE_URL } from "@/lib/site"

/**
 * IndexNow: avisa na hora os buscadores que adotaram o protocolo (Bing, Yandex, Seznam, Naver) quando um anúncio
 * é publicado, editado ou pausado, em vez de esperar o próximo rastreio. O Google NÃO usa IndexNow: para ele valem o
 * sitemap (/sitemap.xml) e o Search Console (ver PENDENCIAS.md).
 *
 * A chave abaixo é PÚBLICA por desenho do protocolo (o buscador a confere em /indexnow-key.txt); não é segredo.
 * Só envia em produção, como os e-mails: o banco local é o de produção e um teste não deve cutucar os buscadores.
 */
export const INDEXNOW_KEY = "ca29b0b368eddd4adde1e5633e2f79e0"
const ENDPOINT = "https://api.indexnow.org/indexnow"

export function indexNowLive() {
  return process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production"
}

/** Corpo do pedido: só caminhos do nosso domínio, sem repetição, no máximo 100 por chamada. */
export function indexNowBody(paths: string[]) {
  const urls = [...new Set(paths.filter((p) => p.startsWith("/")).map((p) => `${SITE_URL}${p}`))].slice(0, 100)
  return {
    host: new URL(SITE_URL).host,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_URL}/indexnow-key.txt`,
    urlList: urls,
  }
}

/** Dispara depois da resposta (`after`), nunca atrasa nem derruba a ação do vendedor. */
export function pingIndexNow(paths: string[]) {
  if (!indexNowLive() || paths.length === 0) return
  const body = indexNowBody(paths)
  if (body.urlList.length === 0) return
  after(async () => {
    try {
      await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      })
    } catch (error) {
      console.error("[indexnow] falha ao avisar os buscadores:", error instanceof Error ? error.message : error)
    }
  })
}
