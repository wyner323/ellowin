"use client"

import { Monitor, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useThemePreference } from "@/components/theme-preference"
import { THEME_LABEL, THEME_PREFERENCES, parseTheme } from "@/lib/theme"

const ICON = { system: Monitor, light: Sun, dark: Moon } as const

/** Escolha de tema (Automático, Claro, Escuro); usada no botão do cabeçalho e no menu do celular. */
export function ThemeMenuItems() {
  const { preference, setPreference } = useThemePreference()

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>Tema</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={preference}
        onValueChange={(value) => setPreference(parseTheme(String(value)))}
      >
        {THEME_PREFERENCES.map((value) => {
          const Icon = ICON[value]
          return (
            <DropdownMenuRadioItem key={value} value={value} closeOnClick className="py-2">
              <Icon className="size-4" aria-hidden="true" />
              {THEME_LABEL[value]}
            </DropdownMenuRadioItem>
          )
        })}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  )
}

/** Botão do cabeçalho (a partir de `sm`; abaixo disso o tema fica no menu do celular). */
export function ThemeToggle() {
  const { preference } = useThemePreference()
  const Icon = ICON[preference]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative hidden before:absolute before:-inset-1 sm:inline-flex"
            aria-label={`Tema: ${THEME_LABEL[preference]}. Alterar tema`}
          />
        }
      >
        <Icon className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <ThemeMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
