import { headers } from "next/headers"
import { after } from "next/server"
import { and, desc, eq, sql } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { profile, sellerApplication, user } from "@/lib/db/schema"

export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

const TOUCH_THROTTLE_MINUTES = 2

/**
 * Marca o usuário como ativo agora, pro status online/offline do perfil
 * público (lib/time.ts). Um único UPDATE guardado por WHERE (sem ler antes) —
 * no máximo 1 escrita por usuário a cada TOUCH_THROTTLE_MINUTES, não importa
 * quantas actions ele dispare nesse intervalo.
 */
async function touchLastActive(userId: string) {
  await db
    .update(user)
    .set({ lastActiveAt: new Date() })
    .where(
      and(
        eq(user.id, userId),
        sql`(${user.lastActiveAt} is null or ${user.lastActiveAt} < now() - interval '${sql.raw(String(TOUCH_THROTTLE_MINUTES))} minutes')`,
      ),
    )
}

export async function getUserId() {
  const session = await getSession()
  if (!session?.user) throw new Error("Não autenticado")
  // Roda depois da resposta (via after/waitUntil do Vercel) — não atrasa a
  // action por causa de um detalhe cosmético, mas ainda garante que rode.
  after(() => touchLastActive(session.user.id).catch((error) => console.error("[touchLastActive]", error)))
  return session.user.id
}

export type AccountState = {
  id: string
  name: string
  displayName: string | null
  image: string | null
  bio: string | null
  accentColor: string | null
  bannerUrl: string | null
  email: string
  emailVerified: boolean
  fullName: string
  phone: string | null
  cpf: string | null
  phoneVerified: boolean
  cpfVerified: boolean
  memberSince: Date
  seller: {
    storeName: string | null
    storeSlug: string | null
    category: string | null
    currentStep: number
    level: number
    status: string
    pixKey: string | null
    documentNumber: string | null
  } | null
}

/** Estado completo da conta, usado no painel e no wizard de vendedor. */
export async function getAccountState(): Promise<AccountState | null> {
  const session = await getSession()
  if (!session?.user) return null

  const userId = session.user.id

  const [row] = await db
    .select()
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  const [p] = await db
    .select()
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1)

  const [s] = await db
    .select()
    .from(sellerApplication)
    .where(eq(sellerApplication.userId, userId))
    .limit(1)

  return {
    id: userId,
    name: row?.name ?? session.user.name,
    displayName: row?.displayName ?? null,
    image: row?.image ?? null,
    bio: row?.bio ?? null,
    accentColor: row?.accentColor ?? null,
    bannerUrl: row?.bannerUrl ?? null,
    email: row?.email ?? session.user.email,
    emailVerified: row?.emailVerified ?? false,
    fullName: p?.fullName ?? row?.name ?? session.user.name,
    phone: p?.phone ?? null,
    cpf: p?.cpf ?? null,
    phoneVerified: p?.phoneVerified ?? false,
    cpfVerified: p?.cpfVerified ?? false,
    memberSince: row?.createdAt ?? new Date(),
    seller: s
      ? {
          storeName: s.storeName,
          storeSlug: s.storeSlug,
          category: s.category,
          currentStep: s.currentStep,
          level: s.level,
          status: s.status,
          pixKey: s.pixKey,
          documentNumber: s.documentNumber,
        }
      : null,
  }
}

/** Percentual de conclusão da verificação da conta (0-100). */
export function verificationProgress(state: AccountState) {
  const steps = [
    state.cpfVerified,
    state.emailVerified,
    state.phoneVerified,
    Boolean(state.seller?.documentNumber),
    Boolean(state.seller?.pixKey),
  ]
  const done = steps.filter(Boolean).length
  return Math.round((done / steps.length) * 100)
}

export { and, desc, eq }
