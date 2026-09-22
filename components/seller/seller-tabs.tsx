"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const TABS = [
  { href: "/painel/vendedor", label: "Painel" },
  { href: "/painel/vendedor/produtos", label: "Anúncios" },
  { href: "/painel/vendedor/vendas", label: "Vendas" },
  { href: "/painel/vendedor/perguntas", label: "Perguntas" },
] as const

/**
 * Navegação persistente entre as sub-páginas do vendedor — antes cada página
 * só tinha um link solto de "voltar", sem nada ligando as telas entre si.
 */
export function SellerTabs({ pendingQuestions = 0 }: { pendingQuestions?: number }) {
  const pathname = usePathname()

  return (
    <nav className="border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-4">
        {TABS.map((tab) => {
          // "/painel/vendedor" não pode usar startsWith puro: casaria com
          // /painel/vendedor/produtos e afins e deixaria duas abas ativas.
          const active =
            tab.href === "/painel/vendedor"
              ? pathname === tab.href
              : pathname.startsWith(tab.href)

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.label === "Perguntas" && pendingQuestions > 0 ? (
                <span className="flex min-w-4.5 items-center justify-center rounded-full bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary">
                  {pendingQuestions}
                </span>
              ) : null}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
