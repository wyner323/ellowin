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
 *
 * Duas camadas: o NOME do campo (acima) e o CONTEÚDO de qualquer texto (mensagem de exceção, caminho
 * da requisição, breadcrumb). O Drizzle monta a mensagem de um erro de banco como
 * "Failed query: <sql>
params: <valores>", com CPF, telefone etc. dentro; e o caminho da requisição
 * pode carregar ?token= (redefinição de senha). Só olhar o nome do campo deixava isso passar.
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
  "phone",
  "telefone",
  "birthdate",
  "nascimento",
  "otp",
  "fullname",
  "bankholder",
  "email",
]

const REDACTED = "[redacted]"
const MAX_DEPTH = 6

function isSensitiveKey(key: string) {
  const lower = key.toLowerCase()
  return SENSITIVE_KEYS.some((k) => lower.includes(k))
}

/** Padrões de dado pessoal DENTRO de um texto; cada um troca só o trecho sensível. */
const STRING_PATTERNS: [RegExp, string][] = [
  // Erro do Drizzle: mantém o SQL, descarta a lista de parâmetros ligados (CPF, telefone, nascimento...).
  [/(Failed query:[\s\S]*?)\r?\nparams:[\s\S]*$/i, "$1\nparams: [redacted]"],
  // Parâmetros de URL de uso único ou secretos.
  [/([?&](?:token|code|key|secret|senha|password|otp)=)[^&#\s"']+/gi, "$1[redacted]"],
  // CPF (com ou sem pontuação) e número de 11 dígitos em geral (celular com DDD).
  [/(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g, "[redacted]"],
  // E-mails.
  // Exige sufixo de letras (.com, .br...) para não pegar "pacote@1.6.25" nos caminhos das pilhas de erro.
  [/[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, "[redacted]"],
]

export function scrubString(text: string): string {
  return STRING_PATTERNS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text)
}

/**
 * Percorre o valor recursivamente: troca por `[redacted]` tudo cujo nome de campo bate com a lista e
 * limpa o conteúdo de todo texto (`scrubString`). Objetos além da profundidade máxima não passam
 * (viram `[truncated]`), em vez de seguir sem filtro.
 */
export function scrubSensitiveData<T>(value: T, depth = 0): T {
  if (typeof value === "string") return scrubString(value) as unknown as T
  if (value === null || typeof value !== "object") return value
  if (depth >= MAX_DEPTH) return "[truncated]" as unknown as T

  if (Array.isArray(value)) {
    return value.map((item) => scrubSensitiveData(item, depth + 1)) as unknown as T
  }

  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    result[key] = isSensitiveKey(key) ? REDACTED : scrubSensitiveData(val, depth + 1)
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
