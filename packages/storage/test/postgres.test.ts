import { describe, expect, it } from 'vitest'
import { PostgresDriver } from '../src/postgres.js'
import type { StorageDriver } from '../src/types.js'

const PG_URL = process.env.EXHARNESS_TEST_PG_URL ?? 'postgres://exharness:exharness@127.0.0.1:5432/exharness_test'

async function runContract(make: () => StorageDriver): Promise<void> {
  const driver = make()
  await driver.connect()
  try {
    const a = await driver.insert('items', { id: 'a', name: 'alpha', n: 1 })
    expect(a.id).toBe('a')
    const b = await driver.insert('items', { name: 'beta', n: 2 })
    expect(b.id).toBeTruthy()

    expect(await driver.get('items', 'a')).toEqual({ id: 'a', name: 'alpha', n: 1 })

    const filtered = await driver.list('items', { where: { n: 2 } })
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.name).toBe('beta')

    const sorted = await driver.list('items', { orderBy: 'n', orderDir: 'desc' })
    expect(sorted.map((r) => r.n)).toEqual([2, 1])

    const updated = await driver.update('items', 'a', { name: 'alpha2' })
    expect(updated?.name).toBe('alpha2')
    expect((await driver.get('items', 'a'))?.name).toBe('alpha2')

    expect(await driver.remove('items', 'a')).toBe(true)
    expect(await driver.get('items', 'a')).toBeNull()

    await driver.clear('items')
    expect(await driver.list('items')).toHaveLength(0)
  } finally {
    await driver.disconnect()
  }
}

describe('PostgresDriver (real PostgreSQL)', () => {
  it('exposes kind postgres', () => {
    expect(new PostgresDriver({ connectionString: PG_URL }).kind).toBe('postgres')
  })

  it('throws when used before connect', async () => {
    const driver = new PostgresDriver({ connectionString: PG_URL })
    await expect(driver.insert('items', { id: 'x' })).rejects.toThrow(/not connected/)
  })

  it('satisfies the full storage contract against a real server', async () => {
    await runContract(() => new PostgresDriver({ connectionString: PG_URL }))
  })
})
