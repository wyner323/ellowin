import { KeyRound } from "lucide-react"

/**
 * Passo a passo para o comprador de uma CONTA de jogo proteger o que recebeu enquanto ainda pode conferir. Só texto, sem
 * nada que a plataforma não faça: o objetivo é trocar os dados de acesso antes de confirmar o recebimento (depois da
 * confirmação o pagamento vai ao vendedor e não volta).
 */
export function AccountSecurityChecklist() {
  return (
    <section aria-labelledby="proteger-conta" className="flex flex-col gap-3 rounded-2xl border border-gold/40 bg-gold/5 p-5">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 size-5 shrink-0 text-gold-text" aria-hidden="true" />
        <div className="flex flex-col gap-0.5">
          <h2 id="proteger-conta" className="text-sm font-semibold">
            Proteja a conta antes de confirmar
          </h2>
          <p className="text-xs text-muted-foreground">
            Quem tem os dados antigos de acesso ou de recuperação pode tentar retomar a conta. Faça isto enquanto o pagamento ainda está em custódia.
          </p>
        </div>
      </div>
      <ol className="flex list-decimal flex-col gap-1.5 pl-9 text-sm leading-relaxed">
        <li>Entre na conta e confira se ela é o que o anúncio descreve (rank, itens, região).</li>
        <li>Troque a senha por uma nova, que você não use em outro lugar.</li>
        <li>Troque o e-mail da conta e o e-mail ou telefone de recuperação para os seus.</li>
        <li>Ative a verificação em duas etapas, se o jogo oferecer.</li>
        <li>Encerre as sessões abertas em outros aparelhos.</li>
        <li>Só então confirme o recebimento. Se algo não bater, abra uma disputa antes de confirmar.</li>
      </ol>
    </section>
  )
}
