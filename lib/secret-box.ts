import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/**
 * Criptografia em repouso (AES-256-GCM) para dados que não devem ficar legíveis
 * no banco — hoje, os dados de entrega (login/senha de contas de jogo, códigos).
 * Um dump do banco ou um acesso SQL indevido não entrega mais as credenciais.
 *
 * A chave vem de DELIVERY_ENCRYPTION_KEY (32 bytes em base64:
 * `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
 * Sem a chave configurada, os valores continuam sendo gravados em texto puro e
 * lidos normalmente — assim o deploy não quebra antes de a variável existir.
 * Valores já cifrados têm o prefixo `enc:v1:` e exigem a chave para ler.
 *
 * O `context` (ex.: `order:42`) entra como dado autenticado: um valor cifrado
 * copiado para a linha de OUTRO pedido deixa de decifrar.
 */

const PREFIX = "enc:v1:"

function key(): Buffer | null {
  const raw = process.env.DELIVERY_ENCRYPTION_KEY
  if (!raw) return null
  const buf = Buffer.from(raw, "base64")
  if (buf.length !== 32) {
    throw new Error("DELIVERY_ENCRYPTION_KEY deve ter 32 bytes em base64")
  }
  return buf
}

export function isEncrypted(value: string) {
  return value.startsWith(PREFIX)
}

export function encryptField(plain: string, context: string): string {
  const k = key()
  if (!k) return plain

  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", k, iv)
  cipher.setAAD(Buffer.from(context))
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`
}

export function decryptField(value: string, context: string): string {
  if (!isEncrypted(value)) return value // legado em texto puro

  const k = key()
  if (!k) throw new Error("Dado cifrado, mas DELIVERY_ENCRYPTION_KEY não está configurada")

  const [iv, tag, data] = value.slice(PREFIX.length).split(":")
  if (!iv || !tag || !data) throw new Error("Formato de dado cifrado inválido")

  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"))
  decipher.setAAD(Buffer.from(context))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8")
}
