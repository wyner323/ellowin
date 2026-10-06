"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowDownToLine, ArrowUpFromLine, Clock, KeyRound } from "lucide-react"
import { addFunds, requestWithdrawal } from "@/app/actions/wallet"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { centsToInput, formatCents, parseToCents } from "@/lib/money"
import type { PayoutState } from "@/lib/payout"
import { PIX_TYPE_LABEL, formatRemaining } from "@/lib/pix"

const MIN_WITHDRAWAL_CENTS = 1000 // espelha requestWithdrawal (app/actions/wallet.ts)

/**
 * Depósito e saque da carteira interna.
 *
 * Os dois são simulados (não há gateway): o depósito dá saldo para exercitar a
 * custódia de ponta a ponta, e o saque só debita o saldo — nenhum Pix real sai.
 * As regras de verdade (mínimo, trava de 24h, vendedor aprovado) continuam no
 * servidor; aqui só se evita o clique que sabidamente vai falhar.
 */
export function WalletForms({
  availableCents,
  payout,
}: {
  availableCents: number
  payout: PayoutState
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <DepositCard />
      <WithdrawCard availableCents={availableCents} payout={payout} />
    </div>
  )
}

function CardHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="outline" className="ml-auto text-[0.65rem]">
          Simulado
        </Badge>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
    </>
  )
}

function DepositCard() {
  const [amount, setAmount] = useState("")
  const [pending, start] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    start(async () => {
      const result = await addFunds(amount)
      if (result.ok) {
        toast.success(result.message ?? "Operação concluída.")
        setAmount("")
      } else {
        toast.error(result.error ?? "Não foi possível concluir.")
      }
    })
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
    >
      <CardHeader
        icon={<ArrowDownToLine className="size-4" aria-hidden="true" />}
        title="Adicionar saldo"
        description="Depósito simulado para testar compras: o valor entra no saldo, sem cobrança real."
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="amount-in" className="text-xs">
          Valor em reais
        </Label>
        <Input
          id="amount-in"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="150,00"
          inputMode="decimal"
          disabled={pending}
        />
      </div>

      <Button type="submit" size="sm" className="mt-auto" disabled={pending || !amount.trim()}>
        {pending ? "Processando..." : "Adicionar"}
      </Button>
    </form>
  )
}

function WithdrawCard({
  availableCents,
  payout,
}: {
  availableCents: number
  payout: PayoutState
}) {
  const [amount, setAmount] = useState("")
  const [pending, start] = useTransition()

  const cents = parseToCents(amount)
  const tooLow = cents !== null && cents < MIN_WITHDRAWAL_CENTS
  const tooHigh = cents !== null && cents > availableCents
  const valid = cents !== null && !tooLow && !tooHigh

  function confirm() {
    start(async () => {
      const result = await requestWithdrawal(amount)
      if (result.ok) {
        toast.success(result.message ?? "Operação concluída.")
        setAmount("")
      } else {
        toast.error(result.error ?? "Não foi possível concluir.")
      }
    })
  }

  const header = (
    <CardHeader
      icon={<ArrowUpFromLine className="size-4" aria-hidden="true" />}
      title="Solicitar saque"
      description="Saque simulado: o valor sai do saldo disponível, mas nenhum Pix real é enviado até o gateway entrar. Valores em custódia não entram."
    />
  )

  if (payout.kind === "unavailable") {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        {header}
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
          <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {payout.reason === "not_seller"
            ? "Saques são para vendedores aprovados. Conclua o cadastro de vendedor e informe sua chave Pix para sacar."
            : "Cadastre uma chave Pix no seu cadastro de vendedor para poder sacar."}
        </div>
        <Button render={<Link href="/vender" />} size="sm" variant="outline">
          Concluir cadastro de vendedor
        </Button>
      </div>
    )
  }

  const pixLabel = PIX_TYPE_LABEL[payout.pixType] ?? "Chave Pix"

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      {header}

      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-xs">
        <span className="text-muted-foreground">Destino · {pixLabel}</span>
        <span className="font-medium tabular-nums">{payout.destination}</span>
      </div>

      {payout.kind === "locked" ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-border p-3 text-xs leading-relaxed text-muted-foreground"
        >
          <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Por segurança, saques ficam bloqueados por 24 horas depois de trocar a chave Pix.
          Libera em cerca de {formatRemaining(payout.secondsLeft)}.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="amount-out" className="text-xs">
                Valor em reais
              </Label>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
                disabled={pending || availableCents < MIN_WITHDRAWAL_CENTS}
                onClick={() => setAmount(centsToInput(availableCents))}
              >
                Sacar tudo ({formatCents(availableCents)})
              </button>
            </div>
            <Input
              id="amount-out"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="150,00"
              inputMode="decimal"
              disabled={pending || availableCents < MIN_WITHDRAWAL_CENTS}
              aria-invalid={tooLow || tooHigh}
              aria-describedby="amount-out-hint"
            />
            <p
              id="amount-out-hint"
              className={
                tooLow || tooHigh
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
              }
            >
              {availableCents < MIN_WITHDRAWAL_CENTS
                ? `Você precisa de pelo menos ${formatCents(MIN_WITHDRAWAL_CENTS)} disponíveis para sacar.`
                : tooLow
                  ? `O saque mínimo é ${formatCents(MIN_WITHDRAWAL_CENTS)}.`
                  : tooHigh
                    ? `Acima do saldo disponível (${formatCents(availableCents)}).`
                    : `Mínimo ${formatCents(MIN_WITHDRAWAL_CENTS)} · disponível ${formatCents(availableCents)}`}
            </p>
          </div>

          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button size="sm" disabled={pending || !valid}>
                  {pending ? "Processando..." : "Sacar"}
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar saque?</AlertDialogTitle>
                <AlertDialogDescription>
                  {cents !== null ? formatCents(cents) : ""} saem do seu saldo agora, para{" "}
                  {pixLabel} {payout.destination}. Como o gateway ainda não está ativo, é uma
                  simulação: nenhum Pix real será enviado.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Voltar</AlertDialogCancel>
                <AlertDialogAction onClick={confirm}>Confirmar saque</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  )
}
