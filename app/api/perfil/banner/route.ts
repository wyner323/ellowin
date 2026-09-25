import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { EXT_BY_TYPE, checkImageUpload, tooManyUploads, uploadAllowed } from "@/lib/upload-guard"

/** Upload do banner da loja pública. Mesmo padrão do upload de avatar. */

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 })
  }

  if (!(await uploadAllowed(session.user.id, "banner"))) return tooManyUploads()

  try {
    const formData = await request.formData()
    const checked = await checkImageUpload(formData.get("file"))
    if (!checked.ok) return checked.response

    const ext = EXT_BY_TYPE[checked.mime]
    // Nome fixo por usuário: sem um `?v=` novo a cada troca, a URL não muda e
    // o navegador/otimizador de imagem continua servindo o banner antigo em cache.
    const blob = await put(`banners/${session.user.id}.${ext}`, checked.file, {
      access: "public",
      contentType: checked.mime,
      allowOverwrite: true,
    })

    return NextResponse.json({ url: `${blob.url}?v=${Date.now()}` })
  } catch (error) {
    console.error("[v0] Falha no upload de banner:", error)
    return NextResponse.json({ error: "Não foi possível enviar a imagem." }, { status: 500 })
  }
}
