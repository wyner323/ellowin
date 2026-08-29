import Link from 'next/link'
import { headers } from 'next/headers'
import { Search, ShieldCheck } from 'lucide-react'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { categories } from '@/lib/catalog'
import { db } from '@/lib/db'
import { sellerApplication, user as userTable } from '@/lib/db/schema'
import { getStaff } from '@/lib/roles'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EllowinLogo } from '@/components/ellowin-logo'
import { UserMenu } from '@/components/user-menu'

export async function SiteHeader() {
  const session = await auth.api.getSession({ headers: await headers() })

  // Só consultamos cargo e loja quando há sessão, para não pesar as páginas
  // públicas com duas queries por render.
  const [staff, application, profileRow] = session?.user
    ? await Promise.all([
        getStaff(),
        db
          .select({ status: sellerApplication.status })
          .from(sellerApplication)
          .where(eq(sellerApplication.userId, session.user.id))
          .limit(1),
        db
          .select({
            displayName: userTable.displayName,
            image: userTable.image,
            accentColor: userTable.accentColor,
          })
          .from(userTable)
          .where(eq(userTable.id, session.user.id))
          .limit(1),
      ])
    : [null, [], []]

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="flex items-center gap-2 border-b border-border bg-primary px-4 py-1.5 text-primary-foreground">
        <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
        <p className="text-xs leading-relaxed">
          Pagamento intermediado: o vendedor só recebe depois que você confirma a
          entrega.
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" aria-label="Ir para a página inicial da Ellowin">
          <EllowinLogo />
        </Link>

        <form
          action="/busca"
          className="relative ml-2 hidden flex-1 items-center md:flex"
          role="search"
        >
          <Search
            className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            name="q"
            placeholder="Busque por jogo, conta, moedas ou gift card"
            className="h-10 pl-9"
            aria-label="Buscar anúncios"
          />
        </form>

        <nav className="ml-auto flex items-center gap-1.5">
          {session?.user ? (
            <>
              <Button
                render={
                  <Link
                    href={
                      application[0]?.status === 'aprovado'
                        ? '/painel/vendedor'
                        : '/vender'
                    }
                  />
                }
                variant="ghost"
                size="sm"
                className="hidden sm:flex"
              >
                Vender
              </Button>
              <UserMenu
                name={session.user.name}
                displayName={profileRow[0]?.displayName ?? null}
                image={profileRow[0]?.image ?? null}
                accentColor={profileRow[0]?.accentColor ?? null}
                email={session.user.email}
                isSeller={application[0]?.status === 'aprovado'}
                isStaff={Boolean(staff)}
              />
            </>
          ) : (
            <>
              <Button render={<Link href="/entrar" />} variant="ghost" size="sm">
                Entrar
              </Button>
              <Button render={<Link href="/cadastro" />} size="sm">
                Criar conta
              </Button>
            </>
          )}
        </nav>
      </div>

      <div className="mx-auto hidden w-full max-w-6xl items-center gap-6 px-4 pb-2.5 lg:flex">
        {categories.map((category) => (
          <Link
            key={category.slug}
            href={`/catalogo/${category.slug}`}
            className="text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            {category.name}
          </Link>
        ))}
        <Link
          href="/vender"
          className="ml-auto text-sm font-medium text-primary hover:underline"
        >
          Quero vender na Ellowin
        </Link>
      </div>
    </header>
  )
}
