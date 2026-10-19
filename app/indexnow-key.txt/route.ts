import { INDEXNOW_KEY } from "@/lib/indexnow"

/** Arquivo de prova do IndexNow: o buscador abre este endereço e confere se a chave é a mesma do pedido. */
export function GET() {
  return new Response(INDEXNOW_KEY, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
}
