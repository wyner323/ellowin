import { sql } from "drizzle-orm"
import type { user } from "@/lib/db/schema"

/**
 * Nome que OUTRAS pessoas veem (avaliações, perguntas, chat, loja, e-mails): o apelido
 * (`user.displayName`) ou, sem apelido, "Usuário" + os 4 últimos caracteres do id.
 *
 * Nunca cai em `user.name`: ali fica o nome legal, o mesmo do CPF, e os Termos e a Ajuda
 * prometem que ele não aparece para outros usuários.
 */
export function anonymousName(userId: string) {
  return `Usuário ${userId.slice(-4).toUpperCase()}`
}

/** Mesma regra em SQL, para colunas de `user` (ou de um alias dele) dentro de um select. */
export function publicNameCol(t: typeof user) {
  return sql<string>`coalesce(nullif(trim(${t.displayName}), ''), 'Usuário ' || upper(right(${t.id}, 4)))`
}

/** Mesma regra em SQL cru, para subconsultas escritas à mão; `alias` é o apelido da tabela "user". */
export function publicNameRaw(alias: string) {
  return `coalesce(nullif(trim(${alias}."displayName"), ''), 'Usuário ' || upper(right(${alias}."id", 4)))`
}
