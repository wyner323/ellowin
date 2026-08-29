"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  Loader2,
  ShieldCheck,
} from "lucide-react"
import { registerUser } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  cpfRegion,
  formatBirthDate,
  formatCpf,
  formatPhone,
  isValidBirthDate,
  isValidCpf,
  isValidDisplayName,
  isValidEmail,
  isValidFullName,
  isValidPassword,
  isValidPhone,
  onlyDigits,
  passwordScore,
} from "@/lib/validation"

type Form = {
  fullName: string
  displayName: string
  email: string
  phone: string
  cpf: string
  birthDate: string
  password: string
  acceptedTerms: boolean
}

const STEPS = ["Identificação", "Documento", "Acesso"]

export function RegisterWizard() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<Form>({
    fullName: "",
    displayName: "",
    email: "",
    phone: "",
    cpf: "",
    birthDate: "",
    password: "",
    acceptedTerms: false,
  })

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setError(null)
  }

  const cpfValid = isValidCpf(form.cpf)
  const region = useMemo(() => (cpfValid ? cpfRegion(form.cpf) : null), [cpfValid, form.cpf])
  const score = passwordScore(form.password)

  const stepValid = [
    isValidFullName(form.fullName) &&
      isValidEmail(form.email) &&
      isValidPhone(form.phone) &&
      (!form.displayName || isValidDisplayName(form.displayName)),
    cpfValid && isValidBirthDate(form.birthDate),
    isValidPassword(form.password) && form.acceptedTerms,
  ][step]

  function next() {
    if (!stepValid) return
    if (step < 2) {
      setStep(step + 1)
      return
    }

    startTransition(async () => {
      const result = await registerUser(form)
      if (!result.ok) {
        setError(result.error ?? "Não foi possível concluir o cadastro.")
        if (
          result.field === "email" ||
          result.field === "phone" ||
          result.field === "fullName" ||
          result.field === "displayName"
        )
          setStep(0)
        if (result.field === "cpf" || result.field === "birthDate") setStep(1)
        return
      }
      if (result.demoCode) {
        sessionStorage.setItem(
          "ellowin:signup-otp-fallback",
          JSON.stringify({ code: result.demoCode, message: result.message }),
        )
      }
      router.push("/verificar-email")
      router.refresh()
    })
  }

  return (
    <div className="w-full max-w-lg">
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between text-xs font-medium">
          {STEPS.map((label, index) => (
            <span
              key={label}
              className={
                index <= step ? "text-primary" : "text-muted-foreground"
              }
            >
              {index < step ? (
                <span className="flex items-center gap-1">
                  <Check className="size-3.5" aria-hidden="true" />
                  {label}
                </span>
              ) : (
                label
              )}
            </span>
          ))}
        </div>
        <Progress value={((step + 1) / 3) * 100} className="h-1.5" />
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-balance">
        {step === 0 && "Crie sua conta Ellowin"}
        {step === 1 && "Confirme seu documento"}
        {step === 2 && "Defina sua senha"}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {step === 0 && "Precisamos dos seus dados de contato para proteger cada negociação."}
        {step === 1 && "O CPF é validado pelos dígitos verificadores e não pode se repetir na plataforma."}
        {step === 2 && "Última etapa: escolha uma senha forte e aceite os termos."}
      </p>

      <div className="mt-8 flex flex-col gap-5">
        {step === 0 && (
          <>
            <Field
              id="fullName"
              label="Nome completo"
              value={form.fullName}
              onChange={(v) => set("fullName", v)}
              placeholder="Maria Souza Almeida"
              autoComplete="name"
              valid={isValidFullName(form.fullName)}
              hint="Como aparece no seu documento oficial."
            />
            <Field
              id="displayName"
              label="Apelido (opcional)"
              value={form.displayName}
              onChange={(v) => set("displayName", v.slice(0, 20))}
              placeholder="Como quer ser chamado no site"
              autoComplete="nickname"
              valid={form.displayName.length > 0 && isValidDisplayName(form.displayName)}
              invalid={form.displayName.length > 0 && !isValidDisplayName(form.displayName)}
              hint="Aparece no chat e nas avaliações no lugar do seu nome — pode deixar em branco e definir depois."
            />
            <Field
              id="email"
              label="Email"
              type="email"
              value={form.email}
              onChange={(v) => set("email", v)}
              placeholder="voce@email.com"
              autoComplete="email"
              valid={isValidEmail(form.email)}
              hint="Enviaremos um código de 6 dígitos para confirmar."
            />
            <Field
              id="phone"
              label="Celular"
              type="tel"
              value={formatPhone(form.phone)}
              onChange={(v) => set("phone", onlyDigits(v).slice(0, 11))}
              placeholder="(11) 90000-0000"
              autoComplete="tel"
              valid={isValidPhone(form.phone)}
              hint="Usado na verificação em duas etapas e no suporte."
            />
          </>
        )}

        {step === 1 && (
          <>
            <Field
              id="cpf"
              label="CPF"
              value={formatCpf(form.cpf)}
              onChange={(v) => set("cpf", onlyDigits(v).slice(0, 11))}
              placeholder="000.000.000-00"
              inputMode="numeric"
              valid={cpfValid}
              hint={
                form.cpf.replace(/\D/g, "").length === 11 && !cpfValid
                  ? "Dígitos verificadores não conferem."
                  : region
                    ? `CPF válido — emitido na região ${region}.`
                    : "Validamos o cálculo oficial de módulo 11."
              }
              invalid={form.cpf.replace(/\D/g, "").length === 11 && !cpfValid}
            />
            <Field
              id="birthDate"
              label="Data de nascimento"
              value={formatBirthDate(form.birthDate)}
              onChange={(v) => set("birthDate", formatBirthDate(v))}
              placeholder="dd/mm/aaaa"
              inputMode="numeric"
              valid={isValidBirthDate(form.birthDate)}
              hint="É necessário ter 18 anos ou mais."
            />
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Seu CPF é usado apenas para prevenir fraudes e liberar saques. Nunca é exibido
                para outros usuários da Ellowin.
              </p>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <Field
              id="password"
              label="Senha"
              type="password"
              value={form.password}
              onChange={(v) => set("password", v)}
              placeholder="Mínimo de 8 caracteres"
              autoComplete="new-password"
              valid={isValidPassword(form.password)}
              hint="Combine letras, números e um símbolo."
            />
            <div className="flex items-center gap-2" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-full ${
                    i < score ? "bg-primary" : "bg-border"
                  }`}
                />
              ))}
            </div>
            <label className="flex items-start gap-3 text-sm leading-relaxed">
              <Checkbox
                checked={form.acceptedTerms}
                onCheckedChange={(checked) => set("acceptedTerms", checked === true)}
                className="mt-0.5"
              />
              <span className="text-muted-foreground">
                Li e aceito os{" "}
                <Link href="/termos" className="text-primary underline-offset-4 hover:underline">
                  termos de uso
                </Link>{" "}
                e a política de privacidade da Ellowin.
              </span>
            </label>
          </>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          {step > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(step - 1)}
              disabled={pending}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Voltar
            </Button>
          )}
          <Button
            type="button"
            onClick={next}
            disabled={!stepValid || pending}
            className="flex-1"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Criando conta
              </>
            ) : step === 2 ? (
              <>
                <BadgeCheck className="size-4" aria-hidden="true" />
                Criar conta
              </>
            ) : (
              <>
                Continuar
                <ArrowRight className="size-4" aria-hidden="true" />
              </>
            )}
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link href="/entrar" className="font-medium text-primary underline-offset-4 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  valid,
  invalid,
  ...props
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  valid?: boolean
  invalid?: boolean
} & Omit<React.ComponentProps<typeof Input>, "onChange" | "value" | "id">) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
          className={valid ? "pr-9" : undefined}
          {...props}
        />
        {valid && (
          <Check
            className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-primary"
            aria-hidden="true"
          />
        )}
      </div>
      {hint && (
        <p className={`text-xs ${invalid ? "text-destructive" : "text-muted-foreground"}`}>
          {hint}
        </p>
      )}
    </div>
  )
}
