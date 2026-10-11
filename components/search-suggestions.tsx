"use client"

import { useEffect, useState } from "react"
import { MIN_SUGGEST_LENGTH } from "@/lib/search-suggest"

const LIST_ID = "busca-sugestoes"

/**
 * Sugestões de jogo na busca do cabeçalho (desktop e celular) usando o
 * `<datalist>` nativo: acessível, funciona com teclado e toque e não precisa de
 * um menu próprio. Os campos `input[type=search][name=q]` ganham o `list` na
 * primeira digitação; as opções vêm de `/api/busca/sugestoes`.
 */
export function SearchSuggestions() {
  const [options, setOptions] = useState<string[]>([])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined

    function onInput(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLInputElement) || target.type !== "search" || target.name !== "q") return
      if (!target.closest("header")) return

      target.setAttribute("list", LIST_ID)

      clearTimeout(timer)
      controller?.abort()
      const value = target.value.trim()
      if (value.length < MIN_SUGGEST_LENGTH) {
        setOptions([])
        return
      }

      timer = setTimeout(async () => {
        controller = new AbortController()
        try {
          const res = await fetch(`/api/busca/sugestoes?q=${encodeURIComponent(value)}`, {
            signal: controller.signal,
          })
          if (!res.ok) return
          const data = (await res.json()) as { suggestions?: unknown }
          setOptions(
            Array.isArray(data.suggestions)
              ? data.suggestions.filter((s): s is string => typeof s === "string")
              : [],
          )
        } catch {
          // Sem sugestão (rede ou abort): a busca normal continua funcionando.
        }
      }, 150)
    }

    document.addEventListener("input", onInput)
    return () => {
      document.removeEventListener("input", onInput)
      clearTimeout(timer)
      controller?.abort()
    }
  }, [])

  return (
    <datalist id={LIST_ID}>
      {options.map((name) => (
        <option key={name} value={name} />
      ))}
    </datalist>
  )
}
