import { CornerDownRight } from "lucide-react"

/**
 * Resposta do vendedor a uma avaliação, mostrada logo abaixo dela (anúncio, loja e pedido). O texto é do vendedor e
 * entra como texto (nunca HTML); o rótulo deixa claro quem está falando.
 */
export function ReviewReplyView({ reply, sellerName }: { reply: { body: string; updatedAt: Date } | null; sellerName?: string }) {
  if (!reply) return null
  return (
    <div className="mt-1 flex gap-2 rounded-lg bg-muted/50 p-3">
      <CornerDownRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium">Resposta do vendedor{sellerName ? ` (${sellerName})` : ""}</span>
        <p className="text-sm leading-relaxed break-words text-muted-foreground">{reply.body}</p>
        <span className="text-xs text-muted-foreground">
          {reply.updatedAt.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}
        </span>
      </div>
    </div>
  )
}
