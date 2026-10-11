import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import * as schema from "@/lib/db/schema"
import type { PoolClient } from "@neondatabase/serverless"

/**
 * Banco de teste em memória (PGlite = Postgres de verdade compilado para WASM),
 * só para os testes. Aplica as migrações de `drizzle/` na ordem, então o schema,
 * as `CHECK` de saldo negativo e o `FOR UPDATE` são os do banco real — sem Neon,
 * sem rede e, principalmente, sem encostar no banco de produção.
 *
 * Limite honesto: é UMA conexão. Dá para testar a aritmética, o extrato, os
 * rollbacks e as travas de estado, mas não duas transações realmente simultâneas.
 * Para o código que abre transações em paralelo (a rotina de prazos roda as três
 * varreduras juntas), `pool.connect()` entrega a conexão a uma transação por vez:
 * é o que o `FOR UPDATE` garante no Neon, onde a segunda espera a primeira.
 */

type QueryResult = { rows: Record<string, unknown>[]; rowCount: number }

export type TestDb = {
  /** Mesmo formato de `PoolClient` que `lib/wallet.ts` espera. */
  client: PoolClient
  /** Substituto do `pool` de `@/lib/db` (query + connect). */
  pool: { query: (text: string, params?: unknown[]) => Promise<QueryResult>; connect: () => Promise<PoolClient> }
  query: (text: string, params?: unknown[]) => Promise<QueryResult>
  /** Substituto do `db` (Drizzle) de `@/lib/db`, sobre o mesmo banco em memória. */
  db: ReturnType<typeof drizzle<typeof schema>>
  close: () => Promise<void>
}

export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite()
  // O Neon roda em UTC; sem isto o PGlite usa o fuso da máquina e `now()` gravado em colunas
  // `timestamp` (sem fuso) deixa de bater com as datas que o Drizzle envia (ISO em UTC).
  await pg.exec("SET TIME ZONE 'UTC'")

  const dir = path.resolve(process.cwd(), "drizzle")
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
  for (const file of files) {
    const text = readFileSync(path.join(dir, file), "utf8")
    for (const statement of text.split("--> statement-breakpoint")) {
      if (statement.trim()) await pg.exec(statement)
    }
  }

  const query = async (text: string, params?: unknown[]): Promise<QueryResult> => {
    const result = await pg.query<Record<string, unknown>>(text, params)
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length }
  }
  const client = { query, release() {} } as unknown as PoolClient

  // Uma transação por vez: quem pede a conexão espera a anterior liberar.
  let tail: Promise<void> = Promise.resolve()
  const connect = async (): Promise<PoolClient> => {
    const previous = tail
    let unlock!: () => void
    tail = new Promise<void>((resolve) => {
      unlock = resolve
    })
    await previous
    let released = false
    return {
      query,
      release() {
        if (released) return
        released = true
        unlock()
      },
    } as unknown as PoolClient
  }

  return {
    client,
    pool: { query, connect },
    query,
    db: drizzle(pg, { schema }),
    close: () => pg.close(),
  }
}
