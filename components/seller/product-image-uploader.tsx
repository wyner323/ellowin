"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { ImagePlus, Loader2, Star, X } from "lucide-react"
import { compressImage } from "@/lib/image-compress"
import { Button } from "@/components/ui/button"

const MAX_IMAGES = 5

/**
 * Galeria de fotos do anúncio (controlada pelo formulário).
 *
 * Cada foto escolhida é comprimida no navegador e enviada para o Blob; só a
 * URL final entra na lista `value`. A primeira imagem é a capa que aparece no
 * card da vitrine.
 */
export function ProductImageUploader({
  value,
  onChange,
  disabled,
}: {
  value: string[]
  onChange: (urls: string[]) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const remaining = MAX_IMAGES - value.length

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)

    const picked = Array.from(files).slice(0, remaining)
    if (picked.length < files.length) {
      setError(`Você pode enviar no máximo ${MAX_IMAGES} imagens.`)
    }

    setUploading((n) => n + picked.length)

    for (const file of picked) {
      try {
        const { file: compressed } = await compressImage(file)
        const body = new FormData()
        body.append("file", compressed)

        const res = await fetch("/api/produtos/upload", { method: "POST", body })
        const data = (await res.json()) as { url?: string; error?: string }

        if (!res.ok || !data.url) {
          setError(data.error ?? "Não foi possível enviar a imagem.")
        } else {
          onChange([...currentRef.current, data.url])
        }
      } catch {
        setError("Não foi possível processar a imagem.")
      } finally {
        setUploading((n) => n - 1)
      }
    }

    if (inputRef.current) inputRef.current.value = ""
  }

  // Ref viva com o valor atual: uploads concorrentes não sobrescrevem uns aos
  // outros ao chamar onChange em sequência.
  const currentRef = useRef(value)
  currentRef.current = value

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  function makeCover(index: number) {
    if (index === 0) return
    const next = [...value]
    const [moved] = next.splice(index, 1)
    next.unshift(moved)
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {value.map((url, index) => (
          <div
            key={url}
            className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
          >
            <Image
              src={url || "/placeholder.svg"}
              alt={`Imagem ${index + 1} do anúncio`}
              fill
              sizes="(max-width: 640px) 33vw, 160px"
              className="object-cover"
            />

            {index === 0 ? (
              <span className="absolute left-1 top-1 flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 text-[0.65rem] font-medium text-primary-foreground">
                <Star className="size-3" aria-hidden="true" />
                Capa
              </span>
            ) : null}

            <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              {index !== 0 ? (
                <button
                  type="button"
                  onClick={() => makeCover(index)}
                  disabled={disabled}
                  className="rounded-md bg-background/90 px-1.5 py-1 text-[0.65rem] font-medium hover:bg-background"
                >
                  Definir capa
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => removeAt(index)}
                disabled={disabled}
                aria-label={`Remover imagem ${index + 1}`}
                className="rounded-md bg-background/90 p-1 text-destructive hover:bg-background"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        ))}

        {uploading > 0
          ? Array.from({ length: uploading }).map((_, i) => (
              <div
                key={`up-${i}`}
                className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-border bg-muted/40"
              >
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ))
          : null}

        {remaining > 0 && uploading === 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <ImagePlus className="size-6" aria-hidden="true" />
            <span className="text-xs">Adicionar</span>
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />

      <p className="text-xs text-muted-foreground">
        Até {MAX_IMAGES} fotos. As imagens são otimizadas automaticamente antes
        do envio para não pesar no site. A primeira é a capa do anúncio.
      </p>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
