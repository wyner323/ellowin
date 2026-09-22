import { neonConfig, Pool } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-serverless"
import { migrate } from "drizzle-orm/neon-serverless/migrator"
import ws from "ws"

if (typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle(pool)

await migrate(db, { migrationsFolder: "./drizzle" })
await pool.end()

console.log("Migrações aplicadas.")
