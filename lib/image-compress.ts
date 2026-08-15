/**
 * Compressão de imagens no navegador.
 *
 * Antes de subir a foto para o servidor, redimensionamos e recomprimimos no
 * próprio navegador. Isso é a maior economia de peso: em vez de enviar um JPEG
 * de 4-8 MB da câmera, subimos um WebP de ~100-300 KB. O usuário não espera
 * upload gigante e o storage não incha.
 */

export type CompressResult = {
  file: File
  width: number
  height: number
}

const MAX_DIMENSION = 1600
const TARGET_TYPE = "image/webp"
const QUALITY = 0.82

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Não foi possível ler a imagem."))
    }
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality),
  )
}

/**
 * Redimensiona para no máximo 1600px no maior lado e recomprime para WebP.
 * Retorna o arquivo pronto para upload. Se algo falhar (ex.: navegador antigo
 * sem suporte a WebP no canvas), devolve o arquivo original.
 */
export async function compressImage(file: File): Promise<CompressResult> {
  if (!file.type.startsWith("image/")) {
    throw new Error("O arquivo selecionado não é uma imagem.")
  }

  try {
    const img = await loadImage(file)

    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
    const width = Math.round(img.width * scale)
    const height = Math.round(img.height * scale)

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas indisponível.")
    ctx.drawImage(img, 0, 0, width, height)

    const blob = await canvasToBlob(canvas, TARGET_TYPE, QUALITY)
    if (!blob) throw new Error("Falha ao comprimir.")

    // Se a compressão não ajudou (imagem já pequena), mantém o menor dos dois.
    const finalBlob = blob.size < file.size ? blob : file
    const ext = finalBlob === blob ? "webp" : file.name.split(".").pop() || "jpg"
    const baseName = file.name.replace(/\.[^.]+$/, "") || "imagem"

    const compressed = new File([finalBlob], `${baseName}.${ext}`, {
      type: finalBlob.type || file.type,
    })

    return { file: compressed, width, height }
  } catch {
    // Fallback seguro: sobe o original se a compressão não for possível.
    return { file, width: 0, height: 0 }
  }
}
