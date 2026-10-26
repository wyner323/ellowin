import { neonConfig, Pool } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-serverless"
import ws from "ws"
import * as schema from "./schema"

// Runtimes sem WebSocket global (Node < 22) precisam do polyfill; onde já
// existe (Node 22+, browser, edge) o driver detecta sozinho.
if (typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws
}

// Só os testes de ponta a ponta (e2e/): apontam o driver para um proxy WebSocket local na frente de um Postgres comum.
// Em produção a variável não existe e nada muda.
if (process.env.ELLOWIN_DB_WSPROXY) {
  const proxy = process.env.ELLOWIN_DB_WSPROXY
  neonConfig.wsProxy = () => proxy
  neonConfig.useSecureWebSocket = false
  neonConfig.pipelineConnect = false
  neonConfig.pipelineTLS = false
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL })
// Conexão ociosa derrubada pelo banco emite "error" no pool; sem ouvinte o Node trata como exceção não capturada e derruba a função.
pool.on("error", (error: Error) => {
  console.error("[db] erro numa conexão ociosa do pool:", error.message)
})
export const db = drizzle(pool, { schema })
