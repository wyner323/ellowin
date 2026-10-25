/**
 * Erro de chave única do Postgres (SQLSTATE 23505).
 *
 * Consultas pelo Drizzle (`db.update(...)`, `db.insert(...)`) embrulham o erro do
 * driver num `DrizzleQueryError`, com o original em `.cause` — checar só
 * `error.code` não reconhece a violação e o usuário via um erro genérico em vez
 * de "esse apelido já está em uso". Consultas pelo cliente cru (`pool`/`client`)
 * trazem o `code` direto. Por isso a cadeia de `cause` é percorrida.
 */
export function isUniqueViolation(error: unknown): boolean {
  return hasSqlState(error, "23505")
}

/**
 * Tabela que não existe (SQLSTATE 42P01): a migração dela ainda não foi aplicada. Quem lê uma tabela nova trata isso
 * como "indisponível" em vez de derrubar a página. Percorre a cadeia de `cause` pelo mesmo motivo de `isUniqueViolation`.
 */
export function isUndefinedTable(error: unknown): boolean {
  return hasSqlState(error, "42P01")
}

function hasSqlState(error: unknown, code: string): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    if ("code" in current && (current as { code?: unknown }).code === code) return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}
