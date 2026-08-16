import { describe, expect, it } from 'vitest'
import { createStorage } from '../src/index.js'
import { MemoryDriver } from '../src/memory.js'
import { SqliteDriver } from '../src/sqlite.js'
import type { StorageDriver } from '../src/types.js'

// Run the same behavioural contract against every driver, so a driver is only
// accepted once it satisfies the full CRUD + query surface identically.
async function runContract(make: () => StorageDriver): Promise<void> {
  const driver = make()
  await driver.connect()
  try {
    const a = await driver.insert('items', { id: 'a', name: 'alpha', n: 1 })
    expect(a.id).toBe('a')
    const b = await driver.insert('items', { name: 'beta', n: 2 })
    expect(b.id).toBeTruthy()

    expect(await driver.get('items', 'a')).toEqual({ id: 'a', name: 'alpha', n: 1 })

    const all = await driver.list('items')
    expect(all).toHaveLength(2)

    const filtered = await driver.list('items', { where: { n: 2 } })
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.name).toBe('beta')

    const sorted = await driver.list('items', { orderBy: 'n', orderDir: 'desc' })
    expect(sorted.map((r) => r.n)).toEqual([2, 1])

    const limited = await driver.list('items', { limit: 1, offset: 1 })
    expect(limited).toHaveLength(1)

    const updated = await driver.update('items', 'a', { name: 'alpha2' })
    expect(updated?.name).toBe('alpha2')
    expect((await driver.get('items', 'a'))?.name).toBe('alpha2')

    expect(await driver.update('items', 'missing', { name: 'x' })).toBeNull()

    expect(await driver.remove('items', 'a')).toBe(true)
    expect(await driver.remove('items', 'a')).toBe(false)
    expect(await driver.get('items', 'a')).toBeNull()

    await driver.clear('items')
    expect(await driver.list('items')).toHaveLength(0)
  } finally {
    await driver.disconnect()
  }
}

describe('MemoryDriver', () => {
  it('exposes kind memory', () => {
    expect(new MemoryDriver().kind).toBe('memory')
  })

  it('satisfies the full storage contract', async () => {
    await runContract(() => new MemoryDriver())
  })

  it('generates ids when none supplied', async () => {
    const driver = new MemoryDriver()
    await driver.connect()
    const record = await driver.insert('x', { value: 1 } as any)
    expect(record.id).toBeTruthy()
    await driver.disconnect()
  })

  it('sorts records with null orderBy values deterministically', async () => {
    const driver = new MemoryDriver()
    await driver.connect()
    await driver.insert('items', { id: 'a', n: 2 })
    await driver.insert('items', { id: 'b', n: null })
    await driver.insert('items', { id: 'c', n: 1 })
    const sorted = await driver.list('items', { orderBy: 'n' })
    expect(sorted.map((r) => r.n)).toEqual([1, 2, null])
    await driver.disconnect()
  })

  it('falls back to timestamp ids when crypto.randomUUID is unavailable', async () => {
    const g = globalThis as any
    const original = g.crypto?.randomUUID
    if (g.crypto) g.crypto.randomUUID = undefined
    try {
      const driver = new MemoryDriver()
      await driver.connect()
      const record = await driver.insert('x', { value: 1 } as any)
      expect(record.id).toMatch(/^id-/)
      await driver.disconnect()
    } finally {
      if (g.crypto && original) g.crypto.randomUUID = original
    }
  })
})

describe('createStorage', () => {
  it('returns a memory driver by default', () => {
    expect(createStorage().kind).toBe('memory')
    expect(createStorage({ kind: 'memory' }).kind).toBe('memory')
  })

  it('throws on an unsupported kind', () => {
    expect(() => createStorage({ kind: 'postgres' as any })).toThrow(/unsupported/)
  })
})

describe('SqliteDriver', () => {
  it('exposes kind sqlite', () => {
    expect(new SqliteDriver(':memory:').kind).toBe('sqlite')
  })

  it('satisfies the full storage contract (in-memory sqlite)', async () => {
    await runContract(() => new SqliteDriver(':memory:'))
  })

  it('persists across reconnect for a file-backed database', async () => {
    const file = `/tmp/exharness-test-${Date.now()}.db`
    const first = new SqliteDriver(file)
    await first.connect()
    await first.insert('items', { id: 'persist', value: 42 })
    await first.disconnect()

    const second = new SqliteDriver(file)
    await second.connect()
    const row = await second.get('items', 'persist')
    await second.disconnect()
    expect(row).toEqual({ id: 'persist', value: 42 })
  })

  it('throws when used before connect', async () => {
    const driver = new SqliteDriver(':memory:')
    await expect(driver.insert('items', { id: 'x' })).rejects.toThrow(/not connected/)
  })
})
