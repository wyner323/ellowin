// Cifra os dados de entrega que ainda estão em texto puro (lib/secret-box.ts).
//
// Uso (com DELIVERY_ENCRYPTION_KEY definida, a MESMA que está na Vercel):
//   node --env-file=.env.local scripts/encrypt-delivery-payloads.mjs
// Só simula por padrão; passe --apply para gravar. É idempotente: linhas que já
// começam com "enc:v1:" são ignoradas.
import { createCipheriv, randomBytes } from "node:crypto"
import { neonConfig, Pool } from "@neondatabase/serverless"
import ws from "ws"

neonConfig.webSocketConstructor = ws

const apply = process.argv.includes("--apply")
const raw = process.env.DELIVERY_ENCRYPTION_KEY
const key = raw ? Buffer.from(raw, "base64") : null
if (!key || key.length !== 32) {
  console.error("Defina DELIVERY_ENCRYPTION_KEY (32 bytes em base64) antes de rodar.")
  process.exit(1)
}

function encrypt(plain, context) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(Buffer.from(context))
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return `enc:v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${data.toString("base64")}`
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
try {
  const { rows } = await pool.query(
    `SELECT "id", "deliveryPayload" FROM "order"
      WHERE "deliveryPayload" IS NOT NULL AND "deliveryPayload" NOT LIKE 'enc:v1:%'`,
  )
  console.log(`${rows.length} pedido(s) com dados de entrega em texto puro.`)

  if (apply) {
    for (const row of rows) {
      await pool.query(`UPDATE "order" SET "deliveryPayload" = $2 WHERE "id" = $1`, [
        row.id,
        encrypt(row.deliveryPayload, `order:${row.id}`),
      ])
    }
    console.log("Cifrados.")
  } else {
    console.log("Simulação: nada foi gravado. Rode com --apply para cifrar.")
  }
} finally {
  await pool.end()
}
