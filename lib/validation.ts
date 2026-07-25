/**
 * Validações usadas no cadastro do Ellowin.
 * Todas rodam no servidor (server actions) e também no cliente para feedback
 * imediato — a fonte da verdade é sempre a checagem do servidor.
 */

/* -------------------------------------------------------------------------- */
/*                                    CPF                                     */
/* -------------------------------------------------------------------------- */

export function onlyDigits(value: string) {
  return (value ?? "").replace(/\D+/g, "")
}

export function formatCpf(value: string) {
  const d = onlyDigits(value).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4")
}

/**
 * Valida um CPF pelo algoritmo oficial dos dígitos verificadores (módulo 11).
 * Rejeita também as sequências repetidas conhecidas (000..., 111..., etc),
 * que passam no cálculo mas nunca são emitidas pela Receita Federal.
 */
export function isValidCpf(value: string) {
  const cpf = onlyDigits(value)

  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false

  const digits = cpf.split("").map(Number)

  // Primeiro dígito verificador
  let sum = 0
  for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i)
  let check = (sum * 10) % 11
  if (check === 10) check = 0
  if (check !== digits[9]) return false

  // Segundo dígito verificador
  sum = 0
  for (let i = 0; i < 10; i++) sum += digits[i] * (11 - i)
  check = (sum * 10) % 11
  if (check === 10) check = 0
  if (check !== digits[10]) return false

  return true
}

/**
 * Região fiscal de emissão do CPF, derivada do 9º dígito.
 * Serve como sinal extra de consistência exibido ao usuário.
 */
const CPF_REGIONS: Record<string, string> = {
  "0": "RS",
  "1": "DF, GO, MS, MT ou TO",
  "2": "AC, AM, AP, PA, RO ou RR",
  "3": "CE, MA ou PI",
  "4": "AL, PB, PE ou RN",
  "5": "BA ou SE",
  "6": "MG",
  "7": "ES ou RJ",
  "8": "SP",
  "9": "PR ou SC",
}

export function cpfRegion(value: string) {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11) return null
  return CPF_REGIONS[cpf[8]] ?? null
}

/* -------------------------------------------------------------------------- */
/*                                  Telefone                                  */
/* -------------------------------------------------------------------------- */

export function formatPhone(value: string) {
  const d = onlyDigits(value).slice(0, 11)
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2")
  }
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2")
}

/** Celular brasileiro: DDD válido (11-99) + 9 dígitos começando com 9. */
export function isValidPhone(value: string) {
  const d = onlyDigits(value)
  if (d.length !== 11) return false
  const ddd = Number(d.slice(0, 2))
  if (ddd < 11 || ddd > 99) return false
  return d[2] === "9"
}

/* -------------------------------------------------------------------------- */
/*                             Email / nome / senha                           */
/* -------------------------------------------------------------------------- */

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test((value ?? "").trim())
}

export function isValidFullName(value: string) {
  const parts = (value ?? "").trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return false
  return parts.every((p) => p.length >= 2) && /^[\p{L}\s'.-]+$/u.test(value)
}

/** Data no formato dd/mm/aaaa, com idade entre 18 e 110 anos. */
export function isValidBirthDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((value ?? "").trim())
  if (!match) return false
  const [, dd, mm, yyyy] = match
  const day = Number(dd)
  const month = Number(mm)
  const year = Number(yyyy)
  const date = new Date(year, month - 1, day)
  if (
    date.getDate() !== day ||
    date.getMonth() !== month - 1 ||
    date.getFullYear() !== year
  ) {
    return false
  }
  const now = new Date()
  let age = now.getFullYear() - year
  const beforeBirthday =
    now.getMonth() < month - 1 ||
    (now.getMonth() === month - 1 && now.getDate() < day)
  if (beforeBirthday) age--
  return age >= 18 && age <= 110
}

export function formatBirthDate(value: string) {
  const d = onlyDigits(value).slice(0, 8)
  return d.replace(/^(\d{2})(\d)/, "$1/$2").replace(/^(\d{2})\/(\d{2})(\d)/, "$1/$2/$3")
}

export function passwordScore(value: string) {
  const password = value ?? ""
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  return Math.min(score, 4)
}

export function isValidPassword(value: string) {
  const password = value ?? ""
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password)
}
