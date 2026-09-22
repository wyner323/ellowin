import type { Metadata } from "next"
import { Search, ShieldCheck, ShieldAlert } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSellerStorefront } from "@/lib/marketplace"

export const metadata: Metadata = {
  title: "Verificador de contas",
  description:
    "Confira se uma loja da Ellowin já teve algum registro de conta recuperada pelo vendedor.",
}

export default async function VerificadorPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string }>
}) {
  const { loja } = await searchParams
  const raw = loja?.trim()
  // Aceita tanto o slug puro quanto um link colado inteiro (com ou sem
  // protocolo/domínio) — pega só o trecho depois de "/loja/".
  const slug = raw
    ? raw.includes("/loja/")
      ? raw.split("/loja/").pop()?.split(/[/?#]/)[0]
      : raw
    : undefined
  const store = slug ? await getSellerStorefront(slug) : null

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Verificador de contas</h1>
            <p className="text-sm text-muted-foreground">
              Antes de comprar, confira se a loja já teve algum registro de conta
              recuperada pelo vendedor após a venda. O selo é atribuído pela moderação
              da Ellowin ao encerrar uma disputa.
            </p>
          </header>

          <form className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="loja">Link ou nome da loja</Label>
              <Input
                id="loja"
                name="loja"
                defaultValue={raw ?? ""}
                placeholder="ex.: ellowin.com.br/loja/nome-da-loja"
              />
            </div>
            <Button type="submit">
              <Search className="size-4" />
              Verificar
            </Button>
          </form>

          {raw ? (
            store ? (
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{store.name}</p>
                    <p className="text-xs text-muted-foreground">Nível {store.level}</p>
                  </div>
                </div>

                {store.accountFlags.count === 0 ? (
                  <p className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    Selo de Certificação — nenhum registro de conta recuperada encontrado.
                  </p>
                ) : (
                  <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {store.accountFlags.count}{" "}
                    {store.accountFlags.count === 1
                      ? "registro de conta recuperada encontrado"
                      : "registros de conta recuperada encontrados"}
                    {store.accountFlags.lastFlaggedAt
                      ? ` — o mais recente em ${store.accountFlags.lastFlaggedAt.toLocaleDateString("pt-BR")}.`
                      : "."}
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
                Loja não encontrada. Confira o link e tente novamente.
              </p>
            )
          ) : null}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
