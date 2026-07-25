export type Category = {
  slug: string
  name: string
  tagline: string
  description: string
  image: string
  listings: number
  startingAt: number
}

export type Listing = {
  id: string
  title: string
  category: string
  game: string
  price: number
  originalPrice?: number
  delivery: string
  seller: {
    name: string
    level: number
    sales: number
    rating: number
  }
}

export const categories: Category[] = [
  {
    slug: 'contas',
    name: 'Contas de jogos',
    tagline: 'Perfis prontos, com garantia',
    description:
      'Contas completas de Valorant, League of Legends, CS2, Free Fire e mais, com transferência acompanhada pela Ellowin.',
    image: '/images/cat-contas.png',
    listings: 12480,
    startingAt: 19.9,
  },
  {
    slug: 'moedas',
    name: 'Moedas e gold',
    tagline: 'Entrega automática em minutos',
    description:
      'Robux, V-Bucks, Diamantes, FIFA Coins e gold de MMO entregues por vendedores verificados.',
    image: '/images/cat-moedas.png',
    listings: 8320,
    startingAt: 4.5,
  },
  {
    slug: 'gift-cards',
    name: 'Gift cards',
    tagline: 'Códigos conferidos na hora',
    description:
      'Créditos de Steam, PlayStation, Xbox, Nintendo e recargas de jogos com código validado antes da liberação.',
    image: '/images/cat-giftcards.png',
    listings: 5610,
    startingAt: 9.9,
  },
  {
    slug: 'boosting',
    name: 'Boosting e serviços',
    tagline: 'Elo, missões e coaching',
    description:
      'Subida de elo, farm de missões, conquistas e coaching com prestadores avaliados pela comunidade.',
    image: '/images/cat-boosting.png',
    listings: 3140,
    startingAt: 29.9,
  },
]

export const listings: Listing[] = [
  {
    id: 'l1',
    title: 'Conta Valorant Imortal 2 — 34 skins, full acesso',
    category: 'contas',
    game: 'Valorant',
    price: 389.9,
    originalPrice: 459.9,
    delivery: 'Entrega em até 1h',
    seller: { name: 'RadiantStore', level: 5, sales: 2841, rating: 4.9 },
  },
  {
    id: 'l2',
    title: '10.000 Robux — entrega via grupo, sem taxa extra',
    category: 'moedas',
    game: 'Roblox',
    price: 249.0,
    delivery: 'Entrega automática',
    seller: { name: 'BloxMarket', level: 4, sales: 9120, rating: 4.8 },
  },
  {
    id: 'l3',
    title: 'Gift card Steam R$ 100 — código nacional',
    category: 'gift-cards',
    game: 'Steam',
    price: 96.5,
    originalPrice: 100,
    delivery: 'Código imediato',
    seller: { name: 'KeyPrime', level: 5, sales: 15304, rating: 5 },
  },
  {
    id: 'l4',
    title: 'Boost LoL — Prata ao Ouro, duo ou solo',
    category: 'boosting',
    game: 'League of Legends',
    price: 149.9,
    delivery: 'Início em 2h',
    seller: { name: 'EloForge', level: 4, sales: 1187, rating: 4.9 },
  },
  {
    id: 'l5',
    title: 'Conta Free Fire — 210 skins, Diamante Royale completo',
    category: 'contas',
    game: 'Free Fire',
    price: 179.9,
    delivery: 'Entrega em até 2h',
    seller: { name: 'BooyahShop', level: 3, sales: 642, rating: 4.7 },
  },
  {
    id: 'l6',
    title: '2.800 V-Bucks — recarga direto na conta',
    category: 'moedas',
    game: 'Fortnite',
    price: 119.9,
    originalPrice: 139.9,
    delivery: 'Entrega em 15min',
    seller: { name: 'LootDrop', level: 4, sales: 3355, rating: 4.8 },
  },
  {
    id: 'l7',
    title: 'Gift card PlayStation Store R$ 250',
    category: 'gift-cards',
    game: 'PlayStation',
    price: 241.0,
    delivery: 'Código imediato',
    seller: { name: 'KeyPrime', level: 5, sales: 15304, rating: 5 },
  },
  {
    id: 'l8',
    title: 'Coaching CS2 — 3 sessões com analista de demo',
    category: 'boosting',
    game: 'CS2',
    price: 219.0,
    delivery: 'Agendamento em 24h',
    seller: { name: 'AimLab Pro', level: 3, sales: 214, rating: 4.9 },
  },
]

export const games = [
  'Valorant',
  'League of Legends',
  'Free Fire',
  'CS2',
  'Roblox',
  'Fortnite',
  'Genshin Impact',
  'EA FC 25',
]

export function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function getCategory(slug: string) {
  return categories.find((c) => c.slug === slug)
}

export function listingsByCategory(slug: string) {
  return listings.filter((l) => l.category === slug)
}
