import { describe, expect, it } from "vitest"
import { sentrySharedOptions } from "@/lib/sentry-shared"

describe("opções comuns do Sentry", () => {
  it("o trilho de eventos (breadcrumbs) passa pelo mesmo filtro: token de URL e e-mail saem", () => {
    const crumb = sentrySharedOptions.beforeBreadcrumb({
      category: "navigation",
      message: "foi para /redefinir-senha?token=SEGREDO123&x=1 como ana@teste.dev",
      data: { from: "/", to: "/redefinir-senha?token=SEGREDO123" },
    }) as { message: string; data: { to: string } }
    expect(JSON.stringify(crumb)).not.toContain("SEGREDO123")
    expect(JSON.stringify(crumb)).not.toContain("ana@teste.dev")
  })

  it("não envia dados pessoais por padrão", () => {
    expect(sentrySharedOptions.sendDefaultPii).toBe(false)
  })
})
