"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2, Mail, RotateCw } from "lucide-react"
import { resendEmailCode, verifyEmailCode } from "@/app/actions/auth"
import { OtpInput } from "@/components/auth/otp-input"
import { Button } from "@/components/ui/button"

const SIGNUP_FALLBACK_KEY = "ellowin:signup-otp-fallback"

export function EmailVerification({
  email,
  redirectTo = "/conta",
}: {
  email: string
  redirectTo?: string
}) {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [demoCode, setDemoCode] = useState<string | null>(null)
  const [verifying, startVerify] = useTransition()
  const [resending, startResend] = useTransition()

  useEffect(() => {
    const raw = sessionStorage.getItem(SIGNUP_FALLBACK_KEY)
    if (!raw) return
    sessionStorage.removeItem(SIGNUP_FALLBACK_KEY)
    try {
      const { code: fallbackCode, message } = JSON.parse(raw) as {
        code?: string
        message?: string
      }
      if (fallbackCode) setDemoCode(fallbackCode)
      if (message) setNotice(message)
    } catch {
      // ignora fallback malformado
    }
  }, [])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    startVerify(async () => {
      const result = await verifyEmailCode(code)
      if (!result.ok) {
        setError(result.error ?? "Código inválido.")
        return
      }
      router.push(redirectTo)
      router.refresh()
    })
  }

  function resend() {
    setError(null)
    setNotice(null)
    startResend(async () => {
      const result = await resendEmailCode()
      if (!result.ok) {
        setError(result.error ?? "Falha no envio.")
        return
      }
      setCode("")
      setDemoCode(result.demoCode ?? null)
      setNotice(result.message ?? "Código reenviado.")
    })
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-6">
      <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Mail className="size-6" aria-hidden="true" />
      </span>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Confirme seu email</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Enviamos um código de 6 dígitos para{" "}
          <strong className="font-medium text-foreground">{email}</strong>. Ele expira em 10
          minutos.
        </p>
      </div>

      <OtpInput value={code} onChange={setCode} disabled={verifying} />

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {notice && (
        <p className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          {notice}
        </p>
      )}

      {demoCode && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Modo demonstração
          </span>
          <span className="font-mono text-2xl font-semibold tracking-[0.35em] text-foreground">
            {demoCode}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={code.length !== 6 || verifying} className="flex-1">
          {verifying ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Verificando
            </>
          ) : (
            "Confirmar email"
          )}
        </Button>
        <Button type="button" variant="outline" onClick={resend} disabled={resending}>
          {resending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <RotateCw className="size-4" aria-hidden="true" />
          )}
          Reenviar
        </Button>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Não encontrou o email? Verifique a caixa de spam ou a aba de promoções antes de solicitar
        um novo código.
      </p>
    </form>
  )
}
