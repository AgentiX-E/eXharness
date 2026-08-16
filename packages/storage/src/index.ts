export { type StoredRecord, type Query, type StorageDriver, applyQuery } from './types.js'
export { MemoryDriver } from './memory.js'

import { MemoryDriver } from './memory.js'
import type { StorageDriver } from './types.js'

export interface StorageOptions {
  kind?: 'memory'
}

/**
 * Create an embedded, dependency-free storage driver. The memory driver is the
 * only universal (Node + browser) option; SQLite and PostgreSQL drivers are
 * imported from `@exharness/storage/sqlite` and `@exharness/storage/postgres`
 * respectively (both are Node-only).
 */
export function createStorage(options: StorageOptions = {}): StorageDriver {
  const kind = options.kind ?? 'memory'
  if (kind === 'memory') return new MemoryDriver()
  throw new Error(`unsupported storage kind "${kind}"`)
}
