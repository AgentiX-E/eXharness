import { applyQuery, type Query, type StorageDriver, type StoredRecord } from './types.js'

function newId(): string {
  const c = globalThis as { crypto?: { randomUUID?: () => string } }
  if (typeof c.crypto?.randomUUID === 'function') return c.crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * An in-process driver backed by `Map`s. It has zero dependencies, works in
 * both Node and the browser, and is the reference implementation for tests.
 */
export class MemoryDriver implements StorageDriver {
  readonly kind = 'memory'

  private collections = new Map<string, Map<string, StoredRecord>>()

  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {
    this.collections.clear()
  }

  private table(name: string): Map<string, StoredRecord> {
    let table = this.collections.get(name)
    if (table === undefined) {
      table = new Map()
      this.collections.set(name, table)
    }
    return table
  }

  async insert<T extends StoredRecord>(collection: string, record: T): Promise<T> {
    const id = record.id ?? newId()
    const stored = { ...record, id } as T
    this.table(collection).set(id, stored)
    return stored
  }

  async get<T extends StoredRecord>(collection: string, id: string): Promise<T | null> {
    return (this.table(collection).get(id) as T | undefined) ?? null
  }

  async list<T extends StoredRecord>(collection: string, query?: Query): Promise<T[]> {
    return applyQuery([...this.table(collection).values()] as T[], query)
  }

  async update<T extends StoredRecord>(collection: string, id: string, patch: Partial<T>): Promise<T | null> {
    const table = this.table(collection)
    const existing = table.get(id)
    if (existing === undefined) return null
    const merged = { ...existing, ...patch, id } as T
    table.set(id, merged)
    return merged
  }

  async remove(collection: string, id: string): Promise<boolean> {
    return this.table(collection).delete(id)
  }

  async clear(collection: string): Promise<void> {
    this.collections.delete(collection)
  }
}
