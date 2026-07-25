import type { ReactNode } from "react"
import Link from "next/link"
import { Lock, ShieldCheck, Wallet } from "lucide-react"
import { EllowinLogo } from "@/components/ellowin-logo"

const HIGHLIGHTS = [
  {
    icon: ShieldCheck,
    title: "Pagamento intermediado",
    text: "O valor só chega ao vendedor depois que você confirma o recebimento.",
  },
  {
    icon: Lock,
    title: "Conta verificada",
    text: "CPF validado e email confirmado antes da primeira negociação.",
  },
  {
    icon: Wallet,
    title: "Saque em PIX",
    text: "Vendedores aprovados recebem em minutos, sem burocracia.",
  },
]

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      <aside className="relative hidden overflow-hidden bg-primary px-12 py-14 text-primary-foreground lg:flex lg:w-[44%] lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary-foreground/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full bg-primary-foreground/5"
        />

        <Link href="/" className="relative">
          <EllowinLogo className="text-primary-foreground" />
        </Link>

        <div className="relative flex flex-col gap-8">
          <h2 className="max-w-sm text-3xl font-semibold leading-tight tracking-tight text-balance">
            O marketplace de produtos digitais onde ninguém sai no prejuízo.
          </h2>
          <ul className="flex flex-col gap-6">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/15">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm leading-relaxed text-primary-foreground/70">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-primary-foreground/60">
          Mais de 29 mil anúncios ativos em 4 catálogos.
        </p>
      </aside>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 sm:px-10">
        <div className="mb-10 lg:hidden">
          <Link href="/">
            <EllowinLogo />
          </Link>
        </div>
        {children}
      </main>
    </div>
  )
}
