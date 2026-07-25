"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  BadgeCheck,
  Check,
  FileCheck2,
  Loader2,
  Lock,
  Mail,
  Send,
  Smartphone,
  Store,
  Upload,
  Wallet,
} from "lucide-react"
import { sendPhoneCode, verifyPhoneCode } from "@/app/actions/auth"
import {
  advanceContactStep,
  saveKycStep,
  savePayoutStep,
  saveStoreStep,
} from "@/app/actions/seller"
import { OtpInput } from "@/components/auth/otp-input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { AccountState } from "@/lib/session"
import { formatCpf, formatPhone } from "@/lib/validation"

const STEPS = [
  { title: "Dados da loja", icon: Store, level: 1 },
  { title: "Email confirmado", icon: Mail, level: 1 },
  { title: "Telefone confirmado", icon: Smartphone, level: 2 },
  { title: "Documento (KYC)", icon: FileCheck2, level: 3 },
  { title: "Dados de saque", icon: Wallet, level: 4 },
]

const CATEGORIES = [
  { value: "contas", label: "Contas de jogos" },
  { value: "moedas", label: "Moedas e gold" },
  { value: "gift-cards", label: "Gift cards" },
  { value: "boosting", label: "Boosting e serviços" },
]

export function SellerWizard({ state }: { state: AccountState }) {
  const router = useRouter()

  const storeDone = Boolean(state.seller?.storeName)
  const kycDone = Boolean(state.seller?.documentNumber)
  const payoutDone = Boolean(state.seller?.pixKey)

  const completion = [
    storeDone,
    state.emailVerified,
    state.phoneVerified,
    kycDone,
    payoutDone,
  ]
  const firstOpen = completion.findIndex((done) => !done)
  const [active, setActive] = useState(firstOpen === -1 ? 4 : firstOpen)
  const progress = (completion.filter(Boolean).length / 5) * 100
  const currentLevel = payoutDone ? 4 : kycDone ? 3 : state.phoneVerified ? 2 : 1

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Nível de vendedor {currentLevel} de 4</p>
            <p className="text-xs text-muted-foreground">
              {payoutDone
                ? "Cadastro concluído — sua loja pode publicar anúncios."
                : "Complete as etapas para liberar anúncios e saques."}
            </p>
          </div>
          <span className="text-sm font-semibold text-primary">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="mt-4 h-2" />
      </div>

      <div className="flex flex-col gap-3">
        {STEPS.map((step, index) => {
          const done = completion[index]
          const isActive = active === index
          const locked = index > 0 && !completion[index - 1] && !done

          return (
            <section
              key={step.title}
              className={`rounded-xl border bg-card transition-colors ${
                isActive ? "border-primary" : "border-border"
              }`}
            >
              <button
                type="button"
                onClick={() => !locked && setActive(isActive ? -1 : index)}
                aria-expanded={isActive}
                disabled={locked}
                className="flex w-full items-center gap-3 px-5 py-4 text-left disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                    done
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : locked ? (
                    <Lock className="size-4" aria-hidden="true" />
                  ) : (
                    <step.icon className="size-4" aria-hidden="true" />
                  )}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium">
                    Etapa {index + 1} — {step.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {done
                      ? "Concluída"
                      : locked
                        ? "Conclua a etapa anterior para liberar"
                        : `Libera o nível ${step.level}`}
                  </span>
                </span>
              </button>

              {isActive && !locked && (
                <div className="border-t border-border px-5 py-5">
                  {index === 0 && (
                    <StoreStep
                      initial={state.seller}
                      done={storeDone}
                      onDone={() => {
                        router.refresh()
                        setActive(1)
                      }}
                    />
                  )}
                  {index === 1 && (
                    <EmailStep
                      email={state.email}
                      done={state.emailVerified}
                      onDone={() => setActive(2)}
                    />
                  )}
                  {index === 2 && (
                    <PhoneStep
                      phone={state.phone}
                      done={state.phoneVerified}
                      onDone={() => {
                        router.refresh()
                        setActive(3)
                      }}
                    />
                  )}
                  {index === 3 && (
                    <KycStep
                      cpf={state.cpf}
                      done={kycDone}
                      onDone={() => {
                        router.refresh()
                        setActive(4)
                      }}
                    />
                  )}
                  {index === 4 && (
                    <PayoutStep
                      cpf={state.cpf}
                      done={payoutDone}
                      onDone={() => router.refresh()}
                    />
                  )}
                </div>
              )}
            </section>
          )
        })}
      </div>

      {payoutDone && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-5 py-4">
          <BadgeCheck className="size-5 text-primary" aria-hidden="true" />
          <p className="flex-1 text-sm text-foreground">
            Cadastro de vendedor aprovado. Sua loja já pode publicar anúncios.
          </p>
          <Button render={<Link href="/conta" />} size="sm">
            Ir para a conta
          </Button>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function Feedback({ value }: { value: { ok: boolean; text: string } | null }) {
  if (!value?.text) return null
  return (
    <p
      role={value.ok ? undefined : "alert"}
      className={`rounded-lg border px-4 py-3 text-sm ${
        value.ok
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-destructive/40 bg-destructive/10 text-destructive"
      }`}
    >
      {value.text}
    </p>
  )
}

function StoreStep({
  initial,
  done,
  onDone,
}: {
  initial: AccountState["seller"]
  done: boolean
  onDone: () => void
}) {
  const [storeName, setStoreName] = useState(initial?.storeName ?? "")
  const [category, setCategory] = useState(initial?.category ?? "")
  const [description, setDescription] = useState("")
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setFeedback(null)
    start(async () => {
      const result = await saveStoreStep({ storeName, category, description })
      if (!result.ok) {
        setFeedback({ ok: false, text: result.error ?? "Erro ao salvar." })
        return
      }
      onDone()
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="storeName">Nome da loja</Label>
        <Input
          id="storeName"
          value={storeName}
          onChange={(event) => setStoreName(event.target.value)}
          placeholder="Ex.: RadiantStore"
        />
        <p className="text-xs text-muted-foreground">
          É o nome que os compradores veem nos seus anúncios.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="category">Categoria principal</Label>
        <Select
          value={category}
          onValueChange={(value) => setCategory(value ?? "")}
        >
          <SelectTrigger id="category">
            <SelectValue placeholder="Selecione uma categoria" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">O que você vende</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Descreva sua operação, origem dos produtos e prazo médio de entrega."
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          {description.trim().length}/30 caracteres mínimos
        </p>
      </div>

      <Feedback value={feedback} />

      <Button type="submit" disabled={pending} className="self-start">
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {done ? "Atualizar dados" : "Salvar e continuar"}
      </Button>
    </form>
  )
}

function EmailStep({
  email,
  done,
  onDone,
}: {
  email: string
  done: boolean
  onDone: () => void
}) {
  if (done) {
    return (
      <p className="text-sm text-muted-foreground">
        Email <strong className="font-medium text-foreground">{email}</strong> confirmado.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Confirme o email <strong className="font-medium text-foreground">{email}</strong> antes de
        seguir. Sem o email confirmado não é possível receber notificações de venda.
      </p>
      <Button
        render={<Link href="/verificar-email?next=/vender" />}
        size="sm"
        className="self-start"
        onClick={onDone}
      >
        Confirmar email agora
      </Button>
    </div>
  )
}

function PhoneStep({
  phone,
  done,
  onDone,
}: {
  phone: string | null
  done: boolean
  onDone: () => void
}) {
  const [code, setCode] = useState("")
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [sending, startSend] = useTransition()
  const [verifying, startVerify] = useTransition()

  if (done) {
    return (
      <p className="text-sm text-muted-foreground">
        Telefone{" "}
        <strong className="font-medium text-foreground">
          {phone ? formatPhone(phone) : ""}
        </strong>{" "}
        confirmado.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Vamos enviar um código para {phone ? formatPhone(phone) : "seu telefone"}. No ambiente de
        testes o código chega no seu email confirmado.
      </p>

      <Button
        size="sm"
        variant="outline"
        className="self-start"
        disabled={sending}
        onClick={() => {
          setFeedback(null)
          startSend(async () => {
            const result = await sendPhoneCode()
            setFeedback({ ok: result.ok, text: result.error ?? result.message ?? "" })
          })
        }}
      >
        {sending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="size-4" aria-hidden="true" />
        )}
        Enviar código
      </Button>

      <OtpInput value={code} onChange={setCode} disabled={verifying} />
      <Feedback value={feedback} />

      <Button
        size="sm"
        className="self-start"
        disabled={code.length !== 6 || verifying}
        onClick={() => {
          setFeedback(null)
          startVerify(async () => {
            const result = await verifyPhoneCode(code)
            if (!result.ok) {
              setFeedback({ ok: false, text: result.error ?? "Código inválido." })
              return
            }
            await advanceContactStep(4)
            onDone()
          })
        }}
      >
        {verifying && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        Confirmar telefone
      </Button>
    </div>
  )
}

function KycStep({
  cpf,
  done,
  onDone,
}: {
  cpf: string | null
  done: boolean
  onDone: () => void
}) {
  const [documentType, setDocumentType] = useState("cpf")
  const [documentNumber, setDocumentNumber] = useState(cpf ? formatCpf(cpf) : "")
  const [documentFrontName, setDocumentFrontName] = useState("")
  const [selfieName, setSelfieName] = useState("")
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  if (done) {
    return (
      <p className="text-sm text-muted-foreground">
        Documentos recebidos e em análise. Você já pode seguir para os dados de saque.
      </p>
    )
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setFeedback(null)
    start(async () => {
      const result = await saveKycStep({
        documentType,
        documentNumber,
        documentFrontName,
        selfieName,
      })
      if (!result.ok) {
        setFeedback({ ok: false, text: result.error ?? "Erro ao enviar." })
        return
      }
      onDone()
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="documentType">Tipo de documento</Label>
        <Select
          value={documentType}
          onValueChange={(value) => setDocumentType(value ?? "cpf")}
        >
          <SelectTrigger id="documentType">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cpf">CPF</SelectItem>
            <SelectItem value="cnh">CNH</SelectItem>
            <SelectItem value="rg">RG</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="documentNumber">Número do documento</Label>
        <Input
          id="documentNumber"
          value={documentType === "cpf" ? formatCpf(documentNumber) : documentNumber}
          onChange={(event) => setDocumentNumber(event.target.value)}
          inputMode="numeric"
          placeholder={documentType === "cpf" ? "000.000.000-00" : "Somente números"}
        />
        {documentType === "cpf" && (
          <p className="text-xs text-muted-foreground">
            Precisa ser o mesmo CPF informado no cadastro da conta.
          </p>
        )}
      </div>

      <FileField
        id="documentFront"
        label="Frente do documento"
        value={documentFrontName}
        onChange={setDocumentFrontName}
      />
      <FileField
        id="selfie"
        label="Selfie segurando o documento"
        value={selfieName}
        onChange={setSelfieName}
      />

      <Feedback value={feedback} />

      <Button type="submit" disabled={pending} className="self-start">
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        Enviar para análise
      </Button>
    </form>
  )
}

function PayoutStep({
  cpf,
  done,
  onDone,
}: {
  cpf: string | null
  done: boolean
  onDone: () => void
}) {
  const [pixKeyType, setPixKeyType] = useState("cpf")
  const [pixKey, setPixKey] = useState(cpf ? formatCpf(cpf) : "")
  const [bankHolder, setBankHolder] = useState("")
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  if (done) {
    return (
      <p className="text-sm text-muted-foreground">
        Chave PIX cadastrada. Seus saques cairão nessa conta em até 30 minutos após a liberação.
      </p>
    )
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setFeedback(null)
    start(async () => {
      const result = await savePayoutStep({ pixKeyType, pixKey, bankHolder, acceptedTerms })
      if (!result.ok) {
        setFeedback({ ok: false, text: result.error ?? "Erro ao salvar." })
        return
      }
      onDone()
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="pixKeyType">Tipo de chave PIX</Label>
        <Select
          value={pixKeyType}
          onValueChange={(value) => setPixKeyType(value ?? "cpf")}
        >
          <SelectTrigger id="pixKeyType">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cpf">CPF</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="telefone">Telefone</SelectItem>
            <SelectItem value="aleatoria">Chave aleatória</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="pixKey">Chave PIX</Label>
        <Input
          id="pixKey"
          value={pixKeyType === "cpf" ? formatCpf(pixKey) : pixKey}
          onChange={(event) => setPixKey(event.target.value)}
          placeholder={
            pixKeyType === "cpf"
              ? "000.000.000-00"
              : pixKeyType === "email"
                ? "voce@email.com"
                : pixKeyType === "telefone"
                  ? "(11) 90000-0000"
                  : "Chave de 32 caracteres"
          }
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="bankHolder">Titular da conta</Label>
        <Input
          id="bankHolder"
          value={bankHolder}
          onChange={(event) => setBankHolder(event.target.value)}
          placeholder="Nome completo do titular"
        />
        <p className="text-xs text-muted-foreground">
          A conta precisa estar no seu nome para liberar saques.
        </p>
      </div>

      <label className="flex items-start gap-3 text-sm leading-relaxed">
        <Checkbox
          checked={acceptedTerms}
          onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
          className="mt-0.5"
        />
        <span className="text-muted-foreground">
          Aceito os termos do programa de vendedores, incluindo a retenção do valor até a
          confirmação de entrega pelo comprador.
        </span>
      </label>

      <Feedback value={feedback} />

      <Button type="submit" disabled={pending} className="self-start">
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        Concluir cadastro
      </Button>
    </form>
  )
}

function FileField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <label
        htmlFor={id}
        className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-4 text-sm transition-colors hover:border-primary"
      >
        <Upload className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className={value ? "font-medium" : "text-muted-foreground"}>
          {value || "Selecionar arquivo (JPG ou PNG)"}
        </span>
      </label>
      <input
        id={id}
        type="file"
        accept="image/png,image/jpeg"
        className="sr-only"
        onChange={(event) => onChange(event.target.files?.[0]?.name ?? "")}
      />
    </div>
  )
}
