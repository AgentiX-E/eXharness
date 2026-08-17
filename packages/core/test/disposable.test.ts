import { describe, expect, it } from 'vitest'
import { DisposableList } from '../src/disposable.js'

describe('DisposableList', () => {
  it('disposes in LIFO (reverse insertion) order', async () => {
    const list = new DisposableList()
    const order: string[] = []
    list.push(() => order.push('a'))
    list.push(() => order.push('b'))
    list.push(() => order.push('c'))
    await list.dispose()
    expect(order).toEqual(['c', 'b', 'a'])
  })

  it('supports idempotent double disposal', async () => {
    const list = new DisposableList()
    let calls = 0
    list.push(() => {
      calls++
    })
    await list.dispose()
    await list.dispose()
    expect(calls).toBe(1)
  })

  it('supports idempotent removal of a specific disposer', async () => {
    const list = new DisposableList()
    const order: string[] = []
    const removeB = list.push(
      () => order.push('a'),
      () => order.push('b'),
    )
    expect(list.remove(() => order.push('b'))).toBe(false)
    expect(removeB).toBeTypeOf('function')
    removeB()
    await list.dispose()
    expect(order).toEqual([])
  })

  it('deduplicates identical disposers across push calls', async () => {
    const list = new DisposableList()
    let calls = 0
    const shared = () => {
      calls++
    }
    list.push(shared)
    list.push(shared)
    expect(list.size).toBe(1)
    await list.dispose()
    expect(calls).toBe(1)
  })

  it('supports async disposers sequentially', async () => {
    const list = new DisposableList()
    const order: string[] = []
    list.push(async () => {
      await new Promise((r) => setTimeout(r, 5))
      order.push('slow')
    })
    list.push(() => order.push('fast'))
    await list.dispose()
    expect(order).toEqual(['fast', 'slow'])
  })

  it('clear detaches and returns LIFO without executing', () => {
    const list = new DisposableList()
    let calls = 0
    list.push(() => calls++)
    const detached = list.clear()
    expect(detached).toHaveLength(1)
    expect(calls).toBe(0)
    expect(list.size).toBe(0)
  })
})
