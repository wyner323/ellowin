/**
 * Ponto único de inicialização do Sentry no servidor — o Next chama `register()`
 * uma vez por runtime que ele sobe (nodejs para SSR/actions, edge para o
 * proxy.ts). `onRequestError` é o gancho que captura exceções não tratadas em
 * Server Components, Route Handlers e server actions sem precisar de try/catch
 * espalhado pelo código; os catches que JÁ existem (varreduras do SLA, envio de
 * notificação) continuam reportando explicitamente, porque ali o erro é
 * engolido de propósito (não pode derrubar a operação) — ver lib/sla.ts e
 * lib/notify.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config")
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config")
  }
}

export const onRequestError = async (
  ...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>
) => {
  const { captureRequestError } = await import("@sentry/nextjs")
  captureRequestError(...args)
}
