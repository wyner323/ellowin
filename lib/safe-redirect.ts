/** Origem fictícia só para resolver o valor como o navegador faria. */
const BASE = "https://safe-redirect.invalid"

/**
 * Destino de redirecionamento vindo da URL (?next=). Só caminho interno.
 *
 * Não basta olhar o segundo caractere ("//evil.com" e "/\evil.com"): o parser de URL do
 * navegador também descarta TAB, LF e CR de qualquer posição antes de resolver, então
 * "/<TAB>/evil.com" passaria e viraria "//evil.com". Por isso qualquer caractere de controle
 * é recusado, e o valor é resolvido com o mesmo parser: se a origem mudar, cai no fallback.
 */
export function safeNext(raw: string | string[] | undefined, fallback = "/conta"): string {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value || !value.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(value)) return fallback
  try {
    const url = new URL(value, BASE)
    if (url.origin !== BASE) return fallback
    // Devolve o valor ORIGINAL, não o normalizado: "/..//x" normaliza para "//x", que o navegador
    // trataria como outro site, enquanto o original resolve para um caminho do próprio site.
    return value
  } catch {
    return fallback
  }
}
