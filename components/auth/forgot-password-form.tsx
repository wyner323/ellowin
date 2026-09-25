"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, MailCheck, Send } from "lucide-react"
import { requestPasswordReset } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function ForgotPasswordForm() {
  const [pending, startTransition] = useTransition()
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await requestPasswordReset({ email })
      if (!result.ok) {
        setError(result.error ?? "Não foi possível enviar o link.")
        return
      }
      setSentTo(email.trim().toLowerCase())
    })
  }

  if (sentTo) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-6">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-success/15 text-success">
          <MailCheck className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Confira seu email</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Se existir uma conta com <strong className="text-foreground">{sentTo}</strong>, enviamos um
            link para redefinir a senha. Ele vale por 1 hora e só pode ser usado uma vez.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Não chegou? Olhe a caixa de spam e espere alguns minutos antes de pedir de novo.
          </p>
        </div>
        <Link
          href="/entrar"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar para entrar
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Esqueci minha senha</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Informe o email da sua conta e enviamos um link para você criar uma senha nova.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="voce@email.com"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Enviando
          </>
        ) : (
          <>
            <Send className="size-4" aria-hidden="true" />
            Enviar link
          </>
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Lembrou?{" "}
        <Link href="/entrar" className="font-medium text-primary underline-offset-4 hover:underline">
          Voltar para entrar
        </Link>
      </p>
    </form>
  )
}
