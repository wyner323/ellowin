import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { EXT_BY_TYPE, checkImageUpload, tooManyUploads, uploadAllowed } from "@/lib/upload-guard"

/**
 * Upload de foto de perfil.
 *
 * Mesmo padrão do upload de fotos de anúncio (`/api/produtos/upload`): o
 * arquivo já chega comprimido do navegador, mas o servidor revalida o
 * conteúdo real e o tamanho antes de subir pro Blob público — a foto de perfil
 * é vista por qualquer visitante no chat, nas avaliações e nos anúncios.
 */

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 })
  }

  if (!(await uploadAllowed(session.user.id, "avatar"))) return tooManyUploads()

  try {
    const formData = await request.formData()
    const checked = await checkImageUpload(formData.get("file"))
    if (!checked.ok) return checked.response

    const ext = EXT_BY_TYPE[checked.mime]
    // Nome fixo por usuário (sem UUID): cada troca substitui a anterior, sem
    // acumular lixo no Blob. Só que aí a URL não muda — o navegador e o
    // otimizador de imagem do Next cacheiam pela URL, então sem um `?v=` novo
    // a foto antiga continuaria aparecendo mesmo com o arquivo já trocado.
    const blob = await put(`avatars/${session.user.id}.${ext}`, checked.file, {
      access: "public",
      contentType: checked.mime,
      allowOverwrite: true,
    })

    return NextResponse.json({ url: `${blob.url}?v=${Date.now()}` })
  } catch (error) {
    console.error("[v0] Falha no upload de avatar:", error)
    return NextResponse.json({ error: "Não foi possível enviar a imagem." }, { status: 500 })
  }
}
