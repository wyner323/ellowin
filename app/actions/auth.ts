"use server"

import { randomInt } from "node:crypto"
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { otpCode, profile, user } from "@/lib/db/schema"
import { sendEmailOtp, sendPhoneOtpByEmail } from "@/lib/email"
import { clearRateLimit, clientIp, hitRateLimit } from "@/lib/rate-limit"
import { getSession, getUserId } from "@/lib/session"
import {
  isValidBirthDate,
  isValidCpf,
  isValidDisplayName,
  isValidEmail,
  isValidFullName,
  isValidPassword,
  isValidPhone,
  onlyDigits,
} from "@/lib/validation"

export type ActionResult = {
  ok: boolean
  error?: string
  field?: string
  message?: string
  /**
   * Preenchido apenas quando o provedor de email não está disponível: o código
   * é exibido na própria tela para que o fluxo de verificação possa ser
   * concluído em modo demonstração.
   */
  demoCode?: string
}

const OTP_TTL_MINUTES = 10
const MAX_ATTEMPTS = 5
const RESEND_COOLDOWN_SECONDS = 30

function generateCode() {
  // crypto.randomInt: Math.random() não é criptograficamente seguro e o estado
  // dele pode ser inferido a partir de saídas anteriores.
  return String(randomInt(100000, 1000000))
}

/**
 * Só mostra o código na tela (modo demonstração) se for pedido explicitamente
 * por ELLOWIN_DEMO_OTP=true. Por padrão, uma falha no envio do email NÃO pode
 * entregar o código ao navegador — isso permitiria "verificar" qualquer email
 * ou telefone só derrubando o envio.
 */
const SHOW_DEMO_CODE = process.env.ELLOWIN_DEMO_OTP === "true"

/* -------------------------------------------------------------------------- */
/*                            Cadastro de usuário                             */
/* -------------------------------------------------------------------------- */

export async function registerUser(input: {
  fullName: string
  displayName?: string
  email: string
  phone: string
  cpf: string
  birthDate: string
  password: string
  acceptedTerms: boolean
}): Promise<ActionResult> {
  // Cadastro em massa (contas descartáveis, CPFs gerados): 5 por hora por IP.
  const ip = await clientIp()
  if (ip && !(await hitRateLimit(`register:ip:${ip}`, 5, 60 * 60)))
    return {
      ok: false,
      error: "Muitos cadastros a partir deste endereço. Tente novamente mais tarde.",
    }

  const fullName = input.fullName.trim()
  const displayName = input.displayName?.trim() || null
  const email = input.email.trim().toLowerCase()
  const cpf = onlyDigits(input.cpf)
  const phone = onlyDigits(input.phone)

  if (!isValidFullName(fullName))
    return { ok: false, field: "fullName", error: "Informe seu nome completo." }
  if (displayName && !isValidDisplayName(displayName))
    return {
      ok: false,
      field: "displayName",
      error: "Use de 2 a 20 caracteres — letras, números, espaço, _ ou -.",
    }
  if (!isValidEmail(email))
    return { ok: false, field: "email", error: "Email inválido." }
  if (!isValidPhone(phone))
    return {
      ok: false,
      field: "phone",
      error: "Informe um celular válido com DDD.",
    }
  if (!isValidCpf(cpf))
    return {
      ok: false,
      field: "cpf",
      error: "CPF inválido — os dígitos verificadores não conferem.",
    }
  if (!isValidBirthDate(input.birthDate))
    return {
      ok: false,
      field: "birthDate",
      error: "Você precisa ter 18 anos ou mais para se cadastrar.",
    }
  if (!isValidPassword(input.password))
    return {
      ok: false,
      field: "password",
      error: "A senha precisa ter 8+ caracteres, com letras e números.",
    }
  if (!input.acceptedTerms)
    return {
      ok: false,
      field: "acceptedTerms",
      error: "É necessário aceitar os termos de uso.",
    }

  // CPF é único na plataforma — evita múltiplas contas com o mesmo documento.
  const [existingCpf] = await db
    .select({ id: profile.id })
    .from(profile)
    .where(eq(profile.cpf, cpf))
    .limit(1)

  if (existingCpf)
    return {
      ok: false,
      field: "cpf",
      error: "Este CPF já está vinculado a uma conta Ellowin.",
    }

  if (displayName) {
    const [existingNick] = await db
      .select({ id: user.id })
      .from(user)
      .where(sql`lower(${user.displayName}) = lower(${displayName})`)
      .limit(1)

    if (existingNick)
      return {
        ok: false,
        field: "displayName",
        error: "Esse apelido já está em uso. Escolha outro.",
      }
  }

  try {
    await auth.api.signUpEmail({
      body: { name: fullName, email, password: input.password },
      headers: new Headers(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha no cadastro"
    if (/exist/i.test(message))
      return {
        ok: false,
        field: "email",
        error: "Já existe uma conta com este email.",
      }
    return { ok: false, error: message }
  }

  const [created] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)

  if (!created) return { ok: false, error: "Conta não localizada após criação." }

  if (displayName) {
    // Corrida rara com outro cadastro simultâneo no mesmo apelido: a conta já
    // foi criada, então só deixamos o apelido em branco em vez de falhar tudo
    // — dá pra definir de novo em Minha conta.
    await db
      .update(user)
      .set({ displayName })
      .where(eq(user.id, created.id))
      .catch(() => {})
  }

  await db
    .insert(profile)
    .values({
      userId: created.id,
      fullName,
      phone,
      cpf,
      birthDate: input.birthDate,
      cpfVerified: true,
    })
    .onConflictDoNothing()

  const otpResult = await issueOtp(created.id, "email", email)

  revalidatePath("/")
  if (!otpResult.sent) {
    if (SHOW_DEMO_CODE)
      return {
        ok: true,
        demoCode: otpResult.code,
        message:
          "O envio de email não está disponível, então o código aparece aqui em modo demonstração.",
      }
    return {
      ok: true,
      message:
        "Conta criada, mas não conseguimos enviar o código agora. Peça um novo código na próxima tela.",
    }
  }

  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/*                                    OTP                                     */
/* -------------------------------------------------------------------------- */

async function issueOtp(
  userId: string,
  channel: "email" | "phone",
  destination: string,
): Promise<{ sent: boolean; error?: string; code: string }> {
  const code = generateCode()
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)

  await db.insert(otpCode).values({ userId, channel, destination, code, expiresAt })

  if (channel === "email") {
    const result = await sendEmailOtp(destination, code)
    return { ...result, code }
  }

  // Código de telefone vai para o email confirmado (não há provedor de SMS aqui).
  const [row] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  const result = await sendPhoneOtpByEmail(row?.email ?? destination, code, destination)
  return { ...result, code }
}

/** Segundos restantes antes que um novo código possa ser pedido para esse canal. */
async function otpCooldownRemaining(
  userId: string,
  channel: "email" | "phone",
): Promise<number> {
  const [row] = await db
    .select({ createdAt: otpCode.createdAt })
    .from(otpCode)
    .where(and(eq(otpCode.userId, userId), eq(otpCode.channel, channel)))
    .orderBy(desc(otpCode.createdAt))
    .limit(1)

  if (!row) return 0

  const elapsedSeconds = (Date.now() - row.createdAt.getTime()) / 1000
  return Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds))
}

export async function resendEmailCode(): Promise<ActionResult> {
  const session = await getSession()
  if (!session?.user) return { ok: false, error: "Sessão expirada." }
  if (session.user.emailVerified)
    return { ok: true, message: "Seu email já está confirmado." }

  const wait = await otpCooldownRemaining(session.user.id, "email")
  if (wait > 0)
    return { ok: false, error: `Aguarde ${wait}s antes de pedir um novo código.` }

  const result = await issueOtp(session.user.id, "email", session.user.email)
  if (!result.sent) {
    if (SHOW_DEMO_CODE)
      return {
        ok: true,
        demoCode: result.code,
        message:
          "O envio de email não está disponível, então o código aparece aqui em modo demonstração.",
      }
    return { ok: false, error: "Não foi possível enviar o código agora. Tente novamente em instantes." }
  }

  return { ok: true, message: "Enviamos um novo código para o seu email." }
}

export async function sendPhoneCode(): Promise<ActionResult> {
  const userId = await getUserId()

  const [p] = await db
    .select()
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1)

  if (!p?.phone) return { ok: false, error: "Nenhum telefone cadastrado." }
  if (p.phoneVerified)
    return { ok: true, message: "Seu telefone já está confirmado." }

  const wait = await otpCooldownRemaining(userId, "phone")
  if (wait > 0)
    return { ok: false, error: `Aguarde ${wait}s antes de pedir um novo código.` }

  const result = await issueOtp(userId, "phone", p.phone)
  if (!result.sent) {
    if (SHOW_DEMO_CODE)
      return {
        ok: true,
        demoCode: result.code,
        message:
          "O envio de email não está disponível, então o código aparece aqui em modo demonstração.",
      }
    return { ok: false, error: "Não foi possível enviar o código agora. Tente novamente em instantes." }
  }

  return {
    ok: true,
    message: "Código enviado. No ambiente de testes ele chega por email.",
  }
}

async function consumeOtp(
  userId: string,
  channel: "email" | "phone",
  code: string,
): Promise<ActionResult> {
  const clean = onlyDigits(code)
  if (clean.length !== 6)
    return { ok: false, error: "O código tem 6 dígitos." }

  const [row] = await db
    .select()
    .from(otpCode)
    .where(
      and(
        eq(otpCode.userId, userId),
        eq(otpCode.channel, channel),
        isNull(otpCode.consumedAt),
      ),
    )
    .orderBy(desc(otpCode.createdAt))
    .limit(1)

  if (!row)
    return { ok: false, error: "Nenhum código ativo. Solicite um novo." }
  if (row.expiresAt.getTime() < Date.now())
    return { ok: false, error: "Código expirado. Solicite um novo." }
  // A tentativa é contada ANTES de comparar e de forma atômica (o WHERE
  // confere o teto): contar depois, com o valor lido acima, deixaria requisições
  // paralelas chutarem o código várias vezes antes de qualquer contagem subir.
  const [bumped] = await db
    .update(otpCode)
    .set({ attempts: sql`${otpCode.attempts} + 1` })
    .where(
      and(
        eq(otpCode.id, row.id),
        lt(otpCode.attempts, MAX_ATTEMPTS),
        isNull(otpCode.consumedAt),
      ),
    )
    .returning({ attempts: otpCode.attempts })

  if (!bumped)
    return {
      ok: false,
      error: "Tentativas esgotadas para este código. Solicite um novo.",
    }

  if (row.code !== clean) {
    const left = MAX_ATTEMPTS - bumped.attempts
    return {
      ok: false,
      error: `Código incorreto. ${left} tentativa${left === 1 ? "" : "s"} restante${left === 1 ? "" : "s"}.`,
    }
  }

  // Só um dos acertos simultâneos consome o código.
  const [consumed] = await db
    .update(otpCode)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpCode.id, row.id), isNull(otpCode.consumedAt)))
    .returning({ id: otpCode.id })

  if (!consumed) return { ok: false, error: "Este código já foi usado. Solicite um novo." }

  return { ok: true }
}

export async function verifyEmailCode(code: string): Promise<ActionResult> {
  const userId = await getUserId()
  const result = await consumeOtp(userId, "email", code)
  if (!result.ok) return result

  await db
    .update(user)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(user.id, userId))

  revalidatePath("/conta")
  revalidatePath("/vender")
  return { ok: true, message: "Email confirmado." }
}

export async function verifyPhoneCode(code: string): Promise<ActionResult> {
  const userId = await getUserId()
  const result = await consumeOtp(userId, "phone", code)
  if (!result.ok) return result

  await db
    .update(profile)
    .set({ phoneVerified: true, updatedAt: new Date() })
    .where(eq(profile.userId, userId))

  revalidatePath("/conta")
  revalidatePath("/vender")
  return { ok: true, message: "Telefone confirmado." }
}

/* -------------------------------------------------------------------------- */
/*                                  Sessão                                    */
/* -------------------------------------------------------------------------- */

const LOGIN_WINDOW_SECONDS = 10 * 60
const LOGIN_MAX_PER_EMAIL = 8
const LOGIN_MAX_PER_IP = 30

/* -------------------------------------------------------------------------- */
/*                 Completar cadastro (quem entrou pelo Google)               */
/* -------------------------------------------------------------------------- */

/**
 * Quem entra pelo Google chega só com nome e email. Este passo coleta o que o
 * cadastro normal já exige (nome legal, CPF único, telefone, nascimento ≥ 18 anos,
 * aceite dos termos); enquanto não for feito, comprar/vender/sacar ficam bloqueados
 * (`accountBlock` em lib/session.ts).
 */
export async function completeProfile(input: {
  fullName: string
  displayName?: string
  phone: string
  cpf: string
  birthDate: string
  acceptedTerms: boolean
}): Promise<ActionResult> {
  const userId = await getUserId()

  const fullName = input.fullName.trim()
  const displayName = input.displayName?.trim() || null
  const cpf = onlyDigits(input.cpf)
  const phone = onlyDigits(input.phone)

  if (!isValidFullName(fullName))
    return { ok: false, field: "fullName", error: "Informe seu nome completo." }
  if (displayName && !isValidDisplayName(displayName))
    return {
      ok: false,
      field: "displayName",
      error: "Use de 2 a 20 caracteres — letras, números, espaço, _ ou -.",
    }
  if (!isValidPhone(phone))
    return { ok: false, field: "phone", error: "Informe um celular válido com DDD." }
  if (!isValidCpf(cpf))
    return {
      ok: false,
      field: "cpf",
      error: "CPF inválido — os dígitos verificadores não conferem.",
    }
  if (!isValidBirthDate(input.birthDate))
    return {
      ok: false,
      field: "birthDate",
      error: "Você precisa ter 18 anos ou mais para usar a Ellowin.",
    }
  if (!input.acceptedTerms)
    return { ok: false, field: "acceptedTerms", error: "É necessário aceitar os termos de uso." }

  if (!(await hitRateLimit(`complete-profile:${userId}`, 10, 60 * 60)))
    return { ok: false, error: "Muitas tentativas. Aguarde um pouco e tente de novo." }

  const [existingCpf] = await db
    .select({ userId: profile.userId })
    .from(profile)
    .where(eq(profile.cpf, cpf))
    .limit(1)
  if (existingCpf && existingCpf.userId !== userId)
    return {
      ok: false,
      field: "cpf",
      error: "Este CPF já está vinculado a uma conta Ellowin.",
    }

  if (displayName) {
    const [existingNick] = await db
      .select({ id: user.id })
      .from(user)
      .where(sql`lower(${user.displayName}) = lower(${displayName})`)
      .limit(1)
    if (existingNick && existingNick.id !== userId)
      return { ok: false, field: "displayName", error: "Esse apelido já está em uso. Escolha outro." }
  }

  try {
    await db
      .insert(profile)
      .values({
        userId,
        fullName,
        phone,
        cpf,
        birthDate: input.birthDate,
        // Mesmo critério do cadastro por email: só o cálculo do dígito verificador
        // (não há serviço de verificação de CPF ainda).
        cpfVerified: true,
      })
      .onConflictDoUpdate({
        target: profile.userId,
        set: { fullName, phone, cpf, birthDate: input.birthDate, cpfVerified: true, updatedAt: new Date() },
      })

    // `user.name` é o nome legal (o mesmo do CPF); o do Google pode ser um apelido.
    await db
      .update(user)
      .set({ name: fullName, ...(displayName ? { displayName } : {}), updatedAt: new Date() })
      .where(eq(user.id, userId))
  } catch (error) {
    // Corrida com outro cadastro usando o mesmo CPF/apelido (índices únicos no banco).
    if (error && typeof error === "object" && "code" in error && error.code === "23505")
      return { ok: false, error: "Esse CPF ou apelido acabou de ser usado por outra conta." }
    throw error
  }

  revalidatePath("/", "layout")
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/*                            Redefinição de senha                            */
/* -------------------------------------------------------------------------- */

const RESET_REQUEST_MESSAGE =
  "Se existir uma conta com esse email, enviamos um link para redefinir a senha. Ele vale por 1 hora."

/**
 * "Esqueci minha senha". A resposta é SEMPRE a mesma, exista a conta ou não, para
 * não revelar quais emails estão cadastrados. Limites: 3 pedidos por email e
 * 10 por IP a cada hora (o limitador do Better Auth não cobre chamadas
 * `auth.api.*`, ver loginUser).
 */
export async function requestPasswordReset(input: { email: string }): Promise<ActionResult> {
  const email = input.email.trim().toLowerCase()
  if (!isValidEmail(email))
    return { ok: false, field: "email", error: "Informe um email válido." }

  const ip = await clientIp()
  const [emailOk, ipOk] = await Promise.all([
    hitRateLimit(`reset:email:${email}`, 3, 60 * 60),
    ip ? hitRateLimit(`reset:ip:${ip}`, 10, 60 * 60) : true,
  ])
  if (!emailOk || !ipOk)
    return {
      ok: false,
      error: "Muitos pedidos de redefinição. Aguarde um pouco e tente de novo.",
    }

  try {
    await auth.api.requestPasswordReset({ body: { email }, headers: new Headers() })
  } catch (error) {
    // Falha interna (ex.: envio de email): não muda a resposta ao usuário.
    console.error("[reset-password] falha ao pedir redefinição:", error)
  }

  return { ok: true, message: RESET_REQUEST_MESSAGE }
}

/** Define a nova senha a partir do token do link. O token é de uso único e expira em 1 hora. */
export async function resetPassword(input: {
  token: string
  password: string
}): Promise<ActionResult> {
  if (!input.token || input.token.length > 200)
    return { ok: false, error: "Link inválido ou expirado. Peça um novo." }

  if (!isValidPassword(input.password))
    return {
      ok: false,
      field: "password",
      error: "A senha precisa ter 8+ caracteres, com letras e números.",
    }

  const ip = await clientIp()
  if (ip && !(await hitRateLimit(`reset-confirm:ip:${ip}`, 10, 60 * 60)))
    return { ok: false, error: "Muitas tentativas. Aguarde um pouco e tente de novo." }

  try {
    await auth.api.resetPassword({
      body: { newPassword: input.password, token: input.token },
      headers: new Headers(),
    })
  } catch {
    return { ok: false, error: "Link inválido ou expirado. Peça um novo." }
  }

  return { ok: true, message: "Senha alterada. Entre com a nova senha." }
}

export async function loginUser(input: {
  email: string
  password: string
}): Promise<ActionResult> {
  const email = input.email.trim().toLowerCase().slice(0, 254)

  // auth.api.signInEmail não passa pelo limitador do Better Auth (ele só roda no
  // handler HTTP), então o freio contra tentativa de senha em massa é este:
  // por email (senha chutada a partir de vários IPs) e por IP (vários emails
  // de um IP só).
  const emailKey = `login:email:${email}`
  const ip = await clientIp()
  const [emailOk, ipOk] = await Promise.all([
    hitRateLimit(emailKey, LOGIN_MAX_PER_EMAIL, LOGIN_WINDOW_SECONDS),
    ip ? hitRateLimit(`login:ip:${ip}`, LOGIN_MAX_PER_IP, LOGIN_WINDOW_SECONDS) : true,
  ])
  if (!emailOk || !ipOk)
    return {
      ok: false,
      error: "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.",
    }

  try {
    await auth.api.signInEmail({
      body: { email, password: input.password },
      headers: new Headers(),
    })
  } catch {
    return { ok: false, error: "Email ou senha incorretos." }
  }

  await clearRateLimit(emailKey)
  revalidatePath("/")
  return { ok: true }
}
