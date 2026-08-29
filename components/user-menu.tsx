'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  ShoppingBag,
  Store,
  User,
  Wallet,
} from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { accentColorHex } from '@/lib/accent-colors'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { initialsOf, publicName } from '@/lib/utils'

export function UserMenu({
  name,
  displayName,
  image,
  accentColor,
  email,
  isSeller = false,
  isStaff = false,
}: {
  name: string
  displayName?: string | null
  image?: string | null
  accentColor?: string | null
  email: string
  isSeller?: boolean
  isStaff?: boolean
}) {
  const router = useRouter()

  const shownName = publicName(name, displayName)
  const accent = accentColorHex(accentColor)
  const initials = initialsOf(shownName)

  async function handleSignOut() {
    await authClient.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-9 gap-2 px-2"
            aria-label="Abrir menu da conta"
          />
        }
      >
        <Avatar size="sm" style={accent ? { boxShadow: `0 0 0 2px ${accent}` } : undefined}>
          {image ? <AvatarImage src={image} alt="" /> : null}
          <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-24 truncate text-sm md:inline">
          {shownName.split(' ')[0]}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* O GroupLabel do Base UI só funciona dentro de um Group. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium">{shownName}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {email}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/conta" />}>
          <LayoutDashboard className="size-4" />
          Minha conta
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/pedidos" />}>
          <ShoppingBag className="size-4" />
          Minhas compras
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/carteira" />}>
          <Wallet className="size-4" />
          Carteira
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/conta#verificacoes" />}>
          <User className="size-4" />
          Verificações
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={isSeller ? '/painel/vendedor' : '/vender'} />}>
          <Store className="size-4" />
          Painel de vendedor
        </DropdownMenuItem>
        {isStaff ? (
          <DropdownMenuItem render={<Link href="/admin/disputas" />}>
            <ShieldCheck className="size-4" />
            Moderação
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="size-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
