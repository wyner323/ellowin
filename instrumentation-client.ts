// Roda no navegador antes do resto do app — mesmo padrão de server/edge, mas
// carregado automaticamente pelo Next (não passa por instrumentation.ts).
import * as Sentry from "@sentry/nextjs"
import { sentrySharedOptions } from "@/lib/sentry-shared"

Sentry.init({
  ...sentrySharedOptions,
})

// Marca cada navegação entre páginas como uma transação — só tem efeito
// quando tracesSampleRate > 0 (ver lib/sentry-shared.ts).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
