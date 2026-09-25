import { NextResponse } from "next/server"
import { hitRateLimit } from "@/lib/rate-limit"
import { SNIFF_BYTES, sniffImageMime, type ImageMime } from "@/lib/image-sniff"

/** Teto de segurança pós-compressão; o normal é ficar bem abaixo disso. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export const EXT_BY_TYPE: Record<ImageMime, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/avif": "avif",
}

const ONE_HOUR = 60 * 60

/**
 * Freio de quantidade por usuário. Sem isso, qualquer conta logada enchia o
 * Blob (armazenamento pago) subindo arquivos de 5 MB em laço.
 */
export async function uploadAllowed(userId: string, kind: "produtos" | "avatar" | "banner") {
  const max = kind === "produtos" ? 40 : 10
  return hitRateLimit(`upload:${kind}:${userId}`, max, ONE_HOUR)
}

export function tooManyUploads() {
  return NextResponse.json(
    { error: "Muitos envios em pouco tempo. Tente novamente mais tarde." },
    { status: 429 },
  )
}

/**
 * Valida o arquivo recebido: é um File, tem tamanho aceitável e o CONTEÚDO
 * (não o `file.type` declarado pelo navegador) é de fato uma das imagens
 * permitidas. Devolve o tipo real detectado, que deve definir a extensão e o
 * contentType gravados no Blob.
 */
export async function checkImageUpload(
  file: unknown,
): Promise<{ ok: true; file: File; mime: ImageMime } | { ok: false; response: NextResponse }> {
  if (!(file instanceof File)) {
    return { ok: false, response: NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 }) }
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      response: NextResponse.json({ error: "A imagem é muito grande (máx. 5 MB)." }, { status: 400 }),
    }
  }

  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer())
  const mime = sniffImageMime(head)
  if (!mime) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Formato inválido. Use JPG, PNG ou WebP." }, { status: 400 }),
    }
  }

  return { ok: true, file, mime }
}
