import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { after } from "next/server"
import { pool } from "@/lib/db"
import { sendPasswordChangedEmail, sendPasswordResetEmail } from "@/lib/email"

export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),
  // Login, cadastro e redefinição de senha só pelas server actions
  // (app/actions/auth.ts), que aplicam o limitador em banco (e a validação de
  // CPF/perfil no cadastro). Pelo handler HTTP eles ignorariam ambos — e o pedido
  // de redefinição serviria para encher a caixa de email de alguém.
  disabledPaths: ["/sign-in/email", "/sign-up/email", "/request-password-reset", "/reset-password"],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    // Redefinição de senha: o link vale 1 hora, uso único, e ao trocar a senha
    // todas as sessões abertas caem (quem tomou a conta perde o acesso).
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    // O link aponta para a NOSSA página (/redefinir-senha), não para o endpoint
    // HTTP do Better Auth: a troca acontece numa server action com limite de taxa.
    sendResetPassword: async ({ user, url, token }) => {
      const origin = new URL(url).origin
      await sendPasswordResetEmail(user.email, `${origin}/redefinir-senha?token=${encodeURIComponent(token)}`)
    },
    onPasswordReset: async ({ user }) => {
      await sendPasswordChangedEmail(user.email)
    },
  },
  trustedOrigins: [
    ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  // Freia força bruta de senha: no máximo 5 tentativas de login por minuto
  // por IP, além do limite geral mais folgado para as demais rotas de auth.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
    },
  },
  // nextCookies precisa ser o último plugin: é ele que grava o cookie de
  // sessão quando o cadastro/login acontece dentro de uma server action.
  plugins: [nextCookies()],
  advanced: {
    // O envio do email roda depois da resposta (serverless corta promessas
    // soltas) e a resposta de "esqueci a senha" não demora mais quando o email
    // existe — o tempo de resposta não revela quais emails têm conta.
    backgroundTasks: {
      handler: (promise: Promise<unknown>) => {
        try {
          after(promise)
        } catch {
          // Fora de um request do Next (scripts, testes): a promessa já está rodando.
        }
      },
    },
    ...(process.env.NODE_ENV === "development"
      ? {
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
          },
        }
      : {}),
  },
})
