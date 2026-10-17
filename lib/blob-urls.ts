const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com"

/**
 * URLs do Blob que o PRÓPRIO usuário subiu, nada além disso.
 *
 * Checar só o domínio deixava qualquer URL pública do Vercel Blob passar — de
 * outro vendedor ou até de outra conta. Pior: ao remover essa imagem do
 * anúncio o app chama `del()`, então dava pra apagar a foto de outro vendedor.
 * Todos os uploads do app usam o id do usuário no caminho
 * (`produtos/<id>/…`, `avatars/<id>.ext`, `banners/<id>.ext`), então é isso
 * que se exige aqui — e, com ELLOWIN_BLOB_HOST definida, que o arquivo esteja na loja de Blob do app.
 */
export function isOwnBlobUrl(
  raw: unknown,
  folder: "produtos" | "avatars" | "banners",
  userId: string,
): boolean {
  if (typeof raw !== "string" || !userId) return false
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(BLOB_HOST_SUFFIX)) return false

  // Cada loja de Blob tem o próprio subdomínio no mesmo sufixo: com ELLOWIN_BLOB_HOST (o host exato da loja do
  // app, ex. "abc123.public.blob.vercel-storage.com") só os arquivos que passaram pelas nossas rotas de upload
  // valem. Sem a variável, qualquer loja do sufixo passa (o contrário quebraria as imagens já gravadas).
  const pinned = process.env.ELLOWIN_BLOB_HOST?.trim().toLowerCase()
  if (pinned && url.hostname !== pinned) return false

  // "/" ou "." codificados: o parser de URL os deixa no caminho e o prefixo do usuário ainda casaria
  // ("/produtos/<eu>/..%2F<outro>/x"), mas o serviço de Blob poderia decodificá-los e apontar para o arquivo alheio.
  if (/%2f|%5c|%2e/i.test(url.pathname) || url.pathname.includes("..")) return false

  // produtos/<id>/<arquivo>; avatars|banners: <id>.<ext> (sem subpasta).
  const own = folder === "produtos" ? `/produtos/${userId}/` : `/${folder}/${userId}.`
  return url.pathname.startsWith(own)
}
