import { describe, expect, it } from 'vitest'
import { createRoot, type Context, type Plugin } from '../src/index.js'

// Pragmatic service-name casts keep the behavioural tests independent of the
// declaration-merging setup; the public API's type-safety is covered by tsc.
type S = any
type Ev = any

describe('Context services', () => {
  it('provides, gets and checks services', () => {
    const ctx = createRoot()
    const logger = { log: () => {} }
    ctx.provide('logger' as S, logger)
    expect(ctx.has('logger' as S)).toBe(true)
    expect(ctx.get('logger' as S)).toBe(logger)
  })

  it('resolves services through the parent chain', () => {
    const root = createRoot()
    root.provide('counter' as S, { count: 1 })
    const child = root.isolate('child')
    expect(child.get('counter' as S)).toEqual({ count: 1 })
  })

  it('throws when a service is missing', () => {
    const ctx = createRoot()
    expect(() => ctx.get('nope' as S)).toThrow(/service "nope"/)
  })

  it('throws on duplicate provide in the same scope', () => {
    const ctx = createRoot()
    ctx.provide('logger' as S, {})
    expect(() => ctx.provide('logger' as S, {})).toThrow(/already provided/)
  })

  it('removes a service on disposer', async () => {
    const ctx = createRoot()
    const remove = ctx.provide('counter' as S, { count: 1 })
    expect(ctx.has('counter' as S)).toBe(true)
    await remove()
    expect(ctx.has('counter' as S)).toBe(false)
  })

  it('provide disposer is idempotent', async () => {
    const ctx = createRoot()
    const remove = ctx.provide('counter' as S, { count: 1 })
    await remove()
    await remove()
    expect(ctx.has('counter' as S)).toBe(false)
  })

  it('allows shadowing a parent service in a child scope', () => {
    const root = createRoot()
    root.provide('counter' as S, { count: 1 })
    const child = root.isolate()
    child.provide('counter' as S, { count: 2 })
    expect(root.get('counter' as S).count).toBe(1)
    expect(child.get('counter' as S).count).toBe(2)
  })

  it('has() returns false for missing services', () => {
    expect(createRoot().has('nope' as S)).toBe(false)
  })

  it('resolves services through multiple ancestor levels', () => {
    const root = createRoot()
    root.provide('counter' as S, { count: 7 })
    const level1 = root.isolate()
    const level2 = level1.isolate()
    expect(level2.get('counter' as S).count).toBe(7)
  })
})

describe('Context effects', () => {
  it('registers reversible effects with LIFO cleanup', async () => {
    const ctx = createRoot()
    const order: string[] = []
    ctx.effect(() => {
      order.push('start-a')
      return () => order.push('stop-a')
    })
    ctx.effect(() => {
      order.push('start-b')
      return () => order.push('stop-b')
    })
    await ctx.dispose()
    expect(order).toEqual(['start-a', 'start-b', 'stop-b', 'stop-a'])
  })

  it('runs a disposer exactly once even when triggered both ways', async () => {
    const ctx = createRoot()
    let stops = 0
    const off = ctx.effect(() => () => stops++)
    await off()
    await ctx.dispose()
    expect(stops).toBe(1)
  })

  it('rejects effects registered after disposal', async () => {
    const ctx = createRoot()
    await ctx.dispose()
    expect(() => ctx.effect(() => {})).toThrow(/disposed/)
  })
})

describe('Context plugins', () => {
  it('mounts a function plugin and runs its disposer on unmount', async () => {
    const ctx = createRoot()
    const order: string[] = []
    const plugin: Plugin = () => {
      order.push('mount')
      return () => order.push('unmount')
    }
    const off = ctx.plugin(plugin)
    expect(order).toEqual(['mount'])
    await off()
    expect(order).toEqual(['mount', 'unmount'])
  })

  it('runs the returned disposer before effects (LIFO)', async () => {
    const ctx = createRoot()
    const order: string[] = []
    const plugin: Plugin = (c: Context) => {
      c.effect(() => {
        order.push('effect-start')
        return () => order.push('effect-stop')
      })
      return () => order.push('plugin-stop')
    }
    const off = ctx.plugin(plugin)
    await off()
    // Returned disposer was pushed after the effect, so it runs first on LIFO.
    expect(order).toEqual(['effect-start', 'plugin-stop', 'effect-stop'])
  })

  it('is idempotent to unmount twice', async () => {
    const ctx = createRoot()
    let unmounts = 0
    const off = ctx.plugin(() => () => {
      unmounts++
    })
    await off()
    await off()
    expect(unmounts).toBe(1)
  })

  it('rolls back plugin effects when apply throws', () => {
    const ctx = createRoot()
    const order: string[] = []
    const bad: Plugin = (c: Context) => {
      c.effect(() => {
        order.push('start')
        return () => order.push('stop')
      })
      throw new Error('boom')
    }
    expect(() => ctx.plugin(bad)).toThrow('boom')
    expect(order).toEqual(['start', 'stop'])
  })
})

describe('Context reactive injection', () => {
  it('keeps a plugin pending until its dependencies are provided', () => {
    const ctx = createRoot()
    const order: string[] = []
    const plugin: Plugin = {
      inject: ['storage' as S],
      apply(c: Context) {
        order.push('mounted:' + c.get('storage' as S).kind)
        return () => order.push('unmounted')
      },
    }
    ctx.plugin(plugin)
    expect(order).toEqual([])
    ctx.provide('storage' as S, { kind: 'sqlite' })
    expect(order).toEqual(['mounted:sqlite'])
  })

  it('unmounts a plugin when a required dependency is removed', async () => {
    const ctx = createRoot()
    const order: string[] = []
    const plugin: Plugin = {
      inject: ['storage' as S],
      apply() {
        order.push('mount')
        return () => order.push('unmount')
      },
    }
    ctx.plugin(plugin)
    const removeStorage = ctx.provide('storage' as S, { kind: 'sqlite' })
    expect(order).toEqual(['mount'])
    await removeStorage()
    expect(order).toEqual(['mount', 'unmount'])
  })

  it('supports multiple dependencies resolved in any order', () => {
    const ctx = createRoot()
    const order: string[] = []
    const plugin: Plugin = {
      inject: ['a' as S, 'b' as S],
      apply() {
        order.push('ready')
      },
    }
    ctx.plugin(plugin)
    ctx.provide('b' as S, {})
    expect(order).toEqual([])
    ctx.provide('a' as S, {})
    expect(order).toEqual(['ready'])
  })

  it('cancels a pending plugin before its dependency arrives', async () => {
    const ctx = createRoot()
    const order: string[] = []
    const off = ctx.plugin({
      inject: ['storage' as S],
      apply() {
        order.push('mount')
      },
    })
    await off()
    ctx.provide('storage' as S, { kind: 'x' })
    expect(order).toEqual([])
  })
})

describe('Context isolation and disposal', () => {
  it('disposes a child scope independently', async () => {
    const root = createRoot()
    const child = root.isolate('child')
    child.effect(() => () => {})
    await child.dispose()
    expect(() => root.isolate('another')).not.toThrow()
  })

  it('disposes descendants before the root itself', async () => {
    const root = createRoot()
    const order: string[] = []
    root.effect(() => () => order.push('root'))
    root.isolate().effect(() => () => order.push('child'))
    await root.dispose()
    expect(order).toEqual(['child', 'root'])
  })

  it('scopes event listeners to the registering scope', async () => {
    const root = createRoot()
    const child = root.isolate('child')
    let calls = 0
    child.on('something' as Ev, () => calls++)
    root.emit('something' as Ev)
    expect(calls).toBe(1)
    await child.dispose()
    root.emit('something' as Ev)
    expect(calls).toBe(1)
  })

  it('throws when isolating from a disposed scope', async () => {
    const ctx = createRoot()
    await ctx.dispose()
    expect(() => ctx.isolate()).toThrow(/disposed/)
  })

  it('dispose is idempotent', async () => {
    const ctx = createRoot()
    ctx.effect(() => () => {})
    await ctx.dispose()
    await ctx.dispose()
  })
})
