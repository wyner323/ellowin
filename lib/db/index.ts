import { neonConfig, Pool } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-serverless"
import ws from "ws"
import * as schema from "./schema"

// Runtimes sem WebSocket global (Node < 22) precisam do polyfill; onde já
// existe (Node 22+, browser, edge) o driver detecta sozinho.
if (typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool, { schema })
