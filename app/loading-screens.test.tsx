import { describe, expect, it } from "vitest"
import { renderHtml } from "@/lib/test-render"
import JogosLoading from "@/app/jogos/loading"
import JogoLoading from "@/app/jogos/[slug]/loading"
import CatalogoLoading from "@/app/catalogo/[slug]/loading"
import BuscaLoading from "@/app/busca/loading"
import ProdutoLoading from "@/app/produtos/[slug]/loading"

/**
 * As telas de carregamento das rotas públicas aparecem na hora da navegação, antes de a página chegar do servidor:
 * ficam com o mesmo contrato das páginas (um único <main id="conteudo">) e avisam leitores de tela que estão ocupadas.
 */
describe("telas de carregamento das rotas públicas", () => {
  it.each([
    ["/jogos", JogosLoading],
    ["/jogos/[slug]", JogoLoading],
    ["/catalogo/[slug]", CatalogoLoading],
    ["/busca", BuscaLoading],
    ["/produtos/[slug]", ProdutoLoading],
  ])("%s: um <main id=conteudo>, status ocupado e nada de texto quebrado", async (_rota, Screen) => {
    const html = await renderHtml(<Screen />)
    expect(html.match(/<main\b/g)).toHaveLength(1)
    expect(html).toContain('id="conteudo"')
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-busy="true"')
    expect(html).not.toMatch(/undefined|NaN|\[object Object\]/)
  })
})
