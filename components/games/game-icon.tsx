import Image from "next/image"
import { cn } from "@/lib/utils"
import { GAME_BRAND_ICONS } from "@/lib/game-brand-icons"
import { gameImagePath } from "@/lib/game-images"
import { gameIconBackground, gameInitials } from "@/lib/game-icon"

/**
 * Ícone do jogo. Ordem: 1) a imagem do jogo (`lib/game-images.ts`), 2) a marca da plataforma ou do jogo
 * (`lib/game-brand-icons.ts`), 3) um ícone gerado com as iniciais. Decorativo: o nome do jogo já aparece em
 * texto ao lado, então fica escondido de leitores de tela.
 */
export function GameIcon({
  name,
  slug,
  size = "md",
  className,
}: {
  name: string
  slug: string
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const box = cn(
    "inline-flex shrink-0 select-none items-center justify-center overflow-hidden shadow-sm ring-1 ring-white/10",
    size === "sm" && "size-6 rounded-md",
    size === "md" && "size-9 rounded-lg",
    size === "lg" && "size-14 rounded-xl",
    className,
  )
  const px = size === "sm" ? 24 : size === "md" ? 36 : 56

  const image = gameImagePath(slug)
  if (image) {
    return (
      <span aria-hidden="true" className={box}>
        {/* Arquivo estático pequeno (128px): serve direto, sem passar pelo otimizador de imagens. */}
        <Image src={image} alt="" width={px} height={px} unoptimized className="size-full object-cover" />
      </span>
    )
  }

  const brand = GAME_BRAND_ICONS[slug]
  if (brand) {
    return (
      <span aria-hidden="true" style={{ background: brand.background }} className={box}>
        <svg viewBox="0 0 24 24" className="size-[62%] fill-white" focusable="false">
          <path d={brand.d} />
        </svg>
      </span>
    )
  }

  return (
    <span
      aria-hidden="true"
      style={{ background: gameIconBackground(slug) }}
      className={cn(
        box,
        "font-bold tracking-tight text-white",
        size === "sm" && "text-[10px]",
        size === "md" && "text-xs",
        size === "lg" && "text-lg",
      )}
    >
      {gameInitials(name)}
    </span>
  )
}
