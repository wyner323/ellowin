import Link from "next/link"
import Image from "next/image"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

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
          <h1 className="text-2xl font-bold tracking-tight">
            Essa página não existe
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            O link pode estar quebrado ou o endereço pode ter mudado. Volte
            para a home e tente de novo.
          </p>
          <Button render={<Link href="/" />}>Voltar para a home</Button>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
