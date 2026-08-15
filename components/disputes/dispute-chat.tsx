"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Lock, RefreshCw, Send } from "lucide-react"
import { fetchDisputeMessages, postDisputeMessage } from "@/app/actions/disputes"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export type ChatMessage = {
  id: number
  authorId: string | null
  authorRole: string
  authorName: string | null
  body: string
  internal: boolean
  createdAt: Date
}

const ROLE_LABEL: Record<string, string> = {
  buyer: "Comprador",
  seller: "Vendedor",
  moderator: "Suporte Ellowin",
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

/**
 * Histórico e envio de mensagens da disputa.
 *
 * O mesmo componente serve às partes e à moderação: `canPostInternal` habilita
 * as notas internas, que o servidor também revalida antes de gravar.
 */
/** Intervalo do polling do chat. Curto o bastante para parecer "ao vivo". */
const POLL_INTERVAL = 4000

export function DisputeChat({
  disputeId,
  messages: initialMessages,
  viewerRole,
  canPostInternal = false,
  closed = false,
}: {
  disputeId: number
  messages: ChatMessage[]
  viewerRole: "buyer" | "seller" | "moderator"
  canPostInternal?: boolean
  closed?: boolean
}) {
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [body, setBody] = useState("")
  const [internal, setInternal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [pending, start] = useTransition()

  // Referência ao fim da lista para rolar automaticamente quando chega mensagem.
  const bottomRef = useRef<HTMLDivElement>(null)
  // Guarda o id da última mensagem já vista para só rolar quando há novidade.
  const lastSeenId = useRef<number>(initialMessages.at(-1)?.id ?? 0)

  // Se o servidor reenviar o histórico (ex.: após encerrar o caso), adota-o.
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
      const result = await fetchDisputeMessages(disputeId)
      if (result.ok) setMessages(result.messages as ChatMessage[])
    } catch {
      // Falha de rede momentânea: o próximo ciclo tenta de novo.
    } finally {
      setSyncing(false)
    }
  }, [disputeId])

  // Polling enquanto a disputa está aberta, pausado com a aba em segundo plano
  // para não gastar requisições à toa. Volta a sincronizar assim que retorna.
  useEffect(() => {
    if (closed) return

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
  }, [closed, sync])

  // Rola para a última mensagem sempre que surge algo novo.
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
      const result = await postDisputeMessage({ disputeId, body, internal })
      if (!result.ok) {
        setError(result.error ?? "Não foi possível enviar a mensagem.")
        return
      }
      setBody("")
      await sync()
      // Mantém o resto da página (prazos, status) em dia sem recarregar tudo.
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {!closed ? (
        <div className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          Atualização automática ativada
          {syncing ? (
            <RefreshCw className="size-3 animate-spin" aria-hidden="true" />
          ) : null}
        </div>
      ) : null}

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
                  message.internal && "border-chart-4/50 bg-chart-4/10",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    {message.authorName && !isSystem
                      ? `${ROLE_LABEL[message.authorRole] ?? message.authorRole} · ${message.authorName}`
                      : (ROLE_LABEL[message.authorRole] ?? message.authorRole)}
                  </span>
                  {message.internal ? (
                    <span className="flex items-center gap-1 rounded-full bg-chart-4/20 px-2 py-0.5 text-[0.65rem] font-medium text-chart-4">
                      <Lock className="size-2.5" aria-hidden="true" />
                      Nota interna
                    </span>
                  ) : null}
                </div>

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

      {closed ? (
        <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Esta disputa foi encerrada. O histórico continua disponível para consulta.
        </p>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              internal
                ? "Nota visível apenas para a moderação."
                : "Escreva sua mensagem..."
            }
            rows={3}
            disabled={pending}
            aria-label="Nova mensagem"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            {canPostInternal ? (
              <Label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                <Checkbox
                  checked={internal}
                  onCheckedChange={(checked) => setInternal(checked === true)}
                  disabled={pending}
                />
                Registrar como nota interna
              </Label>
            ) : (
              <span />
            )}

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
      )}
    </div>
  )
}
