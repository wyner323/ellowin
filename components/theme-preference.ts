"use client"

import { useCallback, useSyncExternalStore } from "react"
import {
  themeCookieString,
  themeFromClassList,
  type ThemePreference,
} from "@/lib/theme"

/**
 * Preferência de tema no cliente. A fonte da verdade é a classe do `<html>`
 * (o servidor a define pelo cookie); mudar o tema troca a classe, grava o
 * cookie e quem usa este hook (botão, toasts) atualiza junto.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}

const getSnapshot = (): ThemePreference => themeFromClassList(document.documentElement.classList)
const getServerSnapshot = (): ThemePreference => "system"

export function useThemePreference() {
  const preference = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setPreference = useCallback((next: ThemePreference) => {
    const root = document.documentElement
    root.classList.remove("light", "dark")
    if (next !== "system") root.classList.add(next)

    try {
      document.cookie = themeCookieString(next, location.protocol === "https:")
    } catch {
      // Sem cookie a escolha vale só até recarregar; a tela já mudou.
    }
  }, [])

  return { preference, setPreference }
}
