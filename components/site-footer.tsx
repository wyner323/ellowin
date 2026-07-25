import Link from 'next/link'
import { categories } from '@/lib/catalog'
import { EllowinLogo } from '@/components/ellowin-logo'

const institucional = [
  { label: 'Como funciona', href: '/#como-funciona' },
  { label: 'Seja vendedor', href: '/vender' },
  { label: 'Central de segurança', href: '/#seguranca' },
]

const conta = [
  { label: 'Criar conta', href: '/cadastro' },
  { label: 'Entrar', href: '/entrar' },
  { label: 'Verificações', href: '/conta/verificacao' },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted/40">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="flex max-w-xs flex-col gap-3">
            <EllowinLogo />
            <p className="text-sm leading-relaxed text-muted-foreground">
              Marketplace de produtos digitais para games com pagamento
              intermediado, vendedores verificados e suporte na disputa.
            </p>
          </div>

          <div className="flex flex-wrap gap-10">
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">Catálogos</h3>
              <ul className="flex flex-col gap-2">
                {categories.map((category) => (
                  <li key={category.slug}>
                    <Link
                      href={`/catalogo/${category.slug}`}
                      className="text-sm text-muted-foreground hover:text-primary"
                    >
                      {category.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">Institucional</h3>
              <ul className="flex flex-col gap-2">
                {institucional.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-muted-foreground hover:text-primary"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">Sua conta</h3>
              <ul className="flex flex-col gap-2">
                {conta.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-muted-foreground hover:text-primary"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <p className="border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
          Ellowin é um ambiente de demonstração. Os anúncios exibidos são
          fictícios e servem apenas para testar o fluxo de cadastro e
          verificação.
        </p>
      </div>
    </footer>
  )
}
