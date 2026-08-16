import type { Disposable } from './disposable.js'

/**
 * The typed event registry. Extend this interface via TypeScript *declaration
 * merging* to declare the events your domain emits:
 *
 * ```ts
 * declare module '@exharness/core' {
 *   interface Events {
 *     'agent/request'(payload: RequestPayload): void
 *     'agent/status'(status: string): void
 *   }
 * }
 * ```
 *
 * Each property is the *listener* signature. Dispatch helpers derive their
 * argument and return types from it, giving compile-time safety.
 */
export interface Events {}

export type EventName = keyof Events & string

export type EventListener<K extends EventName> = Events[K]

export type EventArgs<K extends EventName> = EventListener<K> extends (...args: infer A) => any ? A : never

export type EventReturn<K extends EventName> = EventListener<K> extends (...args: any) => infer R ? R : never

/**
 * A listener can signal "stop propagation" in `serial`/`bail` mode by returning
 * a value other than `null`, `undefined` or `false`.
 */
const isBailed = (value: unknown): boolean => value !== null && value !== undefined && value !== false

interface ListenerEntry {
  fn: (...args: any[]) => any
  prepend: boolean
}

/**
 * A typed event bus with five dispatch modes, mirroring Cordis semantics:
 *
 * - `emit`      — synchronous fire-and-forget (observers).
 * - `parallel`  — asynchronous, all listeners run concurrently; failures are
 *                 aggregated into an `AggregateError`.
 * - `serial`    — asynchronous, run in order; a truthy return short-circuits.
 * - `bail`      — synchronous version of `serial`.
 * - `waterfall` — middleware chain; each listener may invoke `next(...)` to
 *                 continue downstream and wrap the result (used for request
 *                 rewriting / format enforcement).
 *
 * Listener registration is itself reversible: `on(...)` returns a `Disposable`.
 */
export class EventsService {
  private listeners = new Map<EventName, ListenerEntry[]>()

  /** Register a listener. Returns a disposer that removes exactly this listener. */
  on<K extends EventName>(name: K, fn: EventListener<K>, options: { prepend?: boolean } = {}): Disposable {
    const entry: ListenerEntry = { fn: fn as (...args: any[]) => any, prepend: options.prepend === true }
    const list = this.listeners.get(name)
    if (list === undefined) this.listeners.set(name, [entry])
    else if (entry.prepend) list.unshift(entry)
    else list.push(entry)

    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      const arr = this.listeners.get(name)
      if (arr === undefined) return
      const index = arr.indexOf(entry)
      if (index !== -1) arr.splice(index, 1)
      if (arr.length === 0) this.listeners.delete(name)
    }
  }

  private snapshot(name: EventName): ListenerEntry[] {
    const list = this.listeners.get(name)
    return list === undefined ? [] : [...list]
  }

  /** Fire all listeners synchronously; return values are ignored. */
  emit<K extends EventName>(name: K, ...args: EventArgs<K>): void {
    for (const { fn } of this.snapshot(name)) fn(...args)
  }

  /** Fire all listeners concurrently; throw `AggregateError` if any reject. */
  async parallel<K extends EventName>(name: K, ...args: EventArgs<K>): Promise<void> {
    const entries = this.snapshot(name)
    // Wrap each invocation in an async boundary so synchronous throws are
    // captured as rejections rather than escaping the `map` callback.
    const results = await Promise.allSettled(entries.map(({ fn }) => (async () => fn(...args))()))
    const errors = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason)
    if (errors.length > 0) throw new AggregateError(errors, `parallel event "${String(name)}" failed`)
  }

  /** Run listeners sequentially; a truthy return short-circuits and is returned. */
  async serial<K extends EventName>(name: K, ...args: EventArgs<K>): Promise<Awaited<EventReturn<K>>> {
    for (const { fn } of this.snapshot(name)) {
      const result = await fn(...args)
      if (isBailed(result)) return result
    }
    return undefined as Awaited<EventReturn<K>>
  }

  /** Synchronous version of `serial`. */
  bail<K extends EventName>(name: K, ...args: EventArgs<K>): EventReturn<K> {
    for (const { fn } of this.snapshot(name)) {
      const result = fn(...args)
      if (isBailed(result)) return result
    }
    return undefined as EventReturn<K>
  }

  /**
   * Middleware chain. Each listener is invoked with its declared arguments plus
   * a trailing `next` continuation; calling `next(...)` yields the downstream
   * (composed) result, which the listener may wrap or short-circuit.
   */
  waterfall<K extends EventName>(name: K, ...args: EventArgs<K>): Promise<Awaited<EventReturn<K>>> {
    const entries = this.snapshot(name)
    let index = 0
    const next = (...nextArgs: any[]): any => {
      const entry = entries[index++]
      if (entry === undefined) return undefined
      return entry.fn(...nextArgs, next)
    }
    return Promise.resolve(next(...args))
  }
}
