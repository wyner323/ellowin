export const PIX_TYPE_LABEL: Record<string, string> = {
  cpf: "CPF",
  email: "E-mail",
  telefone: "Telefone",
  aleatoria: "Chave aleatória",
}

/** Chave Pix para exibir na tela: o suficiente para o dono reconhecer, não para ser reaproveitada. */
export function maskPixKey(type: string | null, key: string | null): string {
  if (!key) return "—"

  if (type === "cpf") {
    const d = key.replace(/\D/g, "")
    return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : "***"
  }

  if (type === "email") {
    const at = key.lastIndexOf("@")
    if (at < 1) return "***"
    return `${key.slice(0, Math.min(2, at))}***${key.slice(at)}`
  }

  if (type === "telefone") {
    const d = key.replace(/\D/g, "")
    return d.length >= 4 ? `(${d.slice(0, 2)}) *****-${d.slice(-4)}` : "***"
  }

  if (type === "aleatoria") {
    return key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : "***"
  }

  return "***"
}

/** "5 horas", "1 hora", "40 minutos" — tempo restante de uma trava, sempre arredondado para cima. */
export function formatRemaining(seconds: number): string {
  if (seconds <= 60) return "1 minuto"
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `${minutes} minutos`
  const hours = Math.ceil(minutes / 60)
  return hours === 1 ? "1 hora" : `${hours} horas`
}
