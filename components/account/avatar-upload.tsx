"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Camera, Loader2, X } from "lucide-react"
import { removeAvatar, updateAvatar } from "@/app/actions/account"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { compressImage } from "@/lib/image-compress"

export function AvatarUpload({
  imageUrl,
  initials,
}: {
  imageUrl: string | null
  initials: string
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState(imageUrl)
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

      const res = await fetch("/api/perfil/avatar", { method: "POST", body })
      const data = (await res.json()) as { url?: string; error?: string }

      if (!res.ok || !data.url) {
        setError(data.error ?? "Não foi possível enviar a imagem.")
        return
      }

      const result = await updateAvatar({ imageUrl: data.url })
      if (!result.ok) {
        setError(result.error ?? "Não foi possível salvar a foto.")
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
    removeAvatar()
      .then(() => {
        setPreview(null)
        router.refresh()
      })
      .finally(() => setUploading(false))
  }

  return (
    <div className="flex items-center gap-4">
      <div className="group relative">
        <Avatar size="lg" className="size-20">
          {preview ? <AvatarImage src={preview} alt="Sua foto de perfil" /> : null}
          <AvatarFallback className="text-xl font-semibold">{initials}</AvatarFallback>
        </Avatar>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label="Trocar foto de perfil"
          className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-100"
        >
          {uploading ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <Camera className="size-5" aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <Camera className="size-3.5" />
            Trocar foto
          </Button>
          {preview ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleRemove}
              disabled={uploading}
            >
              <X className="size-3.5" />
              Remover
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">JPG, PNG ou WebP — até 5 MB.</p>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>

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
