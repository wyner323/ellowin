import { lt, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { otpCode, session, verification } from "@/lib/db/schema"

/**
 * Faxina das tabelas que só crescem: sessões, tokens do Better Auth (`verification`) e códigos de verificação (OTP)
 * vencidos há mais de um dia. Guardar isso para sempre só aumenta a superfície de vazamento (os OTPs ainda estão em
 * texto puro) e o tamanho do banco. `auth_attempt` já se limpa sozinha em `lib/rate-limit.ts`.
 * Chamada ao fim de cada `/api/cron/sla`; devolve só as quantidades apagadas.
 */
export async function purgeExpiredRows() {
  const cutoff = sql`now() - interval '1 day'`
  const sessions = await db.delete(session).where(lt(session.expiresAt, cutoff)).returning({ id: session.id })
  const verifications = await db.delete(verification).where(lt(verification.expiresAt, cutoff)).returning({ id: verification.id })
  const otps = await db.delete(otpCode).where(lt(otpCode.expiresAt, cutoff)).returning({ id: otpCode.id })
  return { sessions: sessions.length, verifications: verifications.length, otps: otps.length }
}
