"use client"

import { useId, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { addStock, removeStock } from "@/app/actions/delivery-stock"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MAX_STOCK_BATCH } from "@/lib/delivery-stock-lines"

type Item = { id: number; mask: string }

/**
 * Estoque de UM item do anúncio: cola os itens (um por linha), mostra quantos há e uma lista só com a máscara dos
 * disponíveis. O conteúdo nunca volta para a tela; para corrigir um item, apaga a linha e cadastra de novo.
 */
export function StockManager({
  variantId,
  label,
  available,
  sold,
  items,
  disabled,
}: {
  variantId: number
  label: string
  available: number
  sold: number
  items: Item[]
  /** sem a chave de cifra o cadastro fica desligado (o servidor também recusa) */
  disabled?: boolean
}) {
  const id = useId()
  const router = useRouter()
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [removing, setRemoving] = useState<number | null>(null)

  function submit() {
    setError(null)
    start(async () => {
      const result = await addStock(variantId, text)
      if (result.ok) {
        toast.success(result.message ?? "Itens cadastrados.")
        setText("")
        router.refresh()
      } else {
        setError(result.error ?? "Não foi possível cadastrar os itens.")
      }
    })
  }

  function remove(itemId: number) {
    setError(null)
    setRemoving(itemId)
    start(async () => {
      const result = await removeStock(itemId)
      setRemoving(null)
      if (result.ok) {
        toast.success(result.message ?? "Item removido.")
        router.refresh()
      } else {
        setError(result.error ?? "Não foi possível remover o item.")
      }
    })
  }

  return (
    <section aria-labelledby={`${id}-titulo`} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`${id}-titulo`} className="font-display text-base font-bold tracking-tight">
          {label}
        </h2>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground tabular-nums">{available}</strong> {available === 1 ? "disponível" : "disponíveis"} ·{" "}
          <span className="tabular-nums">{sold}</span> {sold === 1 ? "vendido" : "vendidos"}
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-itens`} className="text-sm font-medium">
          Adicionar itens
        </label>
        <Textarea
          id={`${id}-itens`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={5}
          placeholder={"Um item por linha. Ex.:\nXXXX-YYYY-ZZZZ-0001\nXXXX-YYYY-ZZZZ-0002"}
          disabled={pending || disabled}
          spellCheck={false}
          autoComplete="off"
          className="font-mono text-sm"
          aria-describedby={`${id}-ajuda`}
          aria-invalid={error ? true : undefined}
        />
        <p id={`${id}-ajuda`} className="text-xs leading-relaxed text-muted-foreground">
          Até {MAX_STOCK_BATCH} por vez. Cada linha vira um item entregue a um comprador. Depois de salvos, os itens ficam cifrados e não
          aparecem de novo aqui; um item vendido não volta ao estoque nem se o pedido for reembolsado.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div>
          <Button onClick={submit} disabled={pending || disabled || text.trim() === ""}>
            {pending && removing === null ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Cadastrar itens
          </Button>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-sm font-medium">Disponíveis (do mais antigo ao mais novo)</h3>
          <ul className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <code className="text-sm tabular-nums">{item.mask}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(item.id)}
                  disabled={pending}
                  aria-label={`Apagar o item ${item.mask}`}
                >
                  {removing === item.id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
                  Apagar
                </Button>
              </li>
            ))}
          </ul>
          {available > items.length ? (
            <p className="text-xs text-muted-foreground">Mostrando os {items.length} mais antigos de {available}.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
