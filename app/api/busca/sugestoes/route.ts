import { NextResponse } from "next/server"
import { suggestGames } from "@/lib/search-suggest"

/** Sugestões de jogo para a busca do cabeçalho. Só catálogo estático: sem banco e sem sessão. */
export function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? ""

  return NextResponse.json(
    { suggestions: suggestGames(q) },
    // O resultado só depende do texto digitado, então pode ficar no cache do navegador/CDN.
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
  )
}
