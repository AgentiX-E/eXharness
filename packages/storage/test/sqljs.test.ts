import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SqlJsDriver, type SqlJsPersistence } from '../src/sqljs.js'

const wasmBuffer = fs.readFileSync(fileURLToPath(new URL('../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url)))
const wasmBinary = wasmBuffer.buffer.slice(
  wasmBuffer.byteOffset,
  wasmBuffer.byteOffset + wasmBuffer.byteLength,
) as ArrayBuffer

class MemoryPersistence implements SqlJsPersistence {
  private data: Uint8Array | null = null
  async load(): Promise<Uint8Array | null> {
    return this.data
  }
  async save(data: Uint8Array): Promise<void> {
    this.data = data
  }
}

describe('SqlJsDriver', () => {
  it('satisfies the storage contract', async () => {
    const driver = new SqlJsDriver({ wasmBinary })
    await driver.connect()
    expect(driver.kind).toBe('sqljs')

    const inserted = await driver.insert('items', { id: 'a', value: 1 } as never)
    expect(inserted.id).toBe('a')
    expect(await driver.get('items', 'a')).toEqual({ id: 'a', value: 1 })
    expect(await driver.get('items', 'missing')).toBeNull()

    await driver.insert('items', { id: 'b', value: 2 } as never)
    const listed = await driver.list('items', { orderBy: 'value', orderDir: 'desc' })
    expect(listed.map((r) => r.id)).toEqual(['b', 'a'])

    expect(await driver.update('items', 'a', { value: 10 } as never)).toEqual({ id: 'a', value: 10 })
    expect(await driver.update('items', 'missing', {} as never)).toBeNull()

    expect(await driver.remove('items', 'a')).toBe(true)
    expect(await driver.remove('items', 'a')).toBe(false)

    await driver.clear('items')
    expect(await driver.list('items')).toEqual([])
    await driver.disconnect()
  })

  it('generates ids when none are supplied', async () => {
    const driver = new SqlJsDriver({ wasmBinary })
    await driver.connect()
    const record = await driver.insert('x', { value: 1 } as never)
    expect(record.id).toBeTruthy()
    await driver.disconnect()
  })

  it('persists across reconnect via injected persistence', async () => {
    const persistence = new MemoryPersistence()
    const writer = new SqlJsDriver({ wasmBinary, persistence })
    await writer.connect()
    await writer.insert('c', { id: 'a', value: 1 } as never)
    await writer.disconnect()

    const reader = new SqlJsDriver({ wasmBinary, persistence })
    await reader.connect()
    expect(await reader.get('c', 'a')).toEqual({ id: 'a', value: 1 })
    await reader.disconnect()
  })

  it('throws when used before connect', async () => {
    const driver = new SqlJsDriver({ wasmBinary })
    await expect(driver.insert('c', { id: 'a' } as never)).rejects.toThrow(/not connected/)
    await expect(driver.get('c', 'a')).rejects.toThrow(/not connected/)
  })
})
