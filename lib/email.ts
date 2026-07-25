import { Resend } from "resend"

const FROM = process.env.ELLOWIN_EMAIL_FROM ?? "Ellowin <onboarding@resend.dev>"

function client() {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

type SendResult = { sent: boolean; error?: string }

function otpTemplate({
  code,
  title,
  intro,
}: {
  code: string
  title: string
  intro: string
}) {
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:32px 16px;background:#f5f3ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ede9fe;">
      <tr>
        <td style="background:#6d28d9;padding:24px 32px;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">
          Ellowin
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 12px;font-size:20px;color:#1f1235;">${title}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b4563;">${intro}</p>
          <div style="text-align:center;margin:0 0 24px;">
            <span style="display:inline-block;padding:16px 28px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;font-size:32px;font-weight:700;letter-spacing:10px;color:#5b21b6;">${code}</span>
          </div>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6b6480;">
            O código expira em 10 minutos e só pode ser usado uma vez.
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#6b6480;">
            Se você não solicitou este código, ignore este email — nenhuma alteração foi feita na sua conta.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 32px;background:#faf9ff;font-size:12px;color:#8b849f;">
          Ellowin — marketplace de produtos digitais com pagamento intermediado.
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export async function sendEmailOtp(
  to: string,
  code: string,
): Promise<SendResult> {
  const resend = client()
  if (!resend) {
    console.log("[v0] RESEND_API_KEY ausente, código de email não enviado")
    return { sent: false, error: "RESEND_API_KEY não configurada" }
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      subject: `${code} é o seu código de verificação Ellowin`,
      html: otpTemplate({
        code,
        title: "Confirme seu email",
        intro:
          "Use o código abaixo para confirmar seu endereço de email e liberar as compras na Ellowin.",
      }),
    })
    if (error) {
      console.log("[v0] Erro Resend (email):", error.message)
      return { sent: false, error: error.message }
    }
    return { sent: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha no envio"
    console.log("[v0] Exceção ao enviar email:", message)
    return { sent: false, error: message }
  }
}

/**
 * Não há provedor de SMS configurado neste ambiente de testes, então o código
 * do telefone é enviado para o email verificado do usuário, deixando isso
 * explícito no conteúdo da mensagem.
 */
export async function sendPhoneOtpByEmail(
  to: string,
  code: string,
  phone: string,
): Promise<SendResult> {
  const resend = client()
  if (!resend) {
    console.log("[v0] RESEND_API_KEY ausente, código de telefone não enviado")
    return { sent: false, error: "RESEND_API_KEY não configurada" }
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      subject: `${code} é o seu código de verificação de telefone`,
      html: otpTemplate({
        code,
        title: "Confirme seu telefone",
        intro: `Este é o código de verificação do telefone <strong>${phone}</strong>. Em produção ele chegaria por SMS; no ambiente de testes enviamos por email.`,
      }),
    })
    if (error) {
      console.log("[v0] Erro Resend (telefone):", error.message)
      return { sent: false, error: error.message }
    }
    return { sent: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha no envio"
    console.log("[v0] Exceção ao enviar código de telefone:", message)
    return { sent: false, error: message }
  }
}
