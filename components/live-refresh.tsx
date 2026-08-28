"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * Atualiza os dados da página em segundo plano, sem precisar de F5.
 *
 * Pausa o polling quando a aba fica em segundo plano (evita gastar
 * requisições à toa) e sincroniza assim que ela volta a ficar visível ou
 * recebe foco — mesmo padrão já usado no chat de disputa.
 */
export function LiveRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    function start() {
      if (timer) return
      timer = setInterval(() => router.refresh(), intervalMs)
    }
    function stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        router.refresh()
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === "visible") start()
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("focus", router.refresh)

    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("focus", router.refresh)
    }
  }, [intervalMs, router])

  return null
}
