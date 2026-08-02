import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

/* ---------------------------------------------------------------------------
 * Better Auth tables (nomes e colunas exatamente como o Better Auth espera)
 * ------------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  /** user | moderator | admin */
  role: text("role").notNull().default("user"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

/* ---------------------------------------------------------------------------
 * Tabelas do Ellowin
 * ------------------------------------------------------------------------ */

export const profile = pgTable("profile", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull().unique(),
  fullName: text("fullName").notNull(),
  phone: text("phone"),
  cpf: text("cpf"),
  birthDate: text("birthDate"),
  phoneVerified: boolean("phoneVerified").notNull().default(false),
  cpfVerified: boolean("cpfVerified").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const sellerApplication = pgTable("seller_application", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull().unique(),
  storeName: text("storeName"),
  storeSlug: text("storeSlug"),
  category: text("category"),
  description: text("description"),
  documentType: text("documentType"),
  documentNumber: text("documentNumber"),
  documentFrontName: text("documentFrontName"),
  selfieName: text("selfieName"),
  pixKeyType: text("pixKeyType"),
  pixKey: text("pixKey"),
  bankHolder: text("bankHolder"),
  acceptedTerms: boolean("acceptedTerms").notNull().default(false),
  currentStep: integer("currentStep").notNull().default(1),
  level: integer("level").notNull().default(1),
  status: text("status").notNull().default("em_andamento"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const otpCode = pgTable("otp_code", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  channel: text("channel").notNull(),
  destination: text("destination").notNull(),
  code: text("code").notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumedAt: timestamp("consumedAt"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

/* ---------------------------------------------------------------------------
 * Marketplace: carteira com custódia (escrow)
 *
 * Todos os valores monetários são inteiros em centavos para evitar erros de
 * ponto flutuante. `heldCents` é o dinheiro em custódia: já saiu do saldo
 * disponível do comprador mas ainda não foi liberado ao vendedor.
 * ------------------------------------------------------------------------ */

export const wallet = pgTable("wallet", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull().unique(),
  availableCents: integer("availableCents").notNull().default(0),
  heldCents: integer("heldCents").notNull().default(0),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

/** Extrato imutável: uma linha por movimentação, nunca atualizada. */
export const walletTransaction = pgTable("wallet_transaction", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  orderId: integer("orderId"),
  /** deposito | saque | compra | custodia | venda | reembolso | taxa */
  kind: text("kind").notNull(),
  amountCents: integer("amountCents").notNull(),
  balanceAfterCents: integer("balanceAfterCents").notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

/* ---------------------------------------------------------------------------
 * Marketplace: produtos e variantes
 * ------------------------------------------------------------------------ */

export const product = pgTable("product", {
  id: serial("id").primaryKey(),
  sellerId: text("sellerId").notNull(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  categorySlug: text("categorySlug").notNull(),
  game: text("game"),
  description: text("description").notNull().default(""),
  /** automatica | manual */
  deliveryType: text("deliveryType").notNull().default("manual"),
  deliveryTime: text("deliveryTime").notNull().default("ate 24h"),
  /** ativo | pausado */
  status: text("status").notNull().default("ativo"),
  ratingSum: integer("ratingSum").notNull().default(0),
  ratingCount: integer("ratingCount").notNull().default(0),
  salesCount: integer("salesCount").notNull().default(0),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

/** O "item específico" que o comprador escolhe: cada variante tem preço próprio. */
export const productVariant = pgTable("product_variant", {
  id: serial("id").primaryKey(),
  productId: integer("productId").notNull(),
  label: text("label").notNull(),
  priceCents: integer("priceCents").notNull(),
  stock: integer("stock").notNull().default(0),
  deliveryNote: text("deliveryNote"),
  sortOrder: integer("sortOrder").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

/* ---------------------------------------------------------------------------
 * Marketplace: pedidos, avaliações e disputas
 * ------------------------------------------------------------------------ */

export const order = pgTable("order", {
  id: serial("id").primaryKey(),
  buyerId: text("buyerId").notNull(),
  sellerId: text("sellerId").notNull(),
  productId: integer("productId").notNull(),
  variantId: integer("variantId").notNull(),
  /** Snapshots: o pedido preserva o que foi comprado mesmo se o anúncio mudar. */
  productTitle: text("productTitle").notNull(),
  variantLabel: text("variantLabel").notNull(),
  amountCents: integer("amountCents").notNull(),
  feeCents: integer("feeCents").notNull().default(0),
  sellerNetCents: integer("sellerNetCents").notNull().default(0),
  /** aguardando_entrega | entregue | concluido | em_disputa | reembolsado | cancelado */
  status: text("status").notNull().default("aguardando_entrega"),
  deliveryPayload: text("deliveryPayload"),
  deliveredAt: timestamp("deliveredAt"),
  autoReleaseAt: timestamp("autoReleaseAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

/** Uma avaliação por pedido concluído — alimenta o ranking do vendedor. */
export const review = pgTable("review", {
  id: serial("id").primaryKey(),
  orderId: integer("orderId").notNull().unique(),
  productId: integer("productId").notNull(),
  sellerId: text("sellerId").notNull(),
  buyerId: text("buyerId").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const dispute = pgTable("dispute", {
  id: serial("id").primaryKey(),
  orderId: integer("orderId").notNull().unique(),
  openedBy: text("openedBy").notNull(),
  reason: text("reason").notNull(),
  description: text("description").notNull().default(""),
  /** aberta | em_analise | resolvida_comprador | resolvida_vendedor | cancelada */
  status: text("status").notNull().default("aberta"),
  /** SLA: suporte fala no mesmo dia (24h), vendedor tem 48h úteis, resolução em 48h. */
  firstContactDueAt: timestamp("firstContactDueAt").notNull(),
  sellerResponseDueAt: timestamp("sellerResponseDueAt").notNull(),
  resolutionDueAt: timestamp("resolutionDueAt").notNull(),
  sellerFirstResponseAt: timestamp("sellerFirstResponseAt"),
  moderatorId: text("moderatorId"),
  resolution: text("resolution"),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

/** Histórico compartilhado: qualquer moderador lê o caso inteiro e dá continuidade. */
export const disputeMessage = pgTable("dispute_message", {
  id: serial("id").primaryKey(),
  disputeId: integer("disputeId").notNull(),
  authorId: text("authorId"),
  /** buyer | seller | moderator | system */
  authorRole: text("authorRole").notNull(),
  body: text("body").notNull(),
  /** Nota interna: visível apenas para a moderação. */
  internal: boolean("internal").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})
