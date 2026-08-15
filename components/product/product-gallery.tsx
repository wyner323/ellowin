"use client"

import { useState } from "react"
import Image from "next/image"

/**
 * Galeria de fotos do anúncio.
 *
 * Mostra a imagem ativa grande e miniaturas clicáveis. Todas passam pela
 * otimização do Next (AVIF/WebP no tamanho da tela). A capa (índice 0) é a
 * imagem prioritária de carregamento.
 */
export function ProductGallery({
  images,
  title,
}: {
  images: string[]
  title: string
}) {
  const [active, setActive] = useState(0)

  if (images.length === 0) return null

  const current = images[Math.min(active, images.length - 1)]

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted">
        <Image
          src={current || "/placeholder.svg"}
          alt={title}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 640px"
          className="object-cover"
        />
      </div>

      {images.length > 1 ? (
        <ul className="flex flex-wrap gap-2">
          {images.map((url, index) => (
            <li key={url}>
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-label={`Ver imagem ${index + 1}`}
                aria-current={index === active}
                className={
                  index === active
                    ? "relative size-16 overflow-hidden rounded-lg border-2 border-primary"
                    : "relative size-16 overflow-hidden rounded-lg border border-border opacity-80 transition-opacity hover:opacity-100"
                }
              >
                <Image
                  src={url || "/placeholder.svg"}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
