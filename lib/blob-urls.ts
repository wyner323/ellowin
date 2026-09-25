const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com"

/**
 * URLs do Blob que o PRÓPRIO usuário subiu, nada além disso.
 *
 * Checar só o domínio deixava qualquer URL pública do Vercel Blob passar — de
 * outro vendedor ou até de outra conta. Pior: ao remover essa imagem do
 * anúncio o app chama `del()`, então dava pra apagar a foto de outro vendedor.
 * Todos os uploads do app usam o id do usuário no caminho
 * (`produtos/<id>/…`, `avatars/<id>.ext`, `banners/<id>.ext`), então é isso
 * que se exige aqui.
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

  // produtos/<id>/<arquivo>; avatars|banners: <id>.<ext> (sem subpasta).
  const own = folder === "produtos" ? `/produtos/${userId}/` : `/${folder}/${userId}.`
  return url.pathname.startsWith(own)
}
