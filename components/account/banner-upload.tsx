"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Camera, Loader2, X } from "lucide-react"
import { removeBanner, updateBanner } from "@/app/actions/account"
import { Button } from "@/components/ui/button"
import { compressImage } from "@/lib/image-compress"

export function BannerUpload({ bannerUrl }: { bannerUrl: string | null }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState(bannerUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)

    try {
      const { file: compressed } = await compressImage(file)
      const body = new FormData()
      body.append("file", compressed)

      const res = await fetch("/api/perfil/banner", { method: "POST", body })
      const data = (await res.json()) as { url?: string; error?: string }

      if (!res.ok || !data.url) {
        setError(data.error ?? "Não foi possível enviar a imagem.")
        return
      }

      const result = await updateBanner({ imageUrl: data.url })
      if (!result.ok) {
        setError(result.error ?? "Não foi possível salvar o banner.")
        return
      }

      setPreview(data.url)
      router.refresh()
    } catch {
      setError("Não foi possível processar a imagem.")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  function handleRemove() {
    setError(null)
    setUploading(true)
    removeBanner()
      .then(() => {
        setPreview(null)
        router.refresh()
      })
      .finally(() => setUploading(false))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="group relative aspect-[3/1] overflow-hidden rounded-lg border border-border bg-gradient-to-br from-accent to-muted">
        {preview ? (
          <Image src={preview} alt="Banner da loja" fill sizes="600px" className="object-cover" />
        ) : null}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label="Trocar banner da loja"
          className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-100"
        >
          {uploading ? (
            <Loader2 className="size-6 animate-spin" aria-hidden="true" />
          ) : (
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Camera className="size-4" aria-hidden="true" />
              {preview ? "Trocar banner" : "Adicionar banner"}
            </span>
          )}
        </button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Aparece no topo da sua loja pública — recomendado 1200×400px.
        </p>
        {preview ? (
          <Button type="button" size="sm" variant="ghost" onClick={handleRemove} disabled={uploading}>
            <X className="size-3.5" />
            Remover
          </Button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => handleFile(e.target.files)}
      />
    </div>
  )
}
