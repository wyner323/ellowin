"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus, SlidersHorizontal, Trash2 } from "lucide-react"
import { createProduct, updateProduct, type VariantInput } from "@/app/actions/products"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { GameProductPicker, type PickerSelection } from "@/components/seller/game-product-picker"
import { ProductImageUploader } from "@/components/seller/product-image-uploader"
import {
  DEFAULT_MANUAL_DELIVERY_TIME,
  DELIVERY_TIME_OPTIONS,
  INSTANT_DELIVERY_TIME,
} from "@/lib/delivery"

const CATEGORIES = [
  { value: "contas", label: "Contas de jogos" },
  { value: "moedas", label: "Moedas e gold" },
  { value: "gift-cards", label: "Gift cards" },
  { value: "boosting", label: "Boosting e serviços" },
]

type Row = VariantInput & { id?: number }

const EMPTY_ROW: Row = { label: "", price: "", stock: "1", deliveryNote: "" }

/**
 * Cadastro e edição de anúncio.
 *
 * Cada linha de "item" é uma variante com preço e estoque próprios — é o que o
 * comprador escolhe na página do produto, no estilo GGMax.
 */
export function ProductForm({
  product,
  defaultGame,
}: {
  defaultGame?: string
  product?: {
    id: number
    title: string
    categorySlug: string
    game: string | null
    description: string
    deliveryType: string
    deliveryTime: string
    images?: string[]
    variants: {
      id: number
      label: string
      priceCents: number
      stock: number
      deliveryNote: string | null
      active: boolean
    }[]
  }
}) {
  const router = useRouter()
  const editing = Boolean(product)

  const [title, setTitle] = useState(product?.title ?? "")
  const [categorySlug, setCategorySlug] = useState(product?.categorySlug ?? "")
  const [game, setGame] = useState(product?.game ?? "")
  const [description, setDescription] = useState(product?.description ?? "")
  const [deliveryType, setDeliveryType] = useState(product?.deliveryType ?? "manual")
  const [deliveryTime, setDeliveryTime] = useState(
    product?.deliveryType === "automatica"
      ? INSTANT_DELIVERY_TIME
      : (product?.deliveryTime ?? DEFAULT_MANUAL_DELIVERY_TIME),
  )
  const [images, setImages] = useState<string[]>(product?.images ?? [])

  const [rows, setRows] = useState<Row[]>(
    product?.variants.filter((v) => v.active).length
      ? product.variants
          .filter((v) => v.active)
          .map((v) => ({
            id: v.id,
            label: v.label,
            price: (v.priceCents / 100).toFixed(2).replace(".", ","),
            stock: String(v.stock),
            deliveryNote: v.deliveryNote ?? "",
          }))
      : [{ ...EMPTY_ROW }],
  )

  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // Ao editar um anúncio existente, pula direto pro formulário — o picker é
  // só pra ajudar a começar do zero.
  const [pickerResolved, setPickerResolved] = useState(editing)

  function applyPickerSelection(selection: PickerSelection) {
    setCategorySlug(selection.categorySlug)
    setGame(selection.game)
    setTitle(selection.title)
    setDeliveryType(selection.deliveryType)
    setDeliveryTime(selection.deliveryTime)
    setRows(selection.variants.map((label) => ({ label, price: "", stock: "1", deliveryNote: "" })))
    setPickerResolved(true)
  }

  function changeDeliveryType(value: string) {
    const next = value === "automatica" ? "automatica" : "manual"
    setDeliveryType(next)
    // Entrega automática é sempre instantânea — não existe "prazo" pra ela.
    if (next === "automatica") setDeliveryTime(INSTANT_DELIVERY_TIME)
    else if (deliveryTime === INSTANT_DELIVERY_TIME) setDeliveryTime(DEFAULT_MANUAL_DELIVERY_TIME)
  }

  function patchRow(index: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    )
  }

  function submit() {
    setError(null)

    start(async () => {
      const payload = {
        title,
        categorySlug,
        game,
        description,
        deliveryType,
        deliveryTime,
        images,
        variants: rows,
      }

      const result = product
        ? await updateProduct({ productId: product.id, ...payload })
        : await createProduct(payload)

      if (!result.ok) {
        setError(result.error ?? "Não foi possível salvar o anúncio.")
        return
      }

      router.push("/painel/vendedor/produtos")
      router.refresh()
    })
  }

  if (!pickerResolved) {
    return (
      <GameProductPicker
        defaultGame={defaultGame}
        onSelect={applyPickerSelection}
        onManual={() => setPickerResolved(true)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Sobre o anúncio</h2>
          {!editing ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPickerResolved(false)}
            >
              <SlidersHorizontal className="size-3.5" />
              Trocar sugestão
            </Button>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="title">Título</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Robux entrega imediata via Gamepass"
            disabled={pending}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="category">Categoria</Label>
            <Select
              value={categorySlug}
              onValueChange={(value) => setCategorySlug(value ?? "")}
            >
              <SelectTrigger id="category">
                <SelectValue placeholder="Selecione" />
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
            <Label htmlFor="game">Jogo ou plataforma</Label>
            <Input
              id="game"
              value={game}
              onChange={(e) => setGame(e.target.value)}
              placeholder="Ex.: Roblox"
              disabled={pending}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="description">O que o comprador recebe</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Explique o que está incluído, como funciona a entrega e o que o comprador precisa informar."
            rows={5}
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">
            {description.trim().length}/20 caracteres mínimos
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="deliveryType">Tipo de entrega</Label>
            <Select value={deliveryType} onValueChange={(value) => changeDeliveryType(value ?? "manual")}>
              <SelectTrigger id="deliveryType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual (combinada com o comprador)</SelectItem>
                <SelectItem value="automatica">Automática</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="deliveryTime">Prazo de entrega</Label>
            {deliveryType === "automatica" ? (
              <div
                id="deliveryTime"
                className="flex h-9 items-center rounded-lg border border-input bg-muted/50 px-3 text-sm text-muted-foreground"
              >
                {INSTANT_DELIVERY_TIME}
              </div>
            ) : (
              <Select value={deliveryTime} onValueChange={(value) => setDeliveryTime(value ?? DEFAULT_MANUAL_DELIVERY_TIME)}>
                <SelectTrigger id="deliveryTime">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* Anúncios antigos podem ter um prazo em texto livre que não é
                      mais uma opção — mantém ele selecionável em vez de sumir. */}
                  {deliveryTime && !DELIVERY_TIME_OPTIONS.some((o) => o.label === deliveryTime) ? (
                    <SelectItem value={deliveryTime}>{deliveryTime}</SelectItem>
                  ) : null}
                  {DELIVERY_TIME_OPTIONS.map((option) => (
                    <SelectItem key={option.label} value={option.label}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">Fotos do anúncio</h2>
          <p className="text-xs text-muted-foreground">
            Anúncios com imagem chamam mais atenção na vitrine. Opcional.
          </p>
        </div>

        <ProductImageUploader value={images} onChange={setImages} disabled={pending} />
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">Itens à venda</h2>
          <p className="text-xs text-muted-foreground">
            Cada item é uma opção que o comprador escolhe, com preço e estoque
            próprios.
          </p>
        </div>

        <ul className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <li
              key={row.id ?? `new-${index}`}
              className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4"
            >
              <div className="grid gap-3 sm:grid-cols-[1fr_130px_100px]">
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`label-${index}`}>Nome do item</Label>
                  <Input
                    id={`label-${index}`}
                    value={row.label}
                    onChange={(e) => patchRow(index, { label: e.target.value })}
                    placeholder="Ex.: 1.000 Robux"
                    disabled={pending}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor={`price-${index}`}>Preço (R$)</Label>
                  <Input
                    id={`price-${index}`}
                    value={row.price}
                    onChange={(e) => patchRow(index, { price: e.target.value })}
                    placeholder="49,90"
                    inputMode="decimal"
                    disabled={pending}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor={`stock-${index}`}>Estoque</Label>
                  <Input
                    id={`stock-${index}`}
                    value={row.stock}
                    onChange={(e) => patchRow(index, { stock: e.target.value })}
                    inputMode="numeric"
                    disabled={pending}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex min-w-60 flex-1 flex-col gap-2">
                  <Label htmlFor={`note-${index}`}>Observação (opcional)</Label>
                  <Input
                    id={`note-${index}`}
                    value={row.deliveryNote ?? ""}
                    onChange={(e) => patchRow(index, { deliveryNote: e.target.value })}
                    placeholder="Ex.: entrega em até 10 minutos"
                    disabled={pending}
                  />
                </div>

                {rows.length > 1 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setRows((current) => current.filter((_, i) => i !== index))
                    }
                    disabled={pending}
                  >
                    <Trash2 className="size-4" />
                    Remover
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setRows((current) => [...current, { ...EMPTY_ROW }])}
          disabled={pending}
          className="self-start"
        >
          <Plus className="size-4" />
          Adicionar item
        </Button>
      </section>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {editing ? "Salvar alterações" : "Publicar anúncio"}
        </Button>
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
