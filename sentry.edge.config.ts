// Carregado por instrumentation.ts quando NEXT_RUNTIME === "edge" — o único
// código nosso que roda no Edge Runtime é proxy.ts (middleware do CSP).
import * as Sentry from "@sentry/nextjs"
import { sentrySharedOptions } from "@/lib/sentry-shared"

Sentry.init({
  ...sentrySharedOptions,
})
