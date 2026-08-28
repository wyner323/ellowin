import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * CSP com nonce por requisição. O nonce vai no header de resposta e também
 * num header interno (`x-nonce`) que o layout lê via `headers()` para marcar
 * os <script> que a própria aplicação renderiza — os que o Next injeta para
 * hidratação já reconhecem esse nonce automaticamente.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  // O Fast Refresh do Next em dev usa eval() para os módulos — sem isso o
  // hot reload quebra. Em produção o build não depende de eval.
  const devScript = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""

  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devScript};
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https://*.public.blob.vercel-storage.com;
    font-src 'self' data:;
    connect-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim()

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("Content-Security-Policy", csp)
  return response
}

export const config = {
  matcher: [
    /*
     * Aplica a todas as rotas, exceto assets estáticos do Next e arquivos
     * públicos com extensão (imagens, ícones etc.) — CSP não se aplica a eles.
     */
    "/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|webp|avif|ico|txt|xml)$).*)",
  ],
}
