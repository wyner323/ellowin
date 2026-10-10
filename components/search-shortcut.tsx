"use client"

import { useEffect } from "react"

/**
 * Atalho "/" para focar a busca do cabeçalho (padrão de GitHub, YouTube...).
 * Ignora quando a pessoa já está digitando em algum campo ou usa Ctrl/Alt/Cmd.
 */
export function SearchShortcut() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return

      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return
      }

      // Só a busca visível: abaixo de `md` o cabeçalho esconde o campo (display: none).
      const field = Array.from(
        document.querySelectorAll<HTMLInputElement>('header input[type="search"][name="q"]'),
      ).find((el) => el.offsetParent !== null)
      if (!field) return

      event.preventDefault()
      field.focus()
      field.select()
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  return null
}
