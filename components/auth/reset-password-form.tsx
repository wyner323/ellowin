"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react"
import { resetPassword } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function ResetPasswordForm({ token }: { token: string }) {
  const [pending, startTransition] = useTransition()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError("As senhas não são iguais.")
      return
    }

    startTransition(async () => {
      const result = await resetPassword({ token, password })
      if (!result.ok) {
        setError(result.error ?? "Não foi possível redefinir a senha.")
        return
      }
      setDone(true)
    })
  }

  if (done) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-6">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-success/15 text-success">
          <CheckCircle2 className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Senha alterada</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Por segurança, todas as sessões abertas foram encerradas. Entre com a senha nova.
          </p>
        </div>
        <Button render={<Link href="/entrar" />}>Entrar</Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Criar nova senha</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Use 8 ou mais caracteres, com letras e números.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Nova senha</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Repita a nova senha</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}{" "}
          {error.startsWith("Link") ? (
            <Link href="/esqueci-senha" className="font-medium underline underline-offset-4">
              Pedir novo link
            </Link>
          ) : null}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Salvando
          </>
        ) : (
          <>
            <KeyRound className="size-4" aria-hidden="true" />
            Salvar nova senha
          </>
        )}
      </Button>
    </form>
  )
}
