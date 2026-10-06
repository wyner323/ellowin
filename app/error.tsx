"use client"

import { useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import * as Sentry from "@sentry/nextjs"
import { RotateCw } from "lucide-react"
import { EllowinLogo } from "@/components/ellowin-logo"
import { Button } from "@/components/ui/button"

/**
 * Erro em qualquer rota abaixo do layout raiz. Fica dentro do layout (tema,
 * fontes), ao contrário do global-error.tsx, que só entra quando o próprio
 * layout quebra. O header de dados não é usado aqui porque ele também consulta
 * o banco — se o erro foi do banco, ele quebraria de novo.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center px-4 py-3">
          <Link href="/" aria-label="Ir para a página inicial da Ellowin">
            <EllowinLogo />
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative h-40 w-40">
            <Image
              src="/images/mascote/ello-confuso.png"
              alt=""
              fill
              sizes="160px"
              className="object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Algo deu errado</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Não conseguimos carregar esta página agora. Tente de novo; se continuar, volte para a
            home e confira em Minhas compras ou na Carteira se a sua última ação foi registrada.
          </p>
          {error.digest ? (
            <p className="text-xs text-muted-foreground">Código do erro: {error.digest}</p>
          ) : null}
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={reset}>
              <RotateCw className="size-4" />
              Tentar de novo
            </Button>
            <Button render={<Link href="/" />} variant="outline">
              Voltar para a home
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
