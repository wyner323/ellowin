import { unstable_cache } from "next/cache"

/**
 * Guarda por alguns segundos o resultado de uma leitura pública do banco (números da vitrine), para a home, as
 * categorias e os jogos não refazerem as mesmas somas a cada visita. Vale só para leituras SEM dado do visitante
 * (nada de sessão, cookie ou carteira): o resultado é o mesmo para todo mundo e fica no cache da Vercel.
 *
 * O custo é a defasagem: um anúncio novo ou uma venda pode levar até `seconds` para aparecer nos NÚMEROS (a página do
 * anúncio, a busca e o preço de compra continuam lendo o banco na hora). Nos testes (`NODE_ENV=test`) devolve a função
 * original: o cache do Next não existe fora do servidor e os testes precisam ver o banco de verdade.
 */
export function cachedRead<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  keyParts: string[],
  seconds: number,
): (...args: A) => Promise<R> {
  if (process.env.NODE_ENV === "test") return fn
  return unstable_cache(fn, keyParts, { revalidate: seconds })
}
