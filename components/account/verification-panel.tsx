"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  Mail,
  Send,
  Smartphone,
} from "lucide-react"
import { sendPhoneCode, verifyPhoneCode } from "@/app/actions/auth"
import { OtpInput } from "@/components/auth/otp-input"
import { Button } from "@/components/ui/button"
import { formatPhone } from "@/lib/validation"

export function VerificationPanel({
  emailVerified,
  email,
  phone,
  phoneVerified,
}: {
  emailVerified: boolean
  email: string
  phone: string | null
  phoneVerified: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState("")
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [sending, startSend] = useTransition()
  const [verifying, startVerify] = useTransition()

  function send() {
    setFeedback(null)
    startSend(async () => {
      const result = await sendPhoneCode()
      setFeedback({ ok: result.ok, text: result.error ?? result.message ?? "" })
      if (result.ok) setOpen(true)
    })
  }

  function verify() {
    setFeedback(null)
    startVerify(async () => {
      const result = await verifyPhoneCode(code)
      if (!result.ok) {
        setFeedback({ ok: false, text: result.error ?? "Código inválido." })
        return
      }
      setOpen(false)
      setCode("")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      <Row
        icon={Mail}
        title="Email"
        subtitle={email}
        done={emailVerified}
        action={
          !emailVerified && (
            <Button render={<Link href="/verificar-email" />} size="sm">
              Confirmar
            </Button>
          )
        }
      />

      <Row
        icon={Smartphone}
        title="Telefone"
        subtitle={phone ? formatPhone(phone) : "Nenhum telefone cadastrado"}
        done={phoneVerified}
        action={
          !phoneVerified &&
          phone && (
            <Button size="sm" variant="outline" onClick={send} disabled={sending}>
              {sending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
              Enviar código
            </Button>
          )
        }
      />

      {open && !phoneVerified && (
        <div className="flex flex-col gap-4 py-5">
          <p className="text-sm text-muted-foreground">
            Digite o código de 6 dígitos enviado para confirmar o telefone.
          </p>
          <OtpInput value={code} onChange={setCode} disabled={verifying} />
          <div className="flex gap-3">
            <Button size="sm" onClick={verify} disabled={code.length !== 6 || verifying}>
              {verifying && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Confirmar telefone
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {feedback && (
        <p
          role={feedback.ok ? undefined : "alert"}
          className={`py-4 text-sm ${feedback.ok ? "text-primary" : "text-destructive"}`}
        >
          {feedback.text}
        </p>
      )}
    </div>
  )
}

function Row({
  icon: Icon,
  title,
  subtitle,
  done,
  action,
}: {
  icon: typeof Mail
  title: string
  subtitle: string
  done: boolean
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-4">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
          done ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        }`}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          {title}
          {done ? (
            <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
          ) : (
            <CircleDashed className="size-4 text-muted-foreground" aria-hidden="true" />
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {done ? (
        <span className="text-xs font-medium text-primary">Verificado</span>
      ) : (
        action
      )}
    </div>
  )
}
