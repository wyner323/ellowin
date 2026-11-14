import Image from "next/image"
import {
  BookOpen,
  Coins,
  Gift,
  KeyRound,
  Package,
  Rocket,
  Share2,
  Sparkles,
  UserRound,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Category } from "@/lib/catalog"

/** Ícone de cada categoria; usado no lugar da ilustração quando a categoria não tem arte própria. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  contas: UserRound,
  moedas: Coins,
  itens: Package,
  "gift-cards": Gift,
  recargas: Zap,
  assinaturas: Sparkles,
  keys: KeyRound,
  "redes-sociais": Share2,
  cursos: BookOpen,
  boosting: Rocket,
}

export function categoryIcon(slug: string): LucideIcon {
  return CATEGORY_ICONS[slug] ?? Package
}

/**
 * Arte da categoria: a ilustração quando existe, senão um bloco com o ícone. Ocupa o espaço do pai (que define a proporção
 * e o `relative`), então serve no card da home e no cabeçalho da página da categoria.
 */
export function CategoryArt({
  category,
  sizes,
  className,
  imageClassName,
}: {
  category: Pick<Category, "slug" | "name" | "image">
  sizes: string
  className?: string
  imageClassName?: string
}) {
  if (category.image) {
    return (
      <Image
        src={category.image}
        alt={`Ilustração do catálogo de ${category.name}`}
        fill
        sizes={sizes}
        className={cn("object-cover", imageClassName)}
      />
    )
  }
  const Icon = CATEGORY_ICONS[category.slug] ?? Package
  return (
    <div
      className={cn("absolute inset-0 flex items-center justify-center bg-primary/10 text-primary", className)}
      aria-hidden="true"
    >
      <Icon className="size-1/4 min-h-10 min-w-10" strokeWidth={1.5} />
    </div>
  )
}
