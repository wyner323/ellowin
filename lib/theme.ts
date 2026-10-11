/**
 * Preferência de tema (claro, escuro ou do sistema). Pura: sem acesso a
 * `document`/`cookies`, para ser usada no servidor (layout) e no cliente.
 *
 * A escolha vive num cookie para o servidor já mandar o `<html>` com a classe
 * certa — sem script antes da hidratação (que precisaria do nonce do CSP) e sem
 * piscar o tema errado. "Sistema" = nenhuma classe: o CSS segue
 * `prefers-color-scheme` (ver `app/globals.css`).
 */

export const THEME_COOKIE = "ellowin-theme"

export const THEME_PREFERENCES = ["system", "light", "dark"] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]

export const THEME_LABEL: Record<ThemePreference, string> = {
  system: "Automático",
  light: "Claro",
  dark: "Escuro",
}

/** Valor de cookie desconhecido, ausente ou adulterado cai em "system". */
export function parseTheme(value: string | undefined | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system"
}

/** Classe do `<html>` para a preferência ("" = seguir o sistema). */
export function themeClass(pref: ThemePreference): string {
  return pref === "system" ? "" : pref
}

/** Lê a preferência a partir da lista de classes do `<html>`. */
export function themeFromClassList(classes: { contains(token: string): boolean }): ThemePreference {
  if (classes.contains("dark")) return "dark"
  if (classes.contains("light")) return "light"
  return "system"
}

/** Texto do cookie que grava a preferência (system apaga o cookie). */
export function themeCookieString(pref: ThemePreference, secure: boolean): string {
  const base = `${THEME_COOKIE}=${pref === "system" ? "" : pref}; path=/; SameSite=Lax`
  const age = pref === "system" ? "max-age=0" : `max-age=${60 * 60 * 24 * 365}`
  return `${base}; ${age}${secure ? "; Secure" : ""}`
}
