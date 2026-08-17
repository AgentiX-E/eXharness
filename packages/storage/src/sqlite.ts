import Database from 'better-sqlite3'
import { applyQuery, type Query, type StorageDriver, type StoredRecord } from './types.js'

function newId(): string {
  const c = globalThis as { crypto?: { randomUUID?: () => string } }
  if (typeof c.crypto?.randomUUID === 'function') return c.crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * An embedded SQLite driver backed by `better-sqlite3` (Node only).
 *
 * Records are stored as a `(id TEXT PRIMARY KEY, data TEXT)` table per
 * collection, where `data` is a JSON blob. This keeps the schema zero-friction
 * while preserving ACID transactions and fast lookups by primary key.
 */
export class SqliteDriver implements StorageDriver {
  readonly kind = 'sqlite'

  private db: Database.Database | null = null

  constructor(private readonly filename: string = ':memory:') {}

  async connect(): Promise<void> {
    this.db = new Database(this.filename)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('busy_timeout = 5000')
  }

  async disconnect(): Promise<void> {
    this.db?.close()
    this.db = null
  }

  private require(): Database.Database {
    if (this.db === null) throw new Error('SqliteDriver is not connected; call connect() first')
    return this.db
  }

  private tableName(collection: string): string {
    return `"${collection.replaceAll('"', '""')}"`
  }

  private ensureTable(collection: string): void {
    this.require()
      .prepare(`CREATE TABLE IF NOT EXISTS ${this.tableName(collection)} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`)
      .run()
  }

  async insert<T extends StoredRecord>(collection: string, record: T): Promise<T> {
    const id = record.id ?? newId()
    const stored = { ...record, id } as T
    this.ensureTable(collection)
    this.require()
      .prepare(`INSERT INTO ${this.tableName(collection)} (id, data) VALUES (?, ?)`)
      .run(id, JSON.stringify(stored))
    return stored
  }

  async get<T extends StoredRecord>(collection: string, id: string): Promise<T | null> {
    this.ensureTable(collection)
    const row = this.require()
      .prepare(`SELECT data FROM ${this.tableName(collection)} WHERE id = ?`)
      .get(id) as { data: string } | undefined
    return row === undefined ? null : (JSON.parse(row.data) as T)
  }

  async list<T extends StoredRecord>(collection: string, query?: Query): Promise<T[]> {
    this.ensureTable(collection)
    const rows = this.require()
      .prepare(`SELECT data FROM ${this.tableName(collection)}`)
      .all() as { data: string }[]
    const records = rows.map((row) => JSON.parse(row.data) as T)
    return applyQuery(records, query)
  }

  async update<T extends StoredRecord>(collection: string, id: string, patch: Partial<T>): Promise<T | null> {
    const existing = await this.get<T>(collection, id)
    if (existing === null) return null
    const merged = { ...existing, ...patch, id } as T
    this.require()
      .prepare(`UPDATE ${this.tableName(collection)} SET data = ? WHERE id = ?`)
      .run(JSON.stringify(merged), id)
    return merged
  }

  async remove(collection: string, id: string): Promise<boolean> {
    this.ensureTable(collection)
    const result = this.require()
      .prepare(`DELETE FROM ${this.tableName(collection)} WHERE id = ?`)
      .run(id)
    return result.changes > 0
  }

  async clear(collection: string): Promise<void> {
    this.ensureTable(collection)
    this.require()
      .prepare(`DELETE FROM ${this.tableName(collection)}`)
      .run()
  }
}
