import { put } from "@vercel/blob"
import { eq } from "drizzle-orm"
import { type NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sellerApplication } from "@/lib/db/schema"
import { getSession } from "@/lib/session"
import { EXT_BY_TYPE, checkImageUpload, tooManyUploads, uploadAllowed } from "@/lib/upload-guard"

/**
 * Upload de foto de anúncio.
 *
 * Só vendedores aprovados sobem imagens (mesma regra de createProduct). O
 * arquivo já chega comprimido do navegador (WebP, máx. 1600px), mas o servidor
 * revalida tamanho e o CONTEÚDO real do arquivo — nunca confie só no cliente.
 * As imagens vão para um Blob público porque são fotos de vitrine, feitas para
 * serem vistas por qualquer visitante.
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 })
  }

  const [seller] = await db
    .select({ status: sellerApplication.status })
    .from(sellerApplication)
    .where(eq(sellerApplication.userId, session.user.id))
    .limit(1)

  if (seller?.status !== "aprovado") {
    return NextResponse.json(
      { error: "Conclua o cadastro de vendedor antes de enviar fotos." },
      { status: 403 },
    )
  }

  if (!(await uploadAllowed(session.user.id, "produtos"))) return tooManyUploads()

  try {
    const formData = await request.formData()
    const checked = await checkImageUpload(formData.get("file"))
    if (!checked.ok) return checked.response

    // Extensão e contentType vêm do tipo detectado no conteúdo, nunca do nome ou
    // do MIME declarado pelo cliente — evita path traversal / injeção via file.name.
    const ext = EXT_BY_TYPE[checked.mime]
    const blob = await put(`produtos/${session.user.id}/${crypto.randomUUID()}.${ext}`, checked.file, {
      access: "public",
      contentType: checked.mime,
    })

    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.error("[v0] Falha no upload de imagem:", error)
    return NextResponse.json({ error: "Não foi possível enviar a imagem." }, { status: 500 })
  }
}
