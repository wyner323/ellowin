import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"

export const metadata: Metadata = {
  title: "Termos de uso",
  description:
    "Termos de uso e política de privacidade da Ellowin, marketplace de produtos digitais para games.",
}

const sections = [
  {
    title: "1. Sobre a Ellowin",
    body: [
      "A Ellowin é um marketplace que conecta compradores e vendedores de produtos digitais para games, como contas, moedas, gift cards e serviços de boosting.",
      "A Ellowin não é a vendedora dos itens anunciados: atuamos como intermediadora do pagamento e mediadora em caso de disputa entre as partes.",
    ],
  },
  {
    title: "2. Cadastro e verificação",
    body: [
      "Para criar uma conta você deve ter no mínimo 18 anos e informar dados verdadeiros, incluindo nome completo, CPF, email e telefone.",
      "O CPF é validado no momento do cadastro e o email precisa ser confirmado por código antes da liberação das funções da conta.",
      "Contas com dados falsos, duplicados ou de terceiros podem ser suspensas sem aviso prévio.",
    ],
  },
  {
    title: "3. Cadastro de vendedor",
    body: [
      "O cadastro de vendedor é feito em níveis: confirmação de email, confirmação de telefone, envio de documento (KYC) e cadastro da chave de saque.",
      "Cada nível libera novos limites de anúncio e de saque. O envio de documentos falsos resulta em bloqueio definitivo e retenção dos valores para análise.",
    ],
  },
  {
    title: "4. Pagamento intermediado",
    body: [
      "O valor pago pelo comprador fica retido pela Ellowin até a confirmação da entrega do item.",
      "Caso o comprador não confirme nem abra disputa no prazo indicado no anúncio, o valor é liberado automaticamente ao vendedor.",
      "Em caso de disputa, a Ellowin analisa as provas enviadas pelas duas partes e decide pelo reembolso ou pela liberação do valor.",
    ],
  },
  {
    title: "5. Condutas proibidas",
    body: [
      "É proibido negociar itens obtidos por invasão, fraude, chargeback ou qualquer meio ilícito.",
      "É proibido combinar pagamento fora da plataforma, o que remove a proteção do pagamento intermediado e caracteriza violação destes termos.",
    ],
  },
  {
    title: "6. Dados pessoais",
    body: [
      "Coletamos apenas os dados necessários para identificar as partes, prevenir fraudes e cumprir obrigações legais.",
      "Documentos enviados para verificação são usados exclusivamente na análise de identidade e não são compartilhados com outros usuários.",
    ],
  },
]

export default function TermosPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-12">
        <header className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            Termos de uso e privacidade
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Este é um ambiente de demonstração da Ellowin. O texto abaixo
            descreve como o fluxo de cadastro, verificação e pagamento
            intermediado da plataforma funcionaria em produção.
          </p>
        </header>

        <div className="mt-10 flex flex-col gap-8">
          {sections.map((section) => (
            <section key={section.title} className="flex flex-col gap-3">
              <h2 className="text-base font-semibold">{section.title}</h2>
              {section.body.map((paragraph) => (
                <p
                  key={paragraph}
                  className="text-sm leading-relaxed text-muted-foreground"
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        <p className="mt-10 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
          Última atualização: julho de 2026. Dúvidas sobre estes termos podem ser
          enviadas pela central de segurança.
        </p>
      </main>
      <SiteFooter />
    </>
  )
}
