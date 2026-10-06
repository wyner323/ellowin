'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Gamepad2, Menu, Search, Store, Tag, UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Busca e navegação por categoria no celular/tablet: o header esconde o campo
 * de busca abaixo de `md` e a barra de categorias abaixo de `lg`, então estes
 * botões são o único caminho até elas nas telas pequenas.
 */
export function MobileNav({
  categories,
  canSignUp,
}: {
  categories: { slug: string; name: string }[]
  /** Visitante sem sessão: abaixo de `sm` o "Criar conta" do header some e vem para o menu. */
  canSignUp: boolean
}) {
  const pathname = usePathname()
  // Guardar o caminho em que a busca foi aberta fecha o painel sozinho ao navegar.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const searchOpen = openOn === pathname

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="relative before:absolute before:-inset-1 md:hidden"
        aria-label={searchOpen ? 'Fechar busca' : 'Buscar anúncios'}
        aria-expanded={searchOpen}
        onClick={() => setOpenOn(searchOpen ? null : pathname)}
      >
        {searchOpen ? <X className="size-4" /> : <Search className="size-4" />}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="relative before:absolute before:-inset-1 lg:hidden"
              aria-label="Abrir menu de categorias"
            />
          }
        >
          <Menu className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {canSignUp ? (
            <>
              <DropdownMenuItem className="sm:hidden" render={<Link href="/cadastro" />}>
                <UserPlus className="size-4" />
                Criar conta
              </DropdownMenuItem>
              <DropdownMenuSeparator className="sm:hidden" />
            </>
          ) : null}
          <DropdownMenuItem render={<Link href="/jogos" />}>
            <Gamepad2 className="size-4" />
            Jogos
          </DropdownMenuItem>
          {categories.map((category) => (
            <DropdownMenuItem
              key={category.slug}
              render={<Link href={`/catalogo/${category.slug}`} />}
            >
              <Tag className="size-4" />
              {category.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/vender" />}>
            <Store className="size-4" />
            Quero vender na Ellowin
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {searchOpen ? (
        <form
          action="/busca"
          role="search"
          className="absolute inset-x-0 top-full border-b border-border bg-background p-3 md:hidden"
        >
          <div className="relative flex items-center">
            <Search
              className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              name="q"
              autoFocus
              placeholder="Busque por jogo, conta, moedas ou gift card"
              className="h-10 pl-9"
              aria-label="Buscar anúncios"
            />
          </div>
        </form>
      ) : null}
    </>
  )
}
