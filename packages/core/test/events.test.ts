import { describe, expect, it } from 'vitest'
import { EventsService } from '../src/events.js'

declare module '../src/events.js' {
  interface Events {
    ping(n: number): string
    notify(msg: string): void
  }
}

describe('EventsService', () => {
  it('emit fires all listeners synchronously', () => {
    const events = new EventsService()
    const seen: number[] = []
    events.on('ping', (n) => {
      seen.push(n)
      return 'ignored'
    })
    events.emit('ping', 1)
    events.emit('ping', 2)
    expect(seen).toEqual([1, 2])
  })

  it('on() returns a disposer that removes the listener', () => {
    const events = new EventsService()
    let calls = 0
    const off = events.on('ping', () => {
      calls++
    })
    events.emit('ping', 0)
    off()
    events.emit('ping', 0)
    expect(calls).toBe(1)
  })

  it('serial bails on the first truthy return', async () => {
    const events = new EventsService()
    const order: number[] = []
    events.on('ping', (n) => {
      order.push(1)
      return undefined
    })
    events.on('ping', (n) => {
      order.push(2)
      return `bail:${n}`
    })
    events.on('ping', (n) => {
      order.push(3)
      return 'never'
    })
    const result = await events.serial('ping', 42)
    expect(result).toBe('bail:42')
    expect(order).toEqual([1, 2])
  })

  it('bail is the synchronous variant of serial', () => {
    const events = new EventsService()
    events.on('ping', (n) => `sync:${n}`)
    expect(events.bail('ping', 7)).toBe('sync:7')
  })

  it('serial treats null/undefined/false as non-bail', async () => {
    const events = new EventsService()
    const order: number[] = []
    events.on('ping', () => {
      order.push(1)
      return null
    })
    events.on('ping', () => {
      order.push(2)
      return false
    })
    events.on('ping', () => {
      order.push(3)
      return undefined
    })
    const result = await events.serial('ping', 0)
    expect(result).toBeUndefined()
    expect(order).toEqual([1, 2, 3])
  })

  it('parallel runs all and aggregates errors', async () => {
    const events = new EventsService()
    events.on('notify', () => {})
    events.on('notify', () => {
      throw new Error('boom')
    })
    await expect(events.parallel('notify', 'x')).rejects.toBeInstanceOf(AggregateError)
  })

  it('parallel resolves when all listeners succeed', async () => {
    const events = new EventsService()
    let calls = 0
    events.on('notify', () => {
      calls++
    })
    events.on('notify', () => {
      calls++
    })
    await events.parallel('notify', 'ok')
    expect(calls).toBe(2)
  })

  it('waterfall composes middleware in registration order', async () => {
    const events = new EventsService()
    events.on('ping', (n: number, next) => {
      const downstream = next(n + 1)
      return `a(${downstream})`
    })
    events.on('ping', (n: number, next) => {
      const downstream = next(n * 10)
      return `b(${downstream})`
    })
    const result = await events.waterfall('ping', 1)
    // First listener: next(2) -> second listener: next(20) -> undefined => "b(undefined)"
    expect(result).toBe('a(b(undefined))')
  })

  it('waterfall can short-circuit by not calling next', async () => {
    const events = new EventsService()
    events.on('ping', () => 'short')
    events.on('ping', () => 'never')
    const result = await events.waterfall('ping', 1)
    expect(result).toBe('short')
  })

  it('prepend reverses listener order', () => {
    const events = new EventsService()
    const order: number[] = []
    events.on('ping', () => order.push(1))
    events.on('ping', () => order.push(2), { prepend: true })
    events.emit('ping', 0)
    expect(order).toEqual([2, 1])
  })

  it('handles events with no listeners gracefully across all modes', async () => {
    const events = new EventsService()
    events.emit('ping', 1)
    expect(await events.serial('ping', 1)).toBeUndefined()
    expect(await events.parallel('ping', 1)).toBeUndefined()
    expect(events.bail('ping', 1)).toBeUndefined()
    expect(await events.waterfall('ping', 1)).toBeUndefined()
  })
})
