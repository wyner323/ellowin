/**
 * Redação de dados sensíveis antes de qualquer evento sair para o Sentry.
 * Puro (sem SDK), usado pelo `beforeSend`/`beforeSendTransaction` dos três
 * arquivos de configuração (client, server, edge).
 *
 * `sendDefaultPii: false` (nas três configs) já impede o SDK de anexar IP,
 * cookies e cabeçalhos sozinho. Isto aqui cobre o resto: valores que O PRÓPRIO
 * código da Ellowin pode acabar passando para `Sentry.captureException(error,
 * { extra: {...} })` ou que apareçam dentro da mensagem/stack de um erro —
 * CPF, senha, dados de entrega (login/senha de conta de jogo), chave Pix,
 * tokens. Zero desses dados chega ao Sentry.
 */

const SENSITIVE_KEYS = [
  "cpf",
  "documentnumber",
  "password",
  "senha",
  "pixkey",
  "deliverypayload",
  "token",
  "secret",
  "authorization",
  "cookie",
  "cardnumber",
]

const REDACTED = "[redacted]"
const MAX_DEPTH = 6

function isSensitiveKey(key: string) {
  const lower = key.toLowerCase()
  return SENSITIVE_KEYS.some((k) => lower.includes(k))
}

/** Percorre o valor recursivamente, substituindo por `[redacted]` tudo cujo nome de campo bate com a lista. */
export function scrubSensitiveData<T>(value: T, depth = 0): T {
  if (value === null || typeof value !== "object" || depth >= MAX_DEPTH) return value

  if (Array.isArray(value)) {
    return value.map((item) => scrubSensitiveData(item, depth + 1)) as unknown as T
  }

  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    result[key] = isSensitiveKey(key)
      ? REDACTED
      : typeof val === "string"
        ? val
        : scrubSensitiveData(val, depth + 1)
  }
  return result as T
}

/** Erros de terceiros (extensão de navegador, rede instável do visitante) sem ação possível do nosso lado. */
export const IGNORED_ERROR_MESSAGES = [
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications",
  "Non-Error promise rejection captured",
  "Load failed",
  "NetworkError when attempting to fetch resource",
]

/** Origens que nunca são nosso código — extensão de navegador injetando script na página. */
export const IGNORED_URLS = [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-extension:\/\//]
