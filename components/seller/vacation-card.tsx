"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Palmtree, Play } from "lucide-react"
import { toast } from "sonner"
import { setStoreVacation } from "@/app/actions/vacation"
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
import { Button } from "@/components/ui/button"

/**
 * Modo férias: tira todos os anúncios ativos da vitrine de uma vez e volta com um clique. Em férias, o
 * cartão vira um aviso com o botão de voltar; ativo, é um convite discreto (só aparece com anúncios ativos).
 */
export function VacationCard({ active, onVacation }: { active: number; onVacation: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run(on: boolean) {
    setError(null)
    start(async () => {
      const result = await setStoreVacation(on)
      if (result.ok) {
        toast.success(result.message ?? (on ? "Loja em férias." : "Loja de volta."))
        router.refresh()
      } else {
        setError(result.error ?? "Não foi possível concluir a ação.")
      }
    })
  }

  if (onVacation > 0) {
    return (
      <section aria-label="Modo férias" className="flex flex-col gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Palmtree className="mt-0.5 size-5 shrink-0 text-gold-text" aria-hidden="true" />
          <div className="flex flex-col gap-0.5">
            <p className="font-medium">Sua loja está em férias</p>
            <p className="text-sm text-muted-foreground">
              {onVacation === 1 ? "1 anúncio está" : `${onVacation} anúncios estão`} fora da vitrine. Pedidos que você já recebeu continuam valendo: entregue dentro do prazo.
            </p>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        </div>
        <Button onClick={() => run(false)} disabled={pending} className="shrink-0">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
          Voltar a vender
        </Button>
      </section>
    )
  }

  if (active === 0) return null

  return (
    <section aria-label="Modo férias" className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Palmtree className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="flex flex-col gap-0.5">
          <p className="font-medium">Vai ficar um tempo sem entregar?</p>
          <p className="text-sm text-muted-foreground">Coloque a loja em férias: seus anúncios saem da vitrine de uma vez e voltam com um clique.</p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </div>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button variant="outline" disabled={pending} className="shrink-0">
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Palmtree className="size-4" aria-hidden="true" />}
              Modo férias
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Colocar a loja em férias?</AlertDialogTitle>
            <AlertDialogDescription>
              {active === 1 ? "O anúncio ativo sai" : `Os ${active} anúncios ativos saem`} da vitrine e ninguém consegue comprar até você voltar. Anúncios que você já pausou continuam como estão, e pedidos em andamento seguem valendo: entregue dentro do prazo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(true)}>Colocar em férias</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
