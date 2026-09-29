import { scrubSensitiveData, IGNORED_ERROR_MESSAGES, IGNORED_URLS } from "@/lib/sentry-scrub"

/**
 * Opções comuns aos três `Sentry.init()` (client, server, edge) — o que muda
 * entre eles é só o transporte e as integrações específicas de runtime.
 *
 * `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`: enquanto nenhuma das duas existir,
 * `dsn` fica `undefined` e o SDK simplesmente não envia nada — sem erro, sem
 * custo. Ligar o monitoramento é só colocar a variável na Vercel, nada de
 * código muda. Ver CLAUDE.md e a memória de pendências do usuário para o
 * passo a passo de criar a conta.
 */
export const sentryDsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || undefined

export const sentrySharedOptions = {
  dsn: sentryDsn,
  enabled: Boolean(sentryDsn),
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,

  // Sem tracing/performance por padrão — é custo e volume extra que só faz
  // sentido depois que o time decidir o plano. Suba via env se quiser medir.
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),

  // Nunca liga por padrão: Session Replay grava a tela do visitante, e este
  // site mostra CPF, saldo e dados de entrega — precisaria de máscara
  // cuidadosa antes de cogitar isso. Não configurado aqui de propósito.

  // Não confia no default do SDK sozinho: sem isso ele pode anexar IP,
  // cookies e cabeçalhos da requisição automaticamente. Este é um site com
  // CPF e carteira — PII vai para o Sentry só se alguém explicitamente
  // colocar no `extra`, e mesmo aí o `beforeSend` abaixo redige.
  sendDefaultPii: false,

  ignoreErrors: IGNORED_ERROR_MESSAGES,
  denyUrls: IGNORED_URLS,

  // Tipado como `unknown` de propósito: importar o tipo exato do evento do
  // Sentry exigiria alcançar um pacote interno (@sentry/core) que o pnpm não
  // hoisteia; `scrubSensitiveData` é genérico e devolve o mesmo formato de
  // entrada, então o `Sentry.init()` de cada runtime aceita isto sem problema.
  beforeSend(event: unknown) {
    return scrubSensitiveData(event) as never
  },
  beforeSendTransaction(event: unknown) {
    return scrubSensitiveData(event) as never
  },
} as const
