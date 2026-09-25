"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  AlignLeft,
  Coins,
  Gift,
  Handshake,
  ImageIcon,
  Loader2,
  Package,
  Plus,
  Rocket,
  SlidersHorizontal,
  Trash2,
  Truck,
  UserRound,
  Zap,
} from "lucide-react"
import { createProduct, updateProduct, type VariantInput } from "@/app/actions/products"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ChoiceCards, Field, FormSection, type ChoiceOption } from "@/components/seller/form-kit"
import { GameProductPicker, type PickerSelection } from "@/components/seller/game-product-picker"
import { ListingChecklist, ListingPreview } from "@/components/seller/listing-preview"
import { ProductImageUploader } from "@/components/seller/product-image-uploader"
import {
  DEFAULT_MANUAL_DELIVERY_TIME,
  DELIVERY_TIME_OPTIONS,
  INSTANT_DELIVERY_TIME,
} from "@/lib/delivery"
import { ACCOUNT_ORIGIN_OPTIONS } from "@/lib/account-origin"
import {
  MAX_DESCRIPTION,
  MAX_TITLE,
  MIN_DESCRIPTION,
  isListingReady,
  isRowValid,
  listingChecks,
} from "@/lib/listing-checks"
import { formatCents, parseToCents, splitOrderAmount } from "@/lib/money"

const CATEGORIES: ChoiceOption[] = [
  { value: "contas", label: "Contas de jogos", description: "Perfis prontos para jogar", icon: UserRound },
  { value: "moedas", label: "Moedas e itens", description: "Gold, skins, créditos, itens", icon: Coins },
  { value: "gift-cards", label: "Gift cards", description: "Cartões e assinaturas", icon: Gift },
  { value: "boosting", label: "Boosting e serviços", description: "Elo, coaching, missões", icon: Rocket },
]

type Row = VariantInput & { id?: number }

const EMPTY_ROW: Row = { label: "", price: "", stock: "1", deliveryNote: "" }

/**
 * Cadastro e edição de anúncio.
 *
 * Cada linha de "item" é uma variante com preço e estoque próprios — é o que o
 * comprador escolhe na página do produto, no estilo GGMax. À direita (ou no fim,
 * no celular) fica a prévia do anúncio na vitrine e a lista do que falta.
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
    accountOrigin?: string | null
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
  const [accountOrigin, setAccountOrigin] = useState(product?.accountOrigin ?? "")
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
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const checks = listingChecks({ title, categorySlug, description, accountOrigin, rows }, images.length)
  const ready = isListingReady(checks)
  const done = (key: string) => checks.find((c) => c.key === key)?.ok ?? false

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
        accountOrigin,
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
      <div className="mx-auto w-full max-w-3xl">
        <GameProductPicker
          defaultGame={defaultGame}
          onSelect={applyPickerSelection}
          onManual={() => setPickerResolved(true)}
        />
      </div>
    )
  }

  const deliveryTypeOptions: ChoiceOption[] = [
    {
      value: "manual",
      label: "Manual",
      description: "Você entrega os dados no chat do pedido, dentro do prazo que escolher.",
      icon: Handshake,
    },
    {
      value: "automatica",
      label: "Automática",
      description: "Entrega imediata, sem prazo — o comprador recebe assim que paga.",
      icon: Zap,
    },
  ]

  // Anúncios antigos podem ter um prazo em texto livre que não é mais uma opção —
  // mantém ele selecionável em vez de sumir.
  const timeOptions: ChoiceOption[] = [
    ...(deliveryTime && !DELIVERY_TIME_OPTIONS.some((o) => o.label === deliveryTime)
      ? [{ value: deliveryTime, label: deliveryTime }]
      : []),
    ...DELIVERY_TIME_OPTIONS.map((o) => ({ value: o.label, label: o.label })),
  ]

  const originOptions: ChoiceOption[] = ACCOUNT_ORIGIN_OPTIONS.map((o) => ({
    value: o.id,
    label: o.label,
    description: o.retainsRecoveryData
      ? "O comprador vê um aviso de risco no anúncio."
      : undefined,
  }))

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="flex flex-col gap-5">
        <FormSection
          id="sobre"
          icon={AlignLeft}
          title="Sobre o anúncio"
          description="O título e a descrição são o que convence o comprador — seja específico."
          complete={done("title") && done("category") && done("description") && (categorySlug !== "contas" || done("origin"))}
          action={
            !editing ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setPickerResolved(false)}>
                <SlidersHorizontal className="size-3.5" />
                Trocar sugestão
              </Button>
            ) : null
          }
        >
          <Field
            label="Título"
            htmlFor="title"
            counter={`${title.length}/${MAX_TITLE}`}
            hint="Inclua o jogo e o que é vendido. Ex.: “Conta Valorant Imortal — 40 skins”."
          >
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Robux entrega imediata via Gamepass"
              maxLength={MAX_TITLE}
              disabled={pending}
            />
          </Field>

          <div className="flex flex-col gap-2">
            <span className="text-sm leading-none font-medium" id="category-label">
              Categoria
            </span>
            <ChoiceCards
              name="category"
              legend="Categoria do anúncio"
              value={categorySlug}
              onChange={setCategorySlug}
              options={CATEGORIES}
              columns={2}
              disabled={pending}
              compact
            />
          </div>

          <Field label="Jogo ou plataforma" htmlFor="game">
            <Input
              id="game"
              value={game}
              onChange={(e) => setGame(e.target.value)}
              placeholder="Ex.: Roblox"
              maxLength={80}
              disabled={pending}
            />
          </Field>

          {categorySlug === "contas" ? (
            <div className="flex flex-col gap-2 rounded-xl border border-gold/30 bg-gold/5 p-4">
              <span className="text-sm leading-none font-medium">Procedência da conta</span>
              <p className="text-xs leading-relaxed text-muted-foreground">
                O comprador vê essa informação no anúncio antes de comprar — seja honesto, é a
                principal proteção contra conta retomada depois da venda.
              </p>
              <ChoiceCards
                name="accountOrigin"
                legend="Procedência da conta"
                value={accountOrigin}
                onChange={setAccountOrigin}
                options={originOptions}
                columns={1}
                disabled={pending}
                compact
              />
            </div>
          ) : null}

          <Field
            label="O que o comprador recebe"
            htmlFor="description"
            counter={`${description.trim().length}/${MAX_DESCRIPTION} · mín. ${MIN_DESCRIPTION}`}
            hint="Explique o que está incluído, como funciona a entrega e o que o comprador precisa informar."
          >
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Conta com 40 skins, rank Imortal 2, e-mail original incluso. Entrego os dados no chat em até 1 hora."
              rows={6}
              maxLength={MAX_DESCRIPTION}
              disabled={pending}
            />
          </Field>
        </FormSection>

        <FormSection
          id="entrega"
          icon={Truck}
          title="Entrega"
          description="Como e em quanto tempo o comprador recebe. O prazo vira a garantia do pedido: se estourar, ele é reembolsado."
          complete
        >
          <ChoiceCards
            name="deliveryType"
            legend="Tipo de entrega"
            value={deliveryType}
            onChange={changeDeliveryType}
            options={deliveryTypeOptions}
            columns={2}
            disabled={pending}
          />

          {deliveryType === "manual" ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm leading-none font-medium">Prazo de entrega</span>
              <ChoiceCards
                name="deliveryTime"
                legend="Prazo de entrega"
                value={deliveryTime}
                onChange={setDeliveryTime}
                options={timeOptions}
                columns={4}
                disabled={pending}
                compact
                hideIndicator
              />
            </div>
          ) : null}
        </FormSection>

        <FormSection
          id="fotos"
          icon={ImageIcon}
          title="Fotos"
          description="Anúncios com foto vendem mais. A primeira é a capa da vitrine — prefira imagens horizontais (16:9). Opcional."
          complete={images.length > 0}
        >
          <ProductImageUploader value={images} onChange={setImages} disabled={pending} />
        </FormSection>

        <FormSection
          id="itens"
          icon={Package}
          title="Itens e preços"
          description="Cada item é uma opção que o comprador escolhe, com preço e estoque próprios."
          complete={done("items")}
        >
          <ul className="flex flex-col gap-3">
            {rows.map((row, index) => {
              const cents = parseToCents(row.price)
              const net = cents !== null && cents >= 100 ? splitOrderAmount(cents).sellerNetCents : null
              // Só reclama depois que o vendedor mexeu no preço (o nome já vem sugerido).
              const invalid = row.price.trim() !== "" && !isRowValid(row)

              return (
                <li
                  key={row.id ?? `new-${index}`}
                  className="flex flex-col gap-4 rounded-xl border border-border bg-background p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Item {index + 1}
                    </span>
                    {rows.length > 1 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                        disabled={pending}
                        aria-label={`Remover item ${index + 1}`}
                      >
                        <Trash2 className="size-4" />
                        Remover
                      </Button>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[1fr_150px_100px]">
                    <Field label="Nome do item" htmlFor={`label-${index}`}>
                      <Input
                        id={`label-${index}`}
                        value={row.label}
                        onChange={(e) => patchRow(index, { label: e.target.value })}
                        placeholder="Ex.: 1.000 Robux"
                        maxLength={80}
                        disabled={pending}
                      />
                    </Field>

                    <Field label="Preço" htmlFor={`price-${index}`}>
                      <div className="relative">
                        <span
                          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
                          aria-hidden="true"
                        >
                          R$
                        </span>
                        <Input
                          id={`price-${index}`}
                          value={row.price}
                          onChange={(e) => patchRow(index, { price: e.target.value })}
                          placeholder="49,90"
                          inputMode="decimal"
                          className="pl-9"
                          disabled={pending}
                        />
                      </div>
                    </Field>

                    <Field label="Estoque" htmlFor={`stock-${index}`}>
                      <Input
                        id={`stock-${index}`}
                        value={row.stock}
                        onChange={(e) => patchRow(index, { stock: e.target.value })}
                        inputMode="numeric"
                        disabled={pending}
                      />
                    </Field>
                  </div>

                  <Field
                    label="Observação (opcional)"
                    htmlFor={`note-${index}`}
                    hint={
                      invalid
                        ? "Confira: nome com 2+ letras, preço mínimo de R$ 1,00 e estoque numérico."
                        : net !== null
                          ? `Você recebe ${formatCents(net)} por venda deste item (depois da taxa da plataforma).`
                          : undefined
                    }
                  >
                    <Input
                      id={`note-${index}`}
                      value={row.deliveryNote ?? ""}
                      onChange={(e) => patchRow(index, { deliveryNote: e.target.value })}
                      placeholder="Ex.: entrega em até 10 minutos"
                      maxLength={200}
                      disabled={pending}
                    />
                  </Field>
                </li>
              )
            })}
          </ul>

          <Button
            variant="outline"
            onClick={() => setRows((current) => [...current, { ...EMPTY_ROW }])}
            disabled={pending}
            className="w-full border-dashed"
          >
            <Plus className="size-4" />
            Adicionar item
          </Button>
        </FormSection>
      </div>

      <aside className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-24">
        <ListingPreview
          title={title}
          game={game}
          categorySlug={categorySlug}
          coverUrl={images[0] ?? null}
          deliveryType={deliveryType}
          deliveryTime={deliveryTime}
          prices={rows.map((r) => r.price)}
        />

        <div className="border-t border-border" />

        <ListingChecklist checks={checks} />

        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button onClick={submit} disabled={pending || !ready} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {editing ? "Salvar alterações" : "Publicar anúncio"}
          </Button>
          <Button variant="ghost" onClick={() => router.back()} disabled={pending} className="w-full">
            Cancelar
          </Button>
        </div>
      </aside>
    </div>
  )
}
