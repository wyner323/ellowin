/**
 * Contador do prazo de entrega: quanto falta (ou quanto passou) em palavras. Puro, com `now` injetável, para a tela
 * (que atualiza a cada poucos segundos) e para os testes. O estado vira também texto e ícone na tela: nunca só cor.
 */

export type CountdownState = "ok" | "atencao" | "vencido"

export type Countdown = { state: CountdownState; text: string }

/** Falta menos que isto: o contador pede pressa. */
export const WARN_BELOW_MS = 60 * 60 * 1000

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "25 min", "2 h", "2 h 15 min", "3 dias" (para uma duração positiva; arredonda os minutos para cima). */
export function formatSpan(ms: number): string {
  const totalMin = Math.max(1, Math.ceil(ms / MINUTE))
  if (totalMin < 60) return `${totalMin} min`
  if (ms >= 2 * DAY) return `${Math.floor(ms / DAY)} dias`
  const hours = Math.floor(totalMin / 60)
  const minutes = totalMin % 60
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`
}

export function deliveryCountdown(dueAt: Date | number, now: Date | number = Date.now()): Countdown {
  const left = new Date(dueAt).getTime() - new Date(now).getTime()
  if (left <= 0) {
    // Passou do prazo: "vencido há X" (menos de um minuto vira "agora há pouco").
    const late = -left
    return { state: "vencido", text: late < MINUTE ? "Prazo vencido agora há pouco" : `Prazo vencido há ${formatSpan(late)}` }
  }
  if (left < WARN_BELOW_MS) return { state: "atencao", text: `Faltam ${formatSpan(left)}: entregue logo` }
  return { state: "ok", text: `Faltam ${formatSpan(left)} para o prazo` }
}
