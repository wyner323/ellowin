import { headers } from "next/headers"
import { and, desc, eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { profile, sellerApplication, user } from "@/lib/db/schema"

export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export async function getUserId() {
  const session = await getSession()
  if (!session?.user) throw new Error("Não autenticado")
  return session.user.id
}

export type AccountState = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  fullName: string
  phone: string | null
  cpf: string | null
  phoneVerified: boolean
  cpfVerified: boolean
  seller: {
    storeName: string | null
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
    email: row?.email ?? session.user.email,
    emailVerified: row?.emailVerified ?? false,
    fullName: p?.fullName ?? row?.name ?? session.user.name,
    phone: p?.phone ?? null,
    cpf: p?.cpf ?? null,
    phoneVerified: p?.phoneVerified ?? false,
    cpfVerified: p?.cpfVerified ?? false,
    seller: s
      ? {
          storeName: s.storeName,
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
