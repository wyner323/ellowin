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
