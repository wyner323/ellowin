/**
 * Catálogo de jogos e tipos de produto, usado tanto no formulário de anúncio
 * (sugestão jogo → tipo de produto) quanto na navegação pública `/jogos`.
 *
 * A lista de jogos é só dado (nome + slug derivado) — cobre o mesmo universo
 * que marketplaces do setor costumam vender, pra nenhum vendedor esbarrar em
 * "meu jogo não está na lista". Os tipos de produto (`PRODUCT_KINDS`) são um
 * conjunto pequeno e genérico reaproveitado por todos os jogos: dá pra
 * cadastrar qualquer um dos ~190 jogos no dia 1 sem precisar escrever um
 * template à mão pra cada um.
 */

import { DEFAULT_MANUAL_DELIVERY_TIME, INSTANT_DELIVERY_TIME } from "@/lib/delivery"

export function slugifyGame(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

const PLATFORM_NAMES = new Set([
  "Epic Games",
  "GOG",
  "Nintendo",
  "Origin",
  "Playstation",
  "Steam",
  "Ubisoft",
  "Xbox",
])

const GAME_NAMES = [
  "8 Ball Pool",
  "A3: Still Alive",
  "Adventure Quest World",
  "Aika",
  "Aion",
  "Albion Online",
  "Apex Legends",
  "ARC Raiders",
  "Arena Breakout",
  "Arknights Endfield",
  "Avakin Life",
  "Black Clover Mobile",
  "Black Desert",
  "Black Myth: Wukong",
  "Blade and Soul",
  "Bleach Brave Souls",
  "Bleach Soul Resonance",
  "Blood Strike",
  "Bloons TD 6",
  "Brawl Stars",
  "Brawlhalla",
  "Cabal Online",
  "Call of Duty",
  "Car Parking Multiplayer",
  "CarX Street",
  "Chaos Zero Nightmare",
  "Clash of Clans",
  "Clash Royale",
  "Coin Master",
  "Combat Arms",
  "Cookie Run: Kingdom",
  "Counter Strike 2",
  "Criptomoedas e NFT",
  "Crossfire",
  "Dark and Darker",
  "Dark Souls",
  "DDTank",
  "Dead by Daylight",
  "Deadlock",
  "Diablo Immortal",
  "Diablo IV",
  "Digimon Masters Online",
  "Dofus",
  "DOTA 2",
  "Dragon Ball Legends",
  "Dragon City Mobile",
  "Drive Zone Online",
  "eFootball",
  "Elden Ring",
  "Epic Games",
  "Epic Seven",
  "Escape from Tarkov",
  "Etheria Restart",
  "Farlight 84",
  "Fate/Grand Order",
  "FIFA",
  "Final Fantasy",
  "For Honor",
  "Fortnite",
  "Forza Horizon",
  "Free Fire",
  "Genshin Impact",
  "GOG",
  "Grand Chase",
  "Grand Fantasia",
  "GTA",
  "Guild Wars 2",
  "Habbo",
  "Hay Day",
  "Hearthstone",
  "Heartwood Online",
  "Hero Siege",
  "Honkai Impact",
  "Honkai: Star Rail",
  "Honor of Kings",
  "Hytale",
  "Icarus Online",
  "IMVU",
  "Jujutsu Kaisen Phantom Parade",
  "Kakele Online",
  "Last Day on Earth",
  "Last Epoch",
  "League of Legends",
  "League of Legends: Wild Rift",
  "Legend Online",
  "Legends of Runeterra",
  "Lineage II",
  "Lords Mobile",
  "Lost Ark",
  "Magic The Gathering",
  "Marvel Rivals",
  "Metin 2",
  "Minecraft",
  "Minimania",
  "MIR4",
  "mo.co",
  "Mobile Legends",
  "Mortal Kombat",
  "MU Legend",
  "MU Online",
  "My Hero Academia",
  "Naruto Online",
  "Neverness To Everness",
  "New World",
  "Ni No Kuni",
  "Night Crows",
  "Nintendo",
  "Odin: Valhalla Rising",
  "One Piece Bounty Rush",
  "Origin",
  "Overwatch",
  "Palworld",
  "Path of Exile",
  "Path of Exile 2",
  "Perfect World",
  "Pixel Gun 3D",
  "PKXD",
  "Playstation",
  "Point Blank",
  "Poke Idle World",
  "PokeMMO",
  "Pokémon Champions",
  "Pokemon GO",
  "Pokémon TCG Pocket",
  "Pokemon Unite",
  "PokeXGames",
  "Priston Tale",
  "PUBG",
  "Ragnarok",
  "Ragnarok Origin",
  "Raid Shadow Legends",
  "Rainbow Six",
  "Ravendawn",
  "Red Dead Online",
  "Roblox",
  "Rocket League",
  "Rucoy Online",
  "Runescape",
  "Rush Royale",
  "Rust",
  "Saint Seiya Awakening",
  "Sea of Thieves",
  "Seafight",
  "Seven Deadly Sins",
  "Skullgirls",
  "Smite",
  "Solo Leveling Arise",
  "SpiritVale",
  "Squad Busters",
  "Standoff 2",
  "Steam",
  "Stumble Guys",
  "Subway Surfers",
  "Summoners War",
  "Sword Of Convallaria",
  "Tarisland",
  "Task Bar Hero",
  "Throne and Liberty",
  "Tibia",
  "Toram Online",
  "Tower of Fantasy",
  "Transformice",
  "Trove",
  "Ubisoft",
  "Valorant",
  "Wakfu",
  "War Thunder",
  "Warface",
  "Warframe",
  "Warspear",
  "With Your Destiny",
  "World of Tanks",
  "World of Warcraft",
  "Wuthering Waves",
  "Xbox",
  "Yu-Gi-Oh Duel Links",
  "Zenless Zone Zero",
  "Outro jogo",
]

export const OUTRAS_CATEGORIAS_NAMES = [
  "Assinaturas e Premium",
  "Cursos e Treinamentos",
  "Discord",
  "Emails",
  "Gift Cards",
  "Inteligência Artificial",
  "Modelos 3D",
  "Redes Sociais",
  "Serviços Digitais",
  "Softwares e Licenças",
]

export type Game = {
  slug: string
  name: string
  isPlatform: boolean
}

export const GAMES: Game[] = GAME_NAMES.map((name) => ({
  slug: slugifyGame(name),
  name,
  isPlatform: PLATFORM_NAMES.has(name),
}))

export const OUTRAS_CATEGORIAS: Game[] = OUTRAS_CATEGORIAS_NAMES.map((name) => ({
  slug: slugifyGame(name),
  name,
  isPlatform: false,
}))

export function findGameBySlug(slug: string): Game | null {
  return (
    GAMES.find((g) => g.slug === slug) ??
    OUTRAS_CATEGORIAS.find((g) => g.slug === slug) ??
    null
  )
}

/* ---------------------------------------------------------------------------
 * Tipos de produto — um conjunto pequeno e genérico, reaproveitado por todos
 * os jogos. Cada jogo escolhe (via `productKindsForGame`) quais fazem sentido.
 * ------------------------------------------------------------------------ */

export type ProductKindId =
  | "conta"
  | "moeda_ou_itens"
  | "itens"
  | "gift_card"
  | "recarga"
  | "assinatura"
  | "key_de_jogo"
  | "rede_social"
  | "curso"
  | "boost_ou_servico"

export type ProductKind = {
  id: ProductKindId
  label: string
  /** Descrição curta mostrada no seletor. */
  description: string
  categorySlug: string
  titleTemplate: (game: string) => string
  starterVariants: string[]
  /** Sugestão inicial — o vendedor pode trocar livremente no formulário. */
  deliveryType: "manual" | "automatica"
  deliveryTime: string
}

export const PRODUCT_KINDS: Record<ProductKindId, ProductKind> = {
  conta: {
    id: "conta",
    label: "Conta",
    description: "Perfil pronto para jogar, com os dados de acesso",
    categorySlug: "contas",
    titleTemplate: (game) => `Conta ${game} — full acesso`,
    starterVariants: ["Conta nível inicial", "Conta avançada"],
    deliveryType: "manual",
    deliveryTime: DEFAULT_MANUAL_DELIVERY_TIME,
  },
  moeda_ou_itens: {
    id: "moeda_ou_itens",
    label: "Moeda ou gold",
    description: "Moeda, gold e créditos do jogo, entregues no jogo",
    categorySlug: "moedas",
    titleTemplate: (game) => `Moedas de ${game}`,
    starterVariants: ["Pacote pequeno", "Pacote grande"],
    deliveryType: "manual",
    deliveryTime: DEFAULT_MANUAL_DELIVERY_TIME,
  },
  itens: {
    id: "itens",
    label: "Item de jogo",
    description: "Skins, cosméticos e equipamentos, com o conteúdo descrito item a item",
    categorySlug: "itens",
    titleTemplate: (game) => `Item de ${game}`,
    starterVariants: ["Item único"],
    deliveryType: "manual",
    deliveryTime: DEFAULT_MANUAL_DELIVERY_TIME,
  },
  gift_card: {
    id: "gift_card",
    label: "Gift card",
    description: "Cartões e créditos digitais (exige aprovação da moderação)",
    categorySlug: "gift-cards",
    titleTemplate: (game) => `Gift card ${game}`,
    starterVariants: ["Valor padrão"],
    deliveryType: "automatica",
    deliveryTime: INSTANT_DELIVERY_TIME,
  },
  recarga: {
    id: "recarga",
    label: "Recarga por ID",
    description: "Diamantes, V-Bucks e moedas direto no perfil do comprador (exige aprovação)",
    categorySlug: "recargas",
    titleTemplate: (game) => `Recarga ${game} por ID`,
    starterVariants: ["Pacote pequeno", "Pacote grande"],
    deliveryType: "manual",
    deliveryTime: DEFAULT_MANUAL_DELIVERY_TIME,
  },
  assinatura: {
    id: "assinatura",
    label: "Assinatura",
    description: "Códigos, links ou acessos de assinatura (exige aprovação)",
    categorySlug: "assinaturas",
    titleTemplate: (game) => `Assinatura ${game}`,
    starterVariants: ["1 mês", "12 meses"],
    deliveryType: "automatica",
    deliveryTime: INSTANT_DELIVERY_TIME,
  },
  key_de_jogo: {
    id: "key_de_jogo",
    label: "Key ou licença",
    description: "Chave de ativação de jogo ou licença de software (exige aprovação)",
    categorySlug: "keys",
    titleTemplate: (game) => `${game} — chave de ativação`,
    starterVariants: ["Chave padrão"],
    deliveryType: "automatica",
    deliveryTime: INSTANT_DELIVERY_TIME,
  },
  rede_social: {
    id: "rede_social",
    label: "Perfil de rede social",
    description: "Perfil ou conta de rede social, com a procedência declarada (exige aprovação)",
    categorySlug: "redes-sociais",
    titleTemplate: (game) => `Perfil ${game}`,
    starterVariants: ["Perfil único"],
    deliveryType: "manual",
    deliveryTime: DEFAULT_MANUAL_DELIVERY_TIME,
  },
  curso: {
    id: "curso",
    label: "Curso ou guia",
    description: "Curso, e-book ou modelo digital, entregue por link ou código",
    categorySlug: "cursos",
    titleTemplate: (game) => `${game} — acesso digital`,
    starterVariants: ["Acesso completo"],
    deliveryType: "automatica",
    deliveryTime: INSTANT_DELIVERY_TIME,
  },
  boost_ou_servico: {
    id: "boost_ou_servico",
    label: "Boost ou serviço",
    description: "Elo, coaching, missões e outros serviços",
    categorySlug: "boosting",
    titleTemplate: (game) => `Boost / serviço em ${game}`,
    starterVariants: ["Serviço avulso"],
    deliveryType: "manual",
    deliveryTime: "Até 48 horas",
  },
}

const DEFAULT_KINDS: ProductKindId[] = ["conta", "moeda_ou_itens", "itens", "recarga", "boost_ou_servico"]
const PLATFORM_KINDS: ProductKindId[] = ["gift_card", "key_de_jogo", "conta"]

/** Ajustes finos pros jogos que a Ellowin já cita hoje (lib/catalog.ts). */
const GAME_KIND_OVERRIDES: Record<string, ProductKindId[]> = {
  valorant: ["conta", "itens", "recarga", "boost_ou_servico"],
  "league-of-legends": ["conta", "itens", "recarga", "boost_ou_servico"],
  "free-fire": ["conta", "recarga", "itens"],
  "counter-strike-2": ["conta", "itens", "boost_ou_servico"],
  roblox: ["moeda_ou_itens", "itens", "recarga", "conta"],
  fortnite: ["recarga", "itens", "conta"],
  "genshin-impact": ["recarga", "conta"],
  fifa: ["moeda_ou_itens", "conta"],
  "criptomoedas-e-nft": ["moeda_ou_itens"],
}

/** As entradas de "Outras categorias" (não são jogos) só fazem sentido com o tipo de produto delas. */
const OUTRAS_KIND_OVERRIDES: Record<string, ProductKindId[]> = {
  "assinaturas-e-premium": ["assinatura"],
  "cursos-e-treinamentos": ["curso"],
  discord: ["assinatura", "rede_social"],
  emails: ["rede_social"],
  "gift-cards": ["gift_card"],
  "inteligencia-artificial": ["assinatura"],
  "modelos-3d": ["curso"],
  "redes-sociais": ["rede_social"],
  "servicos-digitais": ["boost_ou_servico"],
  "softwares-e-licencas": ["key_de_jogo"],
}

export function productKindsForGame(game: Pick<Game, "slug" | "isPlatform">): ProductKind[] {
  const ids =
    OUTRAS_KIND_OVERRIDES[game.slug] ??
    GAME_KIND_OVERRIDES[game.slug] ??
    (game.isPlatform ? PLATFORM_KINDS : DEFAULT_KINDS)
  return ids.map((id) => PRODUCT_KINDS[id])
}
