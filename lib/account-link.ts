import { pool } from "@/lib/db"

/**
 * Login com Google em cima de uma conta que já existe com o MESMO email.
 *
 * O cadastro por email e senha não confirma o email sozinho. Se alguém registrasse
 * o email de outra pessoa com uma senha que só ele conhece, e a dona depois entrasse
 * pelo Google, o Better Auth juntaria as duas contas — e a senha do invasor
 * continuaria valendo dentro da conta agora "verificada" da dona.
 *
 * Como o Google acabou de provar que o email é dela, a senha antiga e as sessões
 * abertas dessa conta não confirmada são apagadas antes do vínculo. Ela cria uma
 * senha nova, se quiser, por "Esqueci minha senha".
 *
 * Só age quando o email da conta local ainda NÃO estava verificado; uma conta
 * verificada mantém a senha e as sessões. Devolve quantas linhas foram removidas.
 */
export async function neutralizeUnverifiedCredentials(userId: string): Promise<number> {
  const { rows } = await pool.query<{ emailVerified: boolean }>(
    `SELECT "emailVerified" FROM "user" WHERE "id" = $1`,
    [userId],
  )
  if (!rows[0] || rows[0].emailVerified) return 0

  const accounts = await pool.query(
    `DELETE FROM "account" WHERE "userId" = $1 AND "providerId" = 'credential'`,
    [userId],
  )
  const sessions = await pool.query(`DELETE FROM "session" WHERE "userId" = $1`, [userId])
  return (accounts.rowCount ?? 0) + (sessions.rowCount ?? 0)
}
