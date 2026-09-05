/** Status online/offline e "última vez visto", a partir de `user.lastActiveAt`. */

export const ONLINE_THRESHOLD_MS = 5 * 60 * 1000

export function isOnline(lastActiveAt: Date | null): boolean {
  if (!lastActiveAt) return false
  return Date.now() - lastActiveAt.getTime() < ONLINE_THRESHOLD_MS
}

/** "há 3 minutos" / "há 2 horas" / "há 5 dias" / "Nunca acessou". */
export function formatLastActive(lastActiveAt: Date | null): string {
  if (!lastActiveAt) return "Nunca acessou"

  const diffMs = Date.now() - lastActiveAt.getTime()
  const minutes = Math.floor(diffMs / (60 * 1000))
  if (minutes < 1) return "há poucos segundos"
  if (minutes < 60) return `há ${minutes} minuto${minutes === 1 ? "" : "s"}`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} hora${hours === 1 ? "" : "s"}`

  const days = Math.floor(hours / 24)
  return `há ${days} dia${days === 1 ? "" : "s"}`
}

/** "menos de 1 hora" / "3 horas" / "2 dias" — duração média, não "tempo atrás". */
export function formatDurationHours(hours: number): string {
  if (hours < 1) return "menos de 1 hora"
  if (hours < 24) {
    const h = Math.round(hours)
    return `${h} hora${h === 1 ? "" : "s"}`
  }
  const days = Math.round(hours / 24)
  return `${days} dia${days === 1 ? "" : "s"}`
}
