import { slugifyGame } from "@/lib/product-catalog"

/**
 * Atributos estruturados por jogo (região, rank...), em conjunto fechado — o
 * mesmo padrão de `lib/delivery.ts`: o vendedor escolhe de uma lista, o servidor
 * revalida, e o comprador filtra por eles. Texto livre não filtra nem compara.
 *
 * Os valores ficam em `product.attributes` (jsonb, chave → valor da opção). Para
 * incluir um jogo novo, basta uma entrada em `GAME_ATTRIBUTES`; mudar o `value`
 * de uma opção existente quebra anúncios já salvos, então só acrescente opções.
 * Este arquivo é puro (sem banco), para ser importado de qualquer lado.
 */

export type AttributeOption = { value: string; label: string }

export type AttributeField = {
  /** Chave estável gravada em `product.attributes` e usada na URL (`a_<key>`). */
  key: string
  label: string
  options: AttributeOption[]
  /** Anúncios dessas categorias têm o campo; as demais não. */
  categories: string[]
  /** Obrigatório ao criar/editar um anúncio dessas categorias. */
  required?: boolean
  /** Aparece como destaque no card da vitrine (no máximo 2 por jogo). */
  highlight?: boolean
}

const REGIONS_GAME = [
  { value: "br", label: "Brasil" },
  { value: "latam", label: "América Latina" },
  { value: "na", label: "América do Norte" },
  { value: "eu", label: "Europa" },
  { value: "ap", label: "Ásia-Pacífico" },
  { value: "kr", label: "Coreia" },
]

export const GAME_ATTRIBUTES: Record<string, AttributeField[]> = {
  valorant: [
    {
      key: "regiao",
      label: "Região da conta",
      categories: ["contas"],
      required: true,
      highlight: true,
      options: REGIONS_GAME,
    },
    {
      key: "rank",
      label: "Rank atual",
      categories: ["contas"],
      required: true,
      highlight: true,
      options: [
        { value: "sem-rank", label: "Sem rank" },
        { value: "ferro", label: "Ferro" },
        { value: "bronze", label: "Bronze" },
        { value: "prata", label: "Prata" },
        { value: "ouro", label: "Ouro" },
        { value: "platina", label: "Platina" },
        { value: "diamante", label: "Diamante" },
        { value: "ascendente", label: "Ascendente" },
        { value: "imortal", label: "Imortal" },
        { value: "radiante", label: "Radiante" },
      ],
    },
    {
      key: "skins",
      label: "Quantidade de skins",
      categories: ["contas"],
      options: [
        { value: "0-9", label: "Até 9" },
        { value: "10-29", label: "10 a 29" },
        { value: "30-59", label: "30 a 59" },
        { value: "60+", label: "60 ou mais" },
      ],
    },
  ],

  "counter-strike-2": [
    {
      key: "prime",
      label: "Status Prime",
      categories: ["contas"],
      required: true,
      highlight: true,
      options: [
        { value: "com-prime", label: "Com Prime" },
        { value: "sem-prime", label: "Sem Prime" },
      ],
    },
    {
      key: "patente",
      label: "Patente",
      categories: ["contas"],
      required: true,
      highlight: true,
      options: [
        { value: "sem-patente", label: "Sem patente" },
        { value: "silver", label: "Silver" },
        { value: "gold-nova", label: "Gold Nova" },
        { value: "master-guardian", label: "Master Guardian" },
        { value: "legendary-eagle", label: "Legendary Eagle" },
        { value: "supreme", label: "Supreme" },
        { value: "global-elite", label: "Global Elite" },
      ],
    },
    {
      key: "faceit",
      label: "Nível Faceit",
      categories: ["contas"],
      options: [
        { value: "sem-faceit", label: "Sem Faceit" },
        { value: "1-3", label: "Nível 1 a 3" },
        { value: "4-7", label: "Nível 4 a 7" },
        { value: "8-10", label: "Nível 8 a 10" },
      ],
    },
  ],

  steam: [
    {
      key: "regiao",
      label: "Região do gift card",
      categories: ["gift-cards"],
      required: true,
      highlight: true,
      options: [
        { value: "br", label: "Brasil" },
        { value: "ar", label: "Argentina" },
        { value: "tr", label: "Turquia" },
        { value: "us", label: "Estados Unidos" },
        { value: "eu", label: "Europa" },
        { value: "global", label: "Global" },
      ],
    },
  ],
}

/** Campos do jogo (pelo nome livre do anúncio) que valem para a categoria. */
export function attributeFieldsFor(
  game: string | null | undefined,
  categorySlug: string | null | undefined,
): AttributeField[] {
  if (!game || !categorySlug) return []
  const fields = GAME_ATTRIBUTES[slugifyGame(game)] ?? []
  return fields.filter((f) => f.categories.includes(categorySlug))
}

/** Campos de um jogo pelo slug, de todas as categorias (usado nos filtros de /jogos/[slug]). */
export function attributeFieldsForSlug(gameSlug: string): AttributeField[] {
  return GAME_ATTRIBUTES[gameSlug] ?? []
}

/**
 * Limpa o que veio do cliente: só chaves e valores da definição, só para campos
 * que valem para esse jogo/categoria. Devolve também o primeiro campo
 * obrigatório que ficou sem valor, para a mensagem de erro.
 */
export function sanitizeAttributes(
  game: string | null | undefined,
  categorySlug: string | null | undefined,
  raw: unknown,
): { attributes: Record<string, string>; missing: AttributeField | null } {
  const fields = attributeFieldsFor(game, categorySlug)
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}

  const attributes: Record<string, string> = {}
  let missing: AttributeField | null = null

  for (const field of fields) {
    const value = input[field.key]
    if (typeof value === "string" && field.options.some((o) => o.value === value)) {
      attributes[field.key] = value
    } else if (field.required && !missing) {
      missing = field
    }
  }

  return { attributes, missing }
}

/** Rótulos legíveis dos atributos guardados, na ordem da definição (para a página do anúncio). */
export function describeAttributes(
  game: string | null | undefined,
  categorySlug: string | null | undefined,
  attributes: Record<string, string> | null | undefined,
): { key: string; label: string; value: string; highlight: boolean }[] {
  if (!attributes) return []
  return attributeFieldsFor(game, categorySlug).flatMap((field) => {
    const option = field.options.find((o) => o.value === attributes[field.key])
    return option
      ? [{ key: field.key, label: field.label, value: option.label, highlight: !!field.highlight }]
      : []
  })
}
