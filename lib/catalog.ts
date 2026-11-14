export type Category = {
  slug: string
  name: string
  tagline: string
  description: string
  /** Arte própria; sem ela a tela mostra um ícone da categoria (components/category-art.tsx). */
  image?: string
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
    tagline: 'Perfis prontos para jogar',
    description:
      'Contas completas de Valorant, League of Legends, CS2, Free Fire e mais, com transferência acompanhada pela Ellowin e pagamento retido até você confirmar.',
    image: '/images/cat-contas.png',
  },
  {
    slug: 'moedas',
    name: 'Moedas e gold',
    tagline: 'Entrega combinada no chat',
    description:
      'Robux, V-Bucks, Diamantes, FIFA Coins e gold de MMO anunciados por vendedores com cadastro completo na Ellowin.',
    image: '/images/cat-moedas.png',
  },
  {
    slug: 'itens',
    name: 'Itens de jogo',
    tagline: 'Skins, cosméticos e equipamentos',
    description:
      'Skins, cosméticos, equipamentos e consumíveis de jogos, com o conteúdo descrito item a item e a entrega feita dentro do jogo.',
  },
  {
    slug: 'gift-cards',
    name: 'Gift cards',
    tagline: 'Códigos digitais, pagamento retido',
    description:
      'Créditos de Steam, PlayStation, Xbox, Nintendo e outros cartões digitais, de vendedores aprovados pela Ellowin, com o pagamento retido até o resgate.',
    image: '/images/cat-giftcards.png',
  },
  {
    slug: 'recargas',
    name: 'Recargas por ID',
    tagline: 'Diamantes e moedas no seu perfil',
    description:
      'Recargas feitas direto no seu perfil do jogo a partir do ID que você informa na compra, com a prova de entrega no chat do pedido.',
  },
  {
    slug: 'assinaturas',
    name: 'Assinaturas e premium',
    tagline: 'Streaming, música, IA e mais',
    description:
      'Códigos, links e acessos de assinaturas como streaming, música, Discord Nitro e ferramentas de IA, de vendedores aprovados pela Ellowin.',
  },
  {
    slug: 'keys',
    name: 'Keys de jogos',
    tagline: 'Chaves de ativação para PC e consoles',
    description:
      'Chaves de ativação de jogos para Steam, Epic e consoles, com a origem do estoque declarada pelo vendedor e analisada pela moderação.',
  },
  {
    slug: 'redes-sociais',
    name: 'Redes sociais',
    tagline: 'Perfis com a procedência declarada',
    description:
      'Contas e perfis de redes sociais, com a procedência declarada pelo vendedor. Cada rede tem as próprias regras sobre venda de contas: leia antes de comprar.',
  },
  {
    slug: 'cursos',
    name: 'Cursos e guias',
    tagline: 'Cursos, e-books e modelos digitais',
    description:
      'Cursos, guias, e-books e modelos digitais de criadores e revendedores com licença, entregues por link ou código.',
  },
  {
    slug: 'boosting',
    name: 'Boosting e serviços',
    tagline: 'Elo, missões e coaching',
    description:
      'Subida de elo, farm de missões, conquistas e coaching com prestadores avaliados pela comunidade.',
    image: '/images/cat-boosting.png',
  },
]

/** Categorias na barra do cabeçalho (as demais ficam em /catalogo, no menu do celular e no rodapé): 10 links não cabem. */
export const HEADER_CATEGORY_SLUGS = ['contas', 'moedas', 'gift-cards', 'boosting']

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

export function getCategory(slug: string) {
  return categories.find((c) => c.slug === slug)
}
