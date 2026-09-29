// Carregado por instrumentation.ts quando NEXT_RUNTIME === "nodejs" — cobre
// Server Components, Route Handlers e server actions. Ver lib/sentry-shared.ts
// para as opções comuns e o porquê de cada uma.
import * as Sentry from "@sentry/nextjs"
import { sentrySharedOptions } from "@/lib/sentry-shared"

Sentry.init({
  ...sentrySharedOptions,
})
