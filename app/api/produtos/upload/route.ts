import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"

/**
 * Upload de foto de anúncio.
 *
 * Só vendedores logados sobem imagens. O arquivo já chega comprimido do
 * navegador (WebP, máx. 1600px), mas ainda validamos tipo e tamanho no
 * servidor — nunca confie só no cliente. As imagens vão para um Blob público
 * porque são fotos de vitrine, feitas para serem vistas por qualquer visitante.
 */

// Teto de segurança pós-compressão; o normal é ficar bem abaixo disso.
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = ["image/webp", "image/jpeg", "image/png", "image/avif"]

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 })
    }

    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json(
        { error: "Formato inválido. Use JPG, PNG ou WebP." },
        { status: 400 },
      )
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "A imagem é muito grande (máx. 5 MB)." },
        { status: 400 },
      )
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "webp"
    const blob = await put(`produtos/${session.user.id}/${crypto.randomUUID()}.${ext}`, file, {
      access: "public",
      contentType: file.type,
    })

    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.error("[v0] Falha no upload de imagem:", error)
    return NextResponse.json({ error: "Não foi possível enviar a imagem." }, { status: 500 })
  }
}
