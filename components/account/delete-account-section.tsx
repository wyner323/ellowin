"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Loader2, Trash2 } from "lucide-react"
import { requestAccountDeletion } from "@/app/actions/account"
import { authClient } from "@/lib/auth-client"
import type { DeletionBlocker } from "@/lib/account-deletion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const PHRASE = "excluir minha conta"

/**
 * Área de risco de "Minha conta". Com pendências (saldo, pedido em andamento,
 * anúncio ativo), só mostra o que falta resolver — nem abre o formulário de
 * confirmação, pra não deixar a pessoa tentar uma exclusão que vai falhar.
 */
export function DeleteAccountSection({ blockers }: { blockers: DeletionBlocker[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  if (done) {
    return (
      <p className="text-sm text-muted-foreground">
        Conta excluída. Você será desconectado em instantes…
      </p>
    )
  }

  if (blockers.length > 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Antes de excluir sua conta, resolva o que está pendente:
        </p>
        <ul className="flex flex-col gap-2">
          {blockers.map((b) => (
            <li key={b.code} className="flex items-start gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold-text" aria-hidden="true" />
              {b.message}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Isso anonimiza seu perfil (nome, apelido e telefone) e impede novos logins.
          Pedidos e avaliações continuam existindo para a outra parte, e alguns dados são
          mantidos pelo prazo exigido em lei. Não pode ser desfeito.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="size-4" />
          Excluir minha conta
        </Button>
      </div>
    )
  }

  function submit() {
    setError(null)
    start(async () => {
      const result = await requestAccountDeletion({ confirm })
      if (!result.ok) {
        setError(result.error ?? "Não foi possível excluir a conta.")
        return
      }
      setDone(true)
      await authClient.signOut().catch(() => {})
      router.push("/")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm text-muted-foreground">
        Para confirmar, digite <strong className="text-foreground">{PHRASE}</strong> abaixo. Esta
        ação não pode ser desfeita.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm-delete" className="sr-only">
          Frase de confirmação
        </Label>
        <Input
          id="confirm-delete"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={PHRASE}
          autoComplete="off"
          disabled={pending}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={pending || confirm.trim().toLowerCase() !== PHRASE}
          onClick={submit}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Excluir definitivamente
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            setOpen(false)
            setConfirm("")
            setError(null)
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  )
}
