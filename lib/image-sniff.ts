export type ImageMime = "image/webp" | "image/jpeg" | "image/png" | "image/avif"

/** Quantos bytes do começo do arquivo bastam para reconhecer os formatos aceitos. */
export const SNIFF_BYTES = 16

const ascii = (b: Uint8Array, start: number, text: string) =>
  text.split("").every((ch, i) => b[start + i] === ch.charCodeAt(0))

/**
 * Descobre o formato real da imagem pelos primeiros bytes (assinatura do
 * arquivo). O `file.type` que chega no upload é só o que o navegador declarou —
 * qualquer um pode mandar "image/png" com outro conteúdo dentro.
 */
export function sniffImageMime(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => bytes[i] === v))
    return "image/png"

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg"

  if (bytes.length >= 12 && ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP"))
    return "image/webp"

  // AVIF: caixa "ftyp" no byte 4 e marca "avif"/"avis" logo depois.
  if (bytes.length >= 12 && ascii(bytes, 4, "ftyp") && (ascii(bytes, 8, "avif") || ascii(bytes, 8, "avis")))
    return "image/avif"

  return null
}
