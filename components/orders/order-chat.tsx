"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, MessageCircle, RefreshCw, Send } from "lucide-react"
import { fetchOrderMessages, postOrderMessage } from "@/app/actions/orders"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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

const MAX_LENGTH = 2000

function timestamp(date: Date) {
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function initialsFor(name: string | null, role: string) {
  const source = name?.trim() || ROLE_LABEL[role] || role
  return source.slice(0, 2).toUpperCase()
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
  counterpartyName,
}: {
  orderId: number
  messages: OrderChatMessage[]
  viewerRole: "buyer" | "seller"
  counterpartyName: string
}) {
  const router = useRouter()
  const [messages, setMessages] = useState<OrderChatMessage[]>(initialMessages)
  const [body, setBody] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [pending, start] = useTransition()

  const listRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastSeenId = useRef<number>(initialMessages.at(-1)?.id ?? 0)

  // Abre o chat já rolado para a mensagem mais recente, sem animação.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [])

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

  function onComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      if (!pending && body.trim().length >= 2) send()
    }
  }

  const nearLimit = body.length > MAX_LENGTH - 200

  return (
    <div className="flex h-[30rem] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-5 py-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate text-sm font-semibold">
            Conversa com {counterpartyName}
          </h2>
          <p className="text-xs text-muted-foreground">
            Combine os detalhes da entrega por aqui.
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[0.7rem] font-medium text-success">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/70" />
            <span className="relative inline-flex size-1.5 rounded-full bg-success" />
          </span>
          Ao vivo
          {syncing ? <RefreshCw className="size-3 animate-spin" aria-hidden="true" /> : null}
        </span>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <MessageCircle className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm text-muted-foreground">
              Nenhuma mensagem ainda.
              <br />
              Use o chat para combinar a entrega.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {messages.map((message, index) => {
              const isSystem = message.authorRole === "system"
              const mine = !isSystem && message.authorRole === viewerRole

              return (
                <li
                  key={message.id}
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                  className={cn(
                    "flex animate-in fade-in slide-in-from-bottom-2 gap-2.5 fill-mode-both duration-300",
                    mine ? "flex-row-reverse" : "flex-row",
                    isSystem && "justify-center",
                  )}
                >
                  {isSystem ? (
                    <div className="max-w-[85%] rounded-full border border-border bg-muted/60 px-3.5 py-1.5 text-center text-xs text-muted-foreground">
                      {message.body}
                    </div>
                  ) : (
                    <>
                      <Avatar size="sm" className="mt-0.5">
                        <AvatarFallback
                          className={cn(
                            "font-semibold",
                            mine
                              ? "bg-primary/15 text-primary"
                              : "bg-secondary text-secondary-foreground",
                          )}
                        >
                          {initialsFor(message.authorName, message.authorRole)}
                        </AvatarFallback>
                      </Avatar>

                      <div
                        className={cn(
                          "flex max-w-[75%] flex-col gap-1",
                          mine ? "items-end" : "items-start",
                        )}
                      >
                        <span className="px-1 text-[0.7rem] font-medium text-muted-foreground">
                          {message.authorName ?? ROLE_LABEL[message.authorRole] ?? message.authorRole}
                        </span>
                        <div
                          className={cn(
                            "rounded-2xl px-3.5 py-2.5 shadow-sm",
                            mine
                              ? "rounded-tr-sm bg-primary text-primary-foreground"
                              : "rounded-tl-sm border border-border bg-muted/50 text-foreground",
                          )}
                        >
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {message.body}
                          </p>
                        </div>
                        <time
                          className={cn(
                            "px-1 text-[0.65rem] text-muted-foreground",
                          )}
                        >
                          {timestamp(message.createdAt)}
                        </time>
                      </div>
                    </>
                  )}
                </li>
              )
            })}
            <div ref={bottomRef} aria-hidden="true" />
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border bg-muted/20 p-3.5">
        <div className="flex items-end gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX_LENGTH))}
            onKeyDown={onComposerKeyDown}
            placeholder="Escreva sua mensagem... (Enter para enviar)"
            rows={1}
            disabled={pending}
            aria-label="Nova mensagem"
            className="max-h-32 min-h-10 flex-1 resize-none bg-background"
          />
          <Button
            onClick={send}
            disabled={pending || body.trim().length < 2}
            size="icon"
            className="size-10 shrink-0 rounded-full"
            aria-label="Enviar mensagem"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>

        <div className="flex items-center justify-between px-1">
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : (
            <span />
          )}
          {nearLimit ? (
            <span
              className={cn(
                "text-[0.65rem] text-muted-foreground",
                body.length >= MAX_LENGTH && "text-destructive",
              )}
            >
              {body.length}/{MAX_LENGTH}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
