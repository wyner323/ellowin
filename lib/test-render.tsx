import { renderToReadableStream } from "react-dom/server"
import type { ReactNode } from "react"

/**
 * Renderiza uma árvore React (uma página inteira) para HTML, esperando os
 * componentes de servidor assíncronos que ela contém (`export async function
 * Hero()`...). `renderToStaticMarkup` não os suporta; o renderizador por stream sim.
 * Só para testes. Os comentários de marcação do React (`<!-- -->`, `<!--$-->`) são
 * removidos para o texto das frases não vir cortado.
 */
export async function renderHtml(node: ReactNode): Promise<string> {
  const stream = await renderToReadableStream(node)
  await stream.allReady
  const html = await new Response(stream).text()
  return html.replace(/<!--[\s\S]*?-->/g, "")
}

/** Texto visível do HTML: sem scripts/estilos/tags, entidades comuns decodificadas, espaços colapsados. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&lt;|&#60;/g, "<")
    .replace(/&gt;|&#62;/g, ">")
    .replace(/&amp;|&#38;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}
