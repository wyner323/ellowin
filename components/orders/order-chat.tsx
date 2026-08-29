"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, RefreshCw, Send } from "lucide-react"
import { fetchOrderMessages, postOrderMessage } from "@/app/actions/orders"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export type OrderChatMessage = {
  id: number
  authorId: string | null
  authorRole: string
  authorName: string | null
  body: string
  createdAt: Date
}

const ROLE_LABEL: Record<string, string> = {
  buyer: "Comprador",
  seller: "Vendedor",
  system: "Sistema",
}

function timestamp(date: Date) {
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** Intervalo do polling do chat. Curto o bastante para parecer "ao vivo". */
const POLL_INTERVAL = 4000

/**
 * Chat do pedido, pra comprador e vendedor combinarem a entrega.
 *
 * Mesmo padrão do chat de disputa (`DisputeChat`): polling pausado com a aba
 * em segundo plano, sincroniza ao voltar o foco. Aqui não existe nota interna
 * nem papel de moderador — é só entre as duas partes do pedido.
 */
export function OrderChat({
  orderId,
  messages: initialMessages,
  viewerRole,
}: {
  orderId: number
  messages: OrderChatMessage[]
  viewerRole: "buyer" | "seller"
}) {
  const router = useRouter()
  const [messages, setMessages] = useState<OrderChatMessage[]>(initialMessages)
  const [body, setBody] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [pending, start] = useTransition()

  const bottomRef = useRef<HTMLDivElement>(null)
  const lastSeenId = useRef<number>(initialMessages.at(-1)?.id ?? 0)

  useEffect(() => {
    setMessages((current) => {
      const latestKnown = current.at(-1)?.id ?? 0
      const latestIncoming = initialMessages.at(-1)?.id ?? 0
      return latestIncoming >= latestKnown ? initialMessages : current
    })
  }, [initialMessages])

  const sync = useCallback(async () => {
    setSyncing(true)
    try {
      const result = await fetchOrderMessages(orderId)
      if (result.ok) setMessages(result.messages as OrderChatMessage[])
    } catch {
      // Falha de rede momentânea: o próximo ciclo tenta de novo.
    } finally {
      setSyncing(false)
    }
  }, [orderId])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    function startPolling() {
      if (timer) return
      timer = setInterval(sync, POLL_INTERVAL)
    }
    function stopPolling() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        void sync()
        startPolling()
      } else {
        stopPolling()
      }
    }

    if (document.visibilityState === "visible") startPolling()
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("focus", sync)

    return () => {
      stopPolling()
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("focus", sync)
    }
  }, [sync])

  useEffect(() => {
    const latestId = messages.at(-1)?.id ?? 0
    if (latestId > lastSeenId.current) {
      lastSeenId.current = latestId
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    }
  }, [messages])

  function send() {
    setError(null)
    start(async () => {
      const result = await postOrderMessage({ orderId, body })
      if (!result.ok) {
        setError(result.error ?? "Não foi possível enviar a mensagem.")
        return
      }
      setBody("")
      await sync()
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        Atualização automática ativada
        {syncing ? <RefreshCw className="size-3 animate-spin" aria-hidden="true" /> : null}
      </div>

      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma mensagem ainda. Use o chat para combinar a entrega.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((message) => {
            const isSystem = message.authorRole === "system"
            const mine = !isSystem && message.authorRole === viewerRole

            return (
              <li
                key={message.id}
                className={cn(
                  "flex flex-col gap-1",
                  mine ? "items-end" : "items-start",
                  isSystem && "items-center",
                )}
              >
                <div
                  className={cn(
                    "flex max-w-[85%] flex-col gap-1 rounded-xl border px-3.5 py-2.5",
                    isSystem
                      ? "border-border bg-muted/60 text-center"
                      : mine
                        ? "border-primary/40 bg-primary/10"
                        : "border-border bg-card",
                  )}
                >
                  <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    {message.authorName && !isSystem
                      ? `${ROLE_LABEL[message.authorRole] ?? message.authorRole} · ${message.authorName}`
                      : (ROLE_LABEL[message.authorRole] ?? message.authorRole)}
                  </span>

                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                    {message.body}
                  </p>

                  <time className="text-[0.7rem] text-muted-foreground">
                    {timestamp(message.createdAt)}
                  </time>
                </div>
              </li>
            )
          })}
          <div ref={bottomRef} aria-hidden="true" />
        </ul>
      )}

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escreva sua mensagem..."
          rows={3}
          disabled={pending}
          aria-label="Nova mensagem"
        />

        <div className="flex items-center justify-end gap-3">
          <Button onClick={send} disabled={pending || body.trim().length < 2}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Enviar
          </Button>
        </div>

        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
