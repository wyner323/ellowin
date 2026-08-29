import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"

/**
 * Upload de foto de perfil.
 *
 * Mesmo padrão do upload de fotos de anúncio (`/api/produtos/upload`): o
 * arquivo já chega comprimido do navegador, mas o servidor revalida tipo e
 * tamanho antes de subir pro Blob público — a foto de perfil é vista por
 * qualquer visitante no chat, nas avaliações e nos anúncios.
 */

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = ["image/webp", "image/jpeg", "image/png", "image/avif"]

const EXT_BY_TYPE: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/avif": "avif",
}

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

    const ext = EXT_BY_TYPE[file.type]
    // Nome fixo por usuário (sem UUID): cada troca substitui a anterior, sem
    // acumular lixo no Blob.
    const blob = await put(`avatars/${session.user.id}.${ext}`, file, {
      access: "public",
      contentType: file.type,
      allowOverwrite: true,
    })

    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.error("[v0] Falha no upload de avatar:", error)
    return NextResponse.json({ error: "Não foi possível enviar a imagem." }, { status: 500 })
  }
}
