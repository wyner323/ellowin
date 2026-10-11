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
  let current: unknown = error
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    if ("code" in current && (current as { code?: unknown }).code === "23505") return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}
