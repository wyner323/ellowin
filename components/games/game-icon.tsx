import { cn } from "@/lib/utils"
import { gameIconBackground, gameInitials } from "@/lib/game-icon"

/**
 * Ícone do jogo (iniciais sobre a cor do jogo). Decorativo: o nome do jogo já aparece em texto ao lado,
 * então fica escondido de leitores de tela.
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
  return (
    <span
      aria-hidden="true"
      style={{ background: gameIconBackground(slug) }}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center font-bold tracking-tight text-white shadow-sm ring-1 ring-white/10",
        size === "sm" && "size-6 rounded-md text-[10px]",
        size === "md" && "size-9 rounded-lg text-xs",
        size === "lg" && "size-14 rounded-xl text-lg",
        className,
      )}
    >
      {gameInitials(name)}
    </span>
  )
}
