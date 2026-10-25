"use client"

import { Button } from "@/components/ui/button"
import type { CannedReply } from "@/lib/canned-replies"

/**
 * Fileira de respostas prontas: cada botão entrega o texto ao pai, que decide onde colocá-lo (nada é enviado sozinho).
 * São botões de verdade (teclado e leitor de tela), e o grupo tem nome.
 */
export function CannedReplies({
  label,
  replies,
  onPick,
  disabled,
}: {
  label: string
  replies: CannedReply[]
  onPick: (text: string) => void
  disabled?: boolean
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}:</span>
      {replies.map((reply) => (
        <Button
          key={reply.id}
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs"
          disabled={disabled}
          onClick={() => onPick(reply.text)}
        >
          {reply.label}
        </Button>
      ))}
    </div>
  )
}
