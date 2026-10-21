/**
 * Modo férias: o vendedor tira todos os anúncios ativos da vitrine de uma vez e volta com um clique.
 * Usa um terceiro valor de `product.status` ("ferias") em vez de "pausado" para que, ao voltar, só reabra
 * o que o próprio modo escondeu: o que o vendedor pausou à mão continua pausado. Nenhum leitor público
 * compara com "pausado" (todos exigem "ativo"), então "ferias" fica fora da vitrine, da busca e do sitemap
 * pelo mesmo caminho do pausado. Puro: também é importado por componentes.
 */
export const VACATION_STATUS = "ferias"

/** Rótulo do estado de um anúncio na lista do vendedor. */
export function statusLabel(status: string) {
  if (status === "ativo") return "Ativo"
  if (status === VACATION_STATUS) return "Em férias"
  return "Pausado"
}
