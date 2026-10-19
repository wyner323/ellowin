import { createInterface } from "node:readline/promises"
import { neonConfig, Pool } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-serverless"
import { migrate } from "drizzle-orm/neon-serverless/migrator"
import ws from "ws"

if (typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws
}

// `pnpm db:migrate` lê o .env.local, e o DATABASE_URL de lá é o banco de PRODUÇÃO. Em vez de aplicar sem avisar,
// mostra o destino e pede confirmação (`--yes` para quem roda sem terminal, como um script).
const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL ausente. Rode com `pnpm db:migrate` (lê o .env.local).")
  process.exit(1)
}
const host = new URL(url).host

if (!process.argv.includes("--yes")) {
  if (!process.stdin.isTTY) {
    console.error(`Recusado: este comando altera o banco em ${host}. Sem terminal para confirmar, rode de novo com --yes.`)
    process.exit(1)
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`Aplicar as migrações em ${host}? Digite "sim" para continuar: `)
  rl.close()
  if (answer.trim().toLowerCase() !== "sim") {
    console.log("Cancelado. Nada foi alterado.")
    process.exit(1)
  }
}

const pool = new Pool({ connectionString: url })
const db = drizzle(pool)

await migrate(db, { migrationsFolder: "./drizzle" })
await pool.end()

console.log("Migrações aplicadas.")
