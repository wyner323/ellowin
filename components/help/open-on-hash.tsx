"use client"

import { useEffect } from "react"

/** Abre o <details> cujo id está na URL (#pergunta), para links diretos mostrarem a resposta. */
export function OpenOnHash() {
  useEffect(() => {
    function openTarget() {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (!id) return
      const el = document.getElementById(id)
      if (el instanceof HTMLDetailsElement) {
        el.open = true
        el.scrollIntoView({ block: "start" })
      }
    }

    openTarget()
    window.addEventListener("hashchange", openTarget)
    return () => window.removeEventListener("hashchange", openTarget)
  }, [])

  return null
}
