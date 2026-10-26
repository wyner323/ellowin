// Sobe tudo que os testes de ponta a ponta precisam, num processo só (o `webServer` do Playwright roda este arquivo):
// banco descartável + semente, proxy WebSocket para o driver da Neon, e o próprio app (`next start`, ou `next dev` com E2E_DEV=1).
import { spawn } from "node:child_process"
import net from "node:net"
import { WebSocketServer } from "ws"
import { E2E_PORT, WS_PROXY_PORT, adminUrl, e2eDatabaseUrl } from "./env.mjs"
import { createAndSeed } from "./seed.mjs"

const pgTarget = new URL(adminUrl())
const pgHost = pgTarget.hostname
const pgPort = Number(pgTarget.port || 5432)
if (!["localhost", "127.0.0.1", "::1"].includes(pgHost) && process.env.E2E_ALLOW_REMOTE_PG !== "1") {
  throw new Error(`PG_TEST_URL aponta para ${pgHost}: use um Postgres local/descartável (ou E2E_ALLOW_REMOTE_PG=1 se for um serviço de teste).`)
}

await createAndSeed()

// O driver da Neon só fala WebSocket; este proxy repassa os bytes do protocolo para o Postgres comum.
// Sempre conecta no Postgres configurado, ignorando o endereço pedido pelo cliente.
const wss = new WebSocketServer({ port: WS_PROXY_PORT })
wss.on("connection", (ws) => {
  const socket = net.connect(pgPort, pgHost)
  ws.on("message", (data) => socket.write(data))
  socket.on("data", (chunk) => ws.send(chunk))
  socket.on("close", () => ws.close())
  socket.on("error", () => ws.close())
  ws.on("close", () => socket.destroy())
  ws.on("error", () => socket.destroy())
})

const databaseUrl = new URL(e2eDatabaseUrl())
databaseUrl.searchParams.set("sslmode", "disable")

// Variáveis do .env.local (produção!) que o Next carregaria sozinho: sobrescritas aqui para nada de produção ser usado.
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl.toString(),
  DATABASE_URL_UNPOOLED: "",
  POSTGRES_URL: "",
  POSTGRES_URL_NON_POOLING: "",
  POSTGRES_PRISMA_URL: "",
  POSTGRES_URL_NO_SSL: "",
  RESEND_API_KEY: "",
  RESEND_API_KE_RESEND_API_KEY: "",
  BLOB_READ_WRITE_TOKEN: "",
  ELLOWIN_ADMIN_EMAIL: "",
  ELLOWIN_NOTIFY: "",
  VERCEL_ENV: "development",
  VERCEL_URL: "",
  ELLOWIN_DB_WSPROXY: `localhost:${WS_PROXY_PORT}/v1`,
  BETTER_AUTH_SECRET: "e2e-only-secret-0123456789abcdefghijklmnopqrstuvwxyz",
  BETTER_AUTH_URL: `http://localhost:${E2E_PORT}`,
  DELIVERY_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  ELLOWIN_DEMO_OTP: "true",
  NEXT_TELEMETRY_DISABLED: "1",
}

const dev = process.env.E2E_DEV === "1"
const nextBin = "node_modules/next/dist/bin/next"
const child = spawn(process.execPath, [nextBin, dev ? "dev" : "start", "-p", String(E2E_PORT)], { env, stdio: "inherit" })

const stop = () => {
  child.kill()
  wss.close()
  process.exit(0)
}
process.on("SIGTERM", stop)
process.on("SIGINT", stop)
child.on("exit", (code) => process.exit(code ?? 1))
