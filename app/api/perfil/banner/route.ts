import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"

/** Upload do banner da loja pública. Mesmo padrão do upload de avatar. */

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
    const blob = await put(`banners/${session.user.id}.${ext}`, file, {
      access: "public",
      contentType: file.type,
      allowOverwrite: true,
    })

    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.error("[v0] Falha no upload de banner:", error)
    return NextResponse.json({ error: "Não foi possível enviar a imagem." }, { status: 500 })
  }
}
