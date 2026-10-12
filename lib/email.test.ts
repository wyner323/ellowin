import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Emails de conta e envio (Resend). O que importa: nada digitado por alguém vira
 * HTML ou escapa de um atributo; sem chave o envio é recusado em vez de falhar
 * calado; e o resultado do provedor vira `{ sent }` sem estourar para quem chamou.
 */

const send = vi.hoisted(() => vi.fn())
const ctor = vi.hoisted(() => vi.fn())

vi.mock("resend", () => ({
  Resend: class {
    emails = { send }
    constructor(key: string) {
      ctor(key)
    }
  },
}))

type Email = typeof import("@/lib/email")
let email: Email

beforeEach(async () => {
  vi.resetModules()
  vi.stubEnv("ELLOWIN_EMAIL_FROM", "Ellowin <aviso@ellowin.com.br>")
  vi.stubEnv("RESEND_API_KEY", "re_chave_de_teste")
  send.mockReset()
  send.mockResolvedValue({ data: { id: "1" }, error: null })
  ctor.mockReset()
  vi.spyOn(console, "log").mockImplementation(() => {})
  email = await import("@/lib/email")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const lastCall = () => send.mock.calls[0][0] as { from: string; to: string; subject: string; html: string }

describe("actionTemplate", () => {
  const base = { title: "Título", intro: "Introdução", footnote: "Rodapé" }

  it("escapa HTML em título, introdução, rótulo e rodapé (nada digitado vira marcação)", () => {
    const html = email.actionTemplate({
      title: "<script>alert(1)</script>",
      intro: 'Oi <img src=x onerror="x"> & "aspas" \'simples\'',
      buttonLabel: "<b>Clique</b>",
      buttonUrl: "https://ellowin.com.br/x",
      footnote: "<i>nota</i>",
    })
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("<img")
    expect(html).not.toContain("<b>Clique</b>")
    expect(html).not.toContain("<i>nota</i>")
    expect(html).toContain("&#60;script&#62;alert(1)&#60;/script&#62;")
    expect(html).toContain("&#38; &#34;aspas&#34; &#39;simples&#39;")
  })

  it("a URL do botão não escapa do atributo href (aspas viram entidade)", () => {
    const html = email.actionTemplate({
      ...base,
      buttonLabel: "Abrir",
      buttonUrl: 'https://x.com/"><script>alert(1)</script>',
    })
    expect(html).not.toContain('"><script>')
    expect(html).toContain('href="https://x.com/&#34;&#62;&#60;script&#62;alert(1)&#60;/script&#62;"')
  })

  it("com rótulo e URL mostra o botão e o endereço por extenso; sem um dos dois, sem botão", () => {
    const comBotao = email.actionTemplate({ ...base, buttonLabel: "Abrir", buttonUrl: "https://ellowin.com.br/p" })
    expect(comBotao).toContain('<a href="https://ellowin.com.br/p"')
    expect(comBotao).toContain("Se o botão não abrir")
    expect(email.actionTemplate({ ...base })).not.toContain("<a href")
    expect(email.actionTemplate({ ...base, buttonLabel: "Abrir" })).not.toContain("<a href")
    expect(email.actionTemplate({ ...base, buttonUrl: "https://ellowin.com.br/p" })).not.toContain("<a href")
  })

  it("traz o conteúdo e a marca", () => {
    const html = email.actionTemplate(base)
    expect(html).toContain("<h1")
    expect(html).toContain("Título")
    expect(html).toContain("Introdução")
    expect(html).toContain("Rodapé")
    expect(html).toContain("Ellowin")
  })
})

describe("sendMail", () => {
  it("sem RESEND_API_KEY recusa o envio sem chamar o provedor", async () => {
    vi.stubEnv("RESEND_API_KEY", "")
    const r = await email.sendMail("ana@teste.dev", "Assunto", "<p>oi</p>", "teste")
    expect(r).toEqual({ sent: false, error: "RESEND_API_KEY não configurada" })
    expect(send).not.toHaveBeenCalled()
  })

  it("com chave envia do remetente configurado para o destinatário", async () => {
    const r = await email.sendMail("ana@teste.dev", "Assunto", "<p>oi</p>", "teste")
    expect(r).toEqual({ sent: true })
    expect(ctor).toHaveBeenCalledWith("re_chave_de_teste")
    expect(send).toHaveBeenCalledWith({ from: "Ellowin <aviso@ellowin.com.br>", to: "ana@teste.dev", subject: "Assunto", html: "<p>oi</p>" })
  })

  it("erro devolvido pelo provedor vira sent:false com a mensagem", async () => {
    send.mockResolvedValue({ data: null, error: { message: "domínio não verificado" } })
    expect(await email.sendMail("ana@teste.dev", "A", "<p/>", "t")).toEqual({ sent: false, error: "domínio não verificado" })
  })

  it("exceção do provedor não estoura: vira sent:false", async () => {
    send.mockRejectedValue(new Error("rede caiu"))
    expect(await email.sendMail("ana@teste.dev", "A", "<p/>", "t")).toEqual({ sent: false, error: "rede caiu" })
    send.mockRejectedValue("texto solto")
    expect(await email.sendMail("ana@teste.dev", "A", "<p/>", "t")).toEqual({ sent: false, error: "Falha no envio" })
  })

  it("não registra o conteúdo do email nos logs (só o rótulo)", async () => {
    vi.stubEnv("RESEND_API_KEY", "")
    await email.sendMail("ana@teste.dev", "Assunto", "<p>segredo-no-corpo</p>", "link de teste")
    const logs = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c.join(" ")).join("\n")
    expect(logs).toContain("link de teste")
    expect(logs).not.toContain("segredo-no-corpo")
  })
})

describe("códigos de verificação", () => {
  it("email: o código vai no assunto e em destaque no corpo", async () => {
    expect(await email.sendEmailOtp("ana@teste.dev", "482913")).toEqual({ sent: true })
    const c = lastCall()
    expect(c.to).toBe("ana@teste.dev")
    expect(c.subject).toBe("482913 é o seu código de verificação Ellowin")
    expect(c.html).toContain(">482913</span>")
    expect(c.html).toContain("expira em 10 minutos")
  })

  it("o código também é escapado no corpo (defesa em profundidade)", async () => {
    await email.sendEmailOtp("ana@teste.dev", "<b>1</b>")
    expect(lastCall().html).not.toContain("<b>1</b>")
    expect(lastCall().html).toContain("&#60;b&#62;1&#60;/b&#62;")
  })

  it("email sem chave: não envia e diz por quê", async () => {
    vi.stubEnv("RESEND_API_KEY", "")
    expect(await email.sendEmailOtp("ana@teste.dev", "482913")).toEqual({ sent: false, error: "RESEND_API_KEY não configurada" })
    expect(send).not.toHaveBeenCalled()
  })

  it("email: erro do provedor ou exceção viram sent:false", async () => {
    send.mockResolvedValue({ data: null, error: { message: "limite" } })
    expect(await email.sendEmailOtp("ana@teste.dev", "1")).toEqual({ sent: false, error: "limite" })
    send.mockRejectedValue(new Error("boom"))
    expect(await email.sendEmailOtp("ana@teste.dev", "1")).toEqual({ sent: false, error: "boom" })
  })

  it("telefone: o código vai para o email, citando o telefone", async () => {
    expect(await email.sendPhoneOtpByEmail("ana@teste.dev", "112233", "(11) 94567-8901")).toEqual({ sent: true })
    const c = lastCall()
    expect(c.to).toBe("ana@teste.dev")
    expect(c.subject).toBe("112233 é o seu código de verificação de telefone")
    expect(c.html).toContain("<strong>(11) 94567-8901</strong>")
  })

  it("telefone: o número é escapado (não vira HTML)", async () => {
    await email.sendPhoneOtpByEmail("ana@teste.dev", "112233", '<img src=x onerror="a">')
    const c = lastCall()
    expect(c.html).not.toContain("<img")
    expect(c.html).toContain("&#60;img src=x onerror=&#34;a&#34;&#62;")
  })

  it("telefone sem chave ou com falha: sent:false", async () => {
    send.mockResolvedValue({ data: null, error: { message: "sem saldo" } })
    expect(await email.sendPhoneOtpByEmail("a@b.dev", "1", "11")).toEqual({ sent: false, error: "sem saldo" })
    send.mockRejectedValue(new Error("boom"))
    expect(await email.sendPhoneOtpByEmail("a@b.dev", "1", "11")).toEqual({ sent: false, error: "boom" })
    vi.stubEnv("RESEND_API_KEY", "")
    expect(await email.sendPhoneOtpByEmail("a@b.dev", "1", "11")).toEqual({ sent: false, error: "RESEND_API_KEY não configurada" })
  })
})

describe("emails de conta", () => {
  it("redefinição de senha: link no botão (escapado), validade de 1 hora e aviso de ignorar", async () => {
    await email.sendPasswordResetEmail("ana@teste.dev", "https://ellowin.com.br/redefinir-senha?token=abc&x=1")
    const c = lastCall()
    expect(c.to).toBe("ana@teste.dev")
    expect(c.subject).toBe("Redefina a sua senha da Ellowin")
    expect(c.html).toContain('href="https://ellowin.com.br/redefinir-senha?token=abc&#38;x=1"')
    expect(c.html).toContain("1 hora")
    expect(c.html).toContain("ignore este email")
  })

  it("senha alterada: sem botão, e diz que as sessões foram encerradas", async () => {
    await email.sendPasswordChangedEmail("ana@teste.dev")
    const c = lastCall()
    expect(c.subject).toBe("A senha da sua conta Ellowin foi alterada")
    expect(c.html).not.toContain("<a href")
    expect(c.html).toContain("sessões abertas foram encerradas")
  })

  it("conta excluída: confirma a exclusão e cita a retenção legal", async () => {
    await email.sendAccountDeletedEmail("ana@teste.dev")
    const c = lastCall()
    expect(c.subject).toBe("Sua conta Ellowin foi excluída")
    expect(c.html).toContain("Conta excluída")
    expect(c.html).toContain("obrigação legal")
    expect(c.html).not.toContain("<a href")
  })

  it("devolvem o resultado do envio (falha incluída)", async () => {
    send.mockResolvedValue({ data: null, error: { message: "x" } })
    expect(await email.sendPasswordResetEmail("a@b.dev", "https://ellowin.com.br")).toEqual({ sent: false, error: "x" })
    expect(await email.sendPasswordChangedEmail("a@b.dev")).toEqual({ sent: false, error: "x" })
    expect(await email.sendAccountDeletedEmail("a@b.dev")).toEqual({ sent: false, error: "x" })
  })
})

describe("remetente", () => {
  it("sem ELLOWIN_EMAIL_FROM usa o remetente de teste do Resend", async () => {
    vi.resetModules()
    vi.stubEnv("ELLOWIN_EMAIL_FROM", "")
    delete process.env.ELLOWIN_EMAIL_FROM
    const fresh = await import("@/lib/email")
    await fresh.sendMail("a@b.dev", "A", "<p/>", "t")
    expect(lastCall().from).toBe("Ellowin <onboarding@resend.dev>")
  })
})
