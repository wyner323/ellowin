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
    title: "6. Dados pessoais e privacidade (LGPD)",
    body: [
      "Coletamos apenas os dados necessários para identificar as partes, viabilizar a compra e venda, prevenir fraudes e cumprir obrigações legais: nome completo, CPF, data de nascimento, telefone, email, e — para vendedores — documento de identidade e chave Pix.",
      "O CPF e o documento de identidade têm base legal no cumprimento de obrigação legal e regulatória (prevenção à fraude e à lavagem de dinheiro) e no legítimo interesse da Ellowin em manter um ambiente de negociação seguro. Os demais dados de cadastro têm base na execução do contrato entre você e a Ellowin.",
      "Documentos enviados para verificação (KYC) são usados exclusivamente na análise de identidade e nunca são exibidos a outros usuários — nem mesmo ao vendedor ou comprador da outra ponta de uma negociação.",
      "O texto exibido no seu perfil, na loja e nas avaliações é sempre o apelido que você escolhe (\"nome de exibição\"), nunca o nome legal.",
      "Os dados de entrega de um pedido (login, senha e códigos de uma conta de jogo, por exemplo) ficam cifrados no banco de dados e só aparecem, dentro do site, para o comprador daquele pedido específico — nunca por email.",
      "Guardamos os dados de uma conta encerrada pelo tempo exigido por lei para fins fiscais, contábeis e de prevenção a fraude (tipicamente 5 anos após a última movimentação financeira), mesmo depois de uma solicitação de exclusão — o que muda é que o perfil deixa de ser público e de poder ser usado para novo login.",
      "Você pode, a qualquer momento: acessar e corrigir seus dados em \"Minha conta\"; pedir a portabilidade dos seus dados; revogar consentimentos que dependam dele; e solicitar a exclusão (anonimização) da sua conta pela própria página \"Minha conta\", quando não houver pedido em andamento, anúncio ativo ou saldo na carteira.",
      "Dúvidas, reclamações ou pedidos sobre seus dados pessoais que não puderem ser resolvidos pela própria conta podem ser enviados pela central de segurança.",
    ],
  },
]

export default function TermosPage() {
  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 py-12">
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
