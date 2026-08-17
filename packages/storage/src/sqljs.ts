import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { applyQuery, type Query, type StorageDriver, type StoredRecord } from './types.js'

/**
 * An embedded SQLite driver backed by `sql.js` (SQLite compiled to WASM). It
 * implements the same `StorageDriver` contract as `SqliteDriver` but runs in
 * the browser. Persistence is pluggable: supply a `persistence` implementation
 * (e.g. OPFS) and the database is saved on `disconnect` and loaded on
 * `connect`; omit it for an in-memory database.
 */

export interface SqlJsPersistence {
  /** Load a previously-saved database image, or null when none exists. */
  load(): Promise<Uint8Array | null>
  /** Persist the current database image. */
  save(data: Uint8Array): Promise<void>
}

export interface SqlJsDriverOptions {
  /** The sql.js WASM binary (avoids a network/locateFile lookup). */
  wasmBinary?: ArrayBuffer
  /** Resolves the WASM file path when `wasmBinary` is not supplied. */
  locateFile?: (file: string) => string
  /** Optional persistence (defaults to in-memory). */
  persistence?: SqlJsPersistence
}

function newId(): string {
  const c = globalThis as { crypto?: { randomUUID?: () => string } }
  if (typeof c.crypto?.randomUUID === 'function') return c.crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export class SqlJsDriver implements StorageDriver {
  readonly kind = 'sqljs'

  private SQL: SqlJsStatic | null = null
  private db: Database | null = null

  constructor(private readonly options: SqlJsDriverOptions = {}) {}

  async connect(): Promise<void> {
    this.SQL = await initSqlJs({
      wasmBinary: this.options.wasmBinary,
      locateFile: this.options.locateFile,
    })
    const data = this.options.persistence !== undefined ? await this.options.persistence.load() : null
    this.db = data !== null ? new this.SQL.Database(data) : new this.SQL.Database()
  }

  async disconnect(): Promise<void> {
    if (this.db !== null && this.options.persistence !== undefined) {
      await this.options.persistence.save(this.db.export())
    }
    this.db?.close()
    this.db = null
    this.SQL = null
  }

  private require(): Database {
    if (this.db === null) throw new Error('SqlJsDriver is not connected; call connect() first')
    return this.db
  }

  private tableName(collection: string): string {
    return `"${collection.replaceAll('"', '""')}"`
  }

  private ensureTable(collection: string): void {
    this.require().run(
      `CREATE TABLE IF NOT EXISTS ${this.tableName(collection)} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`,
    )
  }

  async insert<T extends StoredRecord>(collection: string, record: T): Promise<T> {
    const id = record.id ?? newId()
    const stored = { ...record, id } as T
    this.ensureTable(collection)
    this.require().run(`INSERT INTO ${this.tableName(collection)} (id, data) VALUES (?, ?)`, [
      id,
      JSON.stringify(stored),
    ])
    return stored
  }

  async get<T extends StoredRecord>(collection: string, id: string): Promise<T | null> {
    this.ensureTable(collection)
    const result = this.require().exec(`SELECT data FROM ${this.tableName(collection)} WHERE id = ?`, [id])
    if (result.length === 0 || result[0]!.values.length === 0) return null
    return JSON.parse(result[0]!.values[0]![0] as string) as T
  }

  async list<T extends StoredRecord>(collection: string, query?: Query): Promise<T[]> {
    this.ensureTable(collection)
    const result = this.require().exec(`SELECT data FROM ${this.tableName(collection)}`)
    if (result.length === 0) return []
    const records = result[0]!.values.map((row) => JSON.parse(row[0] as string) as T)
    return applyQuery(records, query)
  }

  async update<T extends StoredRecord>(collection: string, id: string, patch: Partial<T>): Promise<T | null> {
    const existing = await this.get<T>(collection, id)
    if (existing === null) return null
    const merged = { ...existing, ...patch, id } as T
    this.require().run(`UPDATE ${this.tableName(collection)} SET data = ? WHERE id = ?`, [JSON.stringify(merged), id])
    return merged
  }

  async remove(collection: string, id: string): Promise<boolean> {
    this.ensureTable(collection)
    this.require().run(`DELETE FROM ${this.tableName(collection)} WHERE id = ?`, [id])
    return this.require().getRowsModified() > 0
  }

  async clear(collection: string): Promise<void> {
    this.ensureTable(collection)
    this.require().run(`DELETE FROM ${this.tableName(collection)}`)
  }
}
