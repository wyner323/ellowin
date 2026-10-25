import { randomBytes } from "node:crypto"
import pg from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import * as schema from "@/lib/db/schema"
import { migrationStatements } from "@/lib/test-db"

/**
 * Postgres DE VERDADE para os testes de concorrência (`*.pg.test.ts`), onde o PGlite não serve: ele tem uma conexão só,
 * então duas transações realmente simultâneas (a disputa pela última unidade, a confirmação em dobro, o saque em dobro)
 * nunca se encontram. Aqui cada teste usa um pool de conexões reais e o banco é criado do zero (com as migrações de
 * `drizzle/`) e apagado no fim, então nada encosta em dado de ninguém.
 *
 * Liga com `PG_TEST_URL` (uma conexão administrativa, ex.: postgresql://postgres:postgres@localhost:5432/postgres). Sem a
 * variável os testes se pulam sozinhos; a CI sobe um serviço Postgres e define a variável. NUNCA aponte para o banco de
 * produção: o código cria e apaga bancos `ellowin_test_*` nesse servidor.
 */

export function realPgUrl(): string | null {
  const url = process.env.PG_TEST_URL?.trim()
  return url ? url : null
}

export type RealPgDb = {
  pool: pg.Pool
  db: ReturnType<typeof drizzle<typeof schema>>
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }>
  close: () => Promise<void>
}

export async function createRealPgDb(adminUrl: string): Promise<RealPgDb> {
  const name = `ellowin_test_${randomBytes(6).toString("hex")}`

  const admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  try {
    await admin.query(`CREATE DATABASE ${name}`)
  } finally {
    await admin.end()
  }

  const url = new URL(adminUrl)
  url.pathname = `/${name}`
  // UTC como o Neon: as colunas `timestamp` (sem fuso) não podem mudar de significado conforme a máquina.
  const pool = new pg.Pool({ connectionString: url.toString(), max: 16, options: "-c timezone=UTC" })
  // Erro numa conexão ociosa (o servidor caiu ao encerrar) não pode derrubar o processo de teste.
  pool.on("error", () => {})

  for (const statement of migrationStatements()) await pool.query(statement)

  return {
    pool,
    db: drizzle(pool, { schema }),
    query: async (text, params) => {
      const result = await pool.query(text, params)
      return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length }
    },
    close: async () => {
      await pool.end()
      const cleanup = new pg.Client({ connectionString: adminUrl })
      await cleanup.connect()
      try {
        await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
      } finally {
        await cleanup.end()
      }
    },
  }
}
