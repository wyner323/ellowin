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
