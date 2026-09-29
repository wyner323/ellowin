"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"

/**
 * Erro não tratado dentro do próprio layout raiz (fora do alcance de um
 * error.tsx comum) — o Next exige que este arquivo defina <html>/<body>
 * porque ele substitui o layout inteiro quando disparado. `onRequestError`
 * (instrumentation.ts) já cobre erros do servidor; isto cobre o que quebra
 * DEPOIS de chegar no navegador.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body>
        <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.75rem", padding: "2rem", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Algo deu errado</h1>
          <p style={{ color: "#666", maxWidth: "28rem" }}>
            Já fomos avisados. Tente recarregar a página em instantes.
          </p>
        </div>
      </body>
    </html>
  )
}
