import pg from 'pg'
import { applyQuery, type Query, type StorageDriver, type StoredRecord } from './types.js'

function newId(): string {
  const c = globalThis as { crypto?: { randomUUID?: () => string } }
  if (typeof c.crypto?.randomUUID === 'function') return c.crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function escapeIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}

/**
 * A remote distributed PostgreSQL driver (Node only).
 *
 * Each collection maps to a `(id TEXT PRIMARY KEY, data JSONB)` table. All
 * queries are parameterized to prevent SQL injection. `list` filtering is
 * performed in-process after a JSONB round-trip for a uniform, driver-agnostic
 * `Query` contract; equality predicates can later be pushed down to `->>`.
 */
export class PostgresDriver implements StorageDriver {
  readonly kind = 'postgres'

  private pool: pg.Pool | null = null

  constructor(private readonly config: pg.PoolConfig) {}

  async connect(): Promise<void> {
    this.pool = new pg.Pool(this.config)
    await this.pool.query('SELECT 1')
  }

  async disconnect(): Promise<void> {
    await this.pool?.end()
    this.pool = null
  }

  private require(): pg.Pool {
    if (this.pool === null) throw new Error('PostgresDriver is not connected; call connect() first')
    return this.pool
  }

  private async ensureTable(collection: string): Promise<void> {
    await this.require().query(
      `CREATE TABLE IF NOT EXISTS ${escapeIdent(collection)} (id TEXT PRIMARY KEY, data JSONB NOT NULL)`,
    )
  }

  async insert<T extends StoredRecord>(collection: string, record: T): Promise<T> {
    const id = record.id ?? newId()
    const stored = { ...record, id } as T
    await this.ensureTable(collection)
    await this.require().query(`INSERT INTO ${escapeIdent(collection)} (id, data) VALUES ($1, $2::jsonb)`, [
      id,
      JSON.stringify(stored),
    ])
    return stored
  }

  async get<T extends StoredRecord>(collection: string, id: string): Promise<T | null> {
    await this.ensureTable(collection)
    const result = await this.require().query(`SELECT data FROM ${escapeIdent(collection)} WHERE id = $1`, [id])
    return result.rowCount === 0 ? null : (result.rows[0].data as T)
  }

  async list<T extends StoredRecord>(collection: string, query?: Query): Promise<T[]> {
    await this.ensureTable(collection)
    const result = await this.require().query(`SELECT data FROM ${escapeIdent(collection)}`)
    const records = result.rows.map((row) => row.data as T)
    return applyQuery(records, query)
  }

  async update<T extends StoredRecord>(collection: string, id: string, patch: Partial<T>): Promise<T | null> {
    const existing = await this.get<T>(collection, id)
    if (existing === null) return null
    const merged = { ...existing, ...patch, id } as T
    await this.require().query(`UPDATE ${escapeIdent(collection)} SET data = $1::jsonb WHERE id = $2`, [
      JSON.stringify(merged),
      id,
    ])
    return merged
  }

  async remove(collection: string, id: string): Promise<boolean> {
    await this.ensureTable(collection)
    const result = await this.require().query(`DELETE FROM ${escapeIdent(collection)} WHERE id = $1`, [id])
    return (result.rowCount ?? 0) > 0
  }

  async clear(collection: string): Promise<void> {
    await this.ensureTable(collection)
    await this.require().query(`DELETE FROM ${escapeIdent(collection)}`)
  }
}
