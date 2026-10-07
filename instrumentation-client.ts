// Roda no navegador antes do resto do app — mesmo padrão de server/edge, mas
// carregado automaticamente pelo Next (não passa por instrumentation.ts).
//
// O SDK do navegador pesa ~130 KB gzip. Sem DSN ele não faria nada, então o
// import é condicional: `NEXT_PUBLIC_SENTRY_DSN` é substituída em tempo de
// build, o ramo morto é removido e o Sentry nem entra no bundle. Com DSN ele
// carrega de forma assíncrona, depois da hidratação, fora do caminho crítico.
import { sentrySharedOptions } from "@/lib/sentry-shared"

type CaptureTransition = typeof import("@sentry/nextjs").captureRouterTransitionStart

let captureTransition: CaptureTransition | undefined

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({ ...sentrySharedOptions })
    captureTransition = Sentry.captureRouterTransitionStart
  })
}

// Marca cada navegação entre páginas como uma transação — só tem efeito
// quando o SDK carregou e tracesSampleRate > 0 (ver lib/sentry-shared.ts).
export const onRouterTransitionStart: CaptureTransition = (...args) =>
  captureTransition?.(...args)
