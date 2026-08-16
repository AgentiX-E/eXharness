/**
 * A JSON-serializable record stored in a collection. The `id` field is the
 * primary key; callers may supply it or let the driver generate one.
 */
export interface StoredRecord {
  id: string
  [key: string]: unknown
}

/** A simple, driver-agnostic query. Equality filters are matched by value. */
export interface Query {
  where?: Record<string, unknown>
  orderBy?: string
  orderDir?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

/**
 * The pluggable storage contract. Every driver is **embedded** (no external
 * service/process required) or an explicit remote database the user opts into.
 *
 * All methods are async so that synchronous backends (SQLite) and network
 * backends (PostgreSQL) share one uniform surface.
 */
export interface StorageDriver {
  readonly kind: string
  connect(): Promise<void>
  disconnect(): Promise<void>

  insert<T extends StoredRecord>(collection: string, record: T): Promise<T>
  get<T extends StoredRecord>(collection: string, id: string): Promise<T | null>
  list<T extends StoredRecord>(collection: string, query?: Query): Promise<T[]>
  update<T extends StoredRecord>(collection: string, id: string, patch: Partial<T>): Promise<T | null>
  remove(collection: string, id: string): Promise<boolean>
  clear(collection: string): Promise<void>
}

function matches(record: StoredRecord, where: Record<string, unknown>): boolean {
  for (const [key, expected] of Object.entries(where)) {
    if (record[key] !== expected) return false
  }
  return true
}

function compareValues(av: unknown, bv: unknown): number {
  if (av === bv) return 0
  if (av === undefined) return 1
  if (bv === undefined) return -1
  if (av === null) return 1
  if (bv === null) return -1
  if (typeof av === 'number' && typeof bv === 'number') return av < bv ? -1 : av > bv ? 1 : 0
  const as = String(av)
  const bs = String(bv)
  return as < bs ? -1 : as > bs ? 1 : 0
}

function applyQuery<T extends StoredRecord>(records: T[], query?: Query): T[] {
  if (query === undefined) return records
  let result = query.where !== undefined ? records.filter((r) => matches(r, query.where!)) : records
  if (query.orderBy !== undefined) {
    const key = query.orderBy
    const dir = query.orderDir === 'desc' ? -1 : 1
    result = [...result].sort((a, b) => compareValues(a[key], b[key]) * dir)
  }
  const offset = query.offset ?? 0
  const limit = query.limit
  return result.slice(offset, limit === undefined ? undefined : offset + limit)
}

export { matches, applyQuery }
