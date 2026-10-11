import { describe, expect, it } from "vitest"
import {
  THEME_COOKIE,
  parseTheme,
  themeClass,
  themeCookieString,
  themeFromClassList,
} from "@/lib/theme"

describe("parseTheme", () => {
  it("aceita só claro e escuro; o resto vira sistema", () => {
    expect(parseTheme("light")).toBe("light")
    expect(parseTheme("dark")).toBe("dark")
    expect(parseTheme("system")).toBe("system")
    for (const bad of [undefined, null, "", "DARK", "blue", "dark; x=1", "<script>"]) {
      expect(parseTheme(bad as string | undefined)).toBe("system")
    }
  })
})

describe("themeClass", () => {
  it("sistema não põe classe nenhuma", () => {
    expect(themeClass("system")).toBe("")
    expect(themeClass("light")).toBe("light")
    expect(themeClass("dark")).toBe("dark")
  })
})

describe("themeFromClassList", () => {
  const list = (...classes: string[]) => ({ contains: (t: string) => classes.includes(t) })

  it("lê a preferência da classe do <html>", () => {
    expect(themeFromClassList(list("dark"))).toBe("dark")
    expect(themeFromClassList(list("light"))).toBe("light")
    expect(themeFromClassList(list("bg-background"))).toBe("system")
  })

  it("ida e volta com themeClass", () => {
    for (const pref of ["light", "dark", "system"] as const) {
      expect(themeFromClassList(list(...themeClass(pref).split(" ").filter(Boolean)))).toBe(pref)
    }
  })
})

describe("themeCookieString", () => {
  it("grava por um ano, no site todo, sem vazar para outros sites", () => {
    const c = themeCookieString("dark", true)
    expect(c).toContain(`${THEME_COOKIE}=dark`)
    expect(c).toContain("path=/")
    expect(c).toContain("SameSite=Lax")
    expect(c).toContain("max-age=31536000")
    expect(c).toContain("Secure")
  })

  it("só marca Secure em https", () => {
    expect(themeCookieString("light", false)).not.toContain("Secure")
  })

  it("sistema apaga o cookie", () => {
    const c = themeCookieString("system", true)
    expect(c).toContain(`${THEME_COOKIE}=;`)
    expect(c).toContain("max-age=0")
  })
})
