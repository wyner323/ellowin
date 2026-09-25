"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, ShieldCheck } from "lucide-react"
import { completeProfile } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  formatBirthDate,
  formatCpf,
  formatPhone,
  isValidBirthDate,
  isValidCpf,
  isValidDisplayName,
  isValidFullName,
  isValidPhone,
  onlyDigits,
} from "@/lib/validation"

/**
 * Passo obrigatório depois do primeiro login com Google: a Ellowin exige nome
 * legal, CPF, celular e nascimento (≥ 18 anos) de todo mundo que negocia.
 */
export function CompleteProfileForm({
  defaultName,
  email,
  next,
}: {
  defaultName: string
  email: string
  next: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fullName, setFullName] = useState(defaultName)
  const [displayName, setDisplayName] = useState("")
  const [phone, setPhone] = useState("")
  const [cpf, setCpf] = useState("")
  const [birthDate, setBirthDate] = useState("")
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  const valid =
    isValidFullName(fullName) &&
    (!displayName || isValidDisplayName(displayName)) &&
    isValidPhone(phone) &&
    isValidCpf(cpf) &&
    isValidBirthDate(birthDate) &&
    acceptedTerms

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid) return
    setError(null)
    startTransition(async () => {
      const result = await completeProfile({ fullName, displayName, phone, cpf, birthDate, acceptedTerms })
      if (!result.ok) {
        setError(result.error ?? "Não foi possível salvar seus dados.")
        return
      }
      router.push(next)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-lg flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Complete seu cadastro</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Você entrou como <strong className="text-foreground">{email}</strong>. Falta só o que a
          Ellowin exige de quem compra e vende: é o que protege cada negociação.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="fullName">Nome completo</Label>
        <Input
          id="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          placeholder="Maria Souza Almeida"
        />
        <p className="text-xs text-muted-foreground">Como aparece no seu documento oficial.</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">Apelido (opcional)</Label>
        <Input
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value.slice(0, 20))}
          autoComplete="nickname"
          placeholder="Como quer ser chamado no site"
        />
        <p className="text-xs text-muted-foreground">
          Aparece no chat e nas avaliações no lugar do seu nome.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">Celular</Label>
          <Input
            id="phone"
            type="tel"
            value={formatPhone(phone)}
            onChange={(e) => setPhone(onlyDigits(e.target.value).slice(0, 11))}
            autoComplete="tel"
            placeholder="(11) 90000-0000"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="birthDate">Data de nascimento</Label>
          <Input
            id="birthDate"
            value={formatBirthDate(birthDate)}
            onChange={(e) => setBirthDate(formatBirthDate(e.target.value))}
            inputMode="numeric"
            placeholder="dd/mm/aaaa"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="cpf">CPF</Label>
        <Input
          id="cpf"
          value={formatCpf(cpf)}
          onChange={(e) => setCpf(onlyDigits(e.target.value).slice(0, 11))}
          inputMode="numeric"
          placeholder="000.000.000-00"
        />
        <p className="text-xs text-muted-foreground">
          {cpf.length === 11 && !isValidCpf(cpf)
            ? "Dígitos verificadores não conferem."
            : "Não pode se repetir na plataforma e nunca é exibido para outros usuários."}
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Usamos o CPF apenas para prevenir fraudes e liberar saques. É necessário ter 18 anos ou mais.
        </p>
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id="terms"
          checked={acceptedTerms}
          onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
        />
        <Label htmlFor="terms" className="text-sm leading-relaxed font-normal">
          Li e aceito os{" "}
          <a href="/termos" target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
            termos de uso
          </a>
          .
        </Label>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending || !valid}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Salvando
          </>
        ) : (
          "Concluir cadastro"
        )}
      </Button>
    </form>
  )
}
