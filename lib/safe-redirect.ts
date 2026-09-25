/**
 * Destino de redirecionamento vindo da URL (?next=). Só caminho interno:
 * "//evil.com" e "/\evil.com" começam com "/" mas o navegador os trata como outro site.
 */
export function safeNext(raw: string | string[] | undefined, fallback = "/conta"): string {
  const value = Array.isArray(raw) ? raw[0] : raw
  return value && /^\/(?![/\\])/.test(value) ? value : fallback
}
