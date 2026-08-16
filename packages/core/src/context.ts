import { DisposableList, noopDisposable, type Disposable } from './disposable.js'
import { EventsService, type Events, type EventName, type EventArgs, type EventReturn } from './events.js'

/**
 * The typed service registry. Extend via TypeScript *declaration merging* to
 * declare the services your domain provides:
 *
 * ```ts
 * declare module '@exharness/core' {
 *   interface Services {
 *     storage: Storage
 *     llm: LlmProvider
 *   }
 * }
 * ```
 *
 * `ctx.get('storage')` / `ctx.provide('storage', …)` are then fully typed.
 */
export interface Services {}

export type ServiceName = keyof Services & string

/** A plugin is either a function or an object with an `apply` method. */
export type Plugin<C = unknown> = PluginFunction<C> | PluginObject<C>

export type PluginFunction<C = unknown> = (ctx: Context, config: C) => void | Disposable

export interface PluginObject<C = unknown> {
  /** Human-readable name, used for diagnostics and lifecycle events. */
  name?: string
  /** Service names this plugin requires before it may be mounted. */
  inject?: readonly ServiceName[]
  /** Mount the plugin; may return a disposer (runs first on teardown). */
  apply(ctx: Context, config: C): void | Disposable
}

/** Lifecycle state of a mounted (or pending) plugin. */
export type FiberState = 'pending' | 'loading' | 'active' | 'failed' | 'unloading' | 'disposed'

export interface Context {
  readonly root: Context
  readonly parent: Context | null
  readonly name: string

  /** Resolve a service from this scope or any ancestor. Throws if absent. */
  get<N extends ServiceName>(name: N): Services[N]
  /** Register a service in this scope. Returns a disposer that removes it. */
  provide<N extends ServiceName>(name: N, value: Services[N]): Disposable
  /** Whether a service is resolvable from this scope or an ancestor. */
  has<N extends ServiceName>(name: N): boolean

  /** Register a reversible effect in this scope. */
  effect(execute: () => Disposable | void, label?: string): Disposable

  on<K extends EventName>(name: K, fn: Events[K], options?: { prepend?: boolean }): Disposable
  emit<K extends EventName>(name: K, ...args: EventArgs<K>): void
  parallel<K extends EventName>(name: K, ...args: EventArgs<K>): Promise<void>
  serial<K extends EventName>(name: K, ...args: EventArgs<K>): Promise<Awaited<EventReturn<K>>>
  bail<K extends EventName>(name: K, ...args: EventArgs<K>): EventReturn<K>
  waterfall<K extends EventName>(name: K, ...args: EventArgs<K>): Promise<Awaited<EventReturn<K>>>

  /** Mount a plugin. If declared dependencies are missing it stays pending. */
  plugin<C = unknown>(plugin: Plugin<C>, config?: C): Disposable

  /** Create an isolated child scope. */
  isolate(name?: string): Context

  /** Dispose this scope and all descendants (LIFO, reversible). */
  dispose(): Promise<void>
}

interface PluginRecord {
  host: ContextImpl
  inject: ServiceName[]
  plugin: Plugin
  config: unknown
  disposer: Disposable | null
  state: FiberState
}

let pluginCounter = 0

function pluginName(plugin: Plugin): string {
  if (typeof plugin === 'function') return plugin.name || `plugin:${++pluginCounter}`
  return plugin.name || `plugin:${++pluginCounter}`
}

function runPlugin(plugin: Plugin, ctx: Context, config: unknown): Disposable | void {
  if (typeof plugin === 'function') return plugin(ctx, config)
  return plugin.apply(ctx, config)
}

function injectOf(plugin: Plugin): ServiceName[] {
  if (typeof plugin === 'function') return []
  return [...(plugin.inject ?? [])]
}

/** Creates the root context of an eXharness application. */
export function createRoot(name = 'root'): Context {
  return new ContextImpl(null, name)
}

export class ContextImpl implements Context {
  readonly root: ContextImpl
  readonly parent: ContextImpl | null
  readonly name: string

  private services = new Map<ServiceName, unknown>()
  private effects = new DisposableList()
  private children = new Set<ContextImpl>()
  private disposed = false

  // Root-level shared state.
  private events: EventsService
  private pending = new Map<ServiceName, Set<PluginRecord>>()
  private dependents = new Map<ServiceName, Set<PluginRecord>>()

  constructor(parent: ContextImpl | null, name: string) {
    this.parent = parent
    this.name = name
    if (parent !== null) {
      this.root = parent.root
      this.events = parent.events
      parent.children.add(this)
    } else {
      this.root = this
      this.events = new EventsService()
    }
  }

  get<N extends ServiceName>(name: N): Services[N] {
    let cursor: ContextImpl | null = this
    while (cursor !== null) {
      if (cursor.services.has(name)) return cursor.services.get(name) as Services[N]
      cursor = cursor.parent
    }
    throw new Error(`service "${name}" is not provided in scope "${this.name}"`)
  }

  has<N extends ServiceName>(name: N): boolean {
    let cursor: ContextImpl | null = this
    while (cursor !== null) {
      if (cursor.services.has(name)) return true
      cursor = cursor.parent
    }
    return false
  }

  provide<N extends ServiceName>(name: N, value: Services[N]): Disposable {
    if (this.services.has(name)) {
      throw new Error(`service "${name}" is already provided in scope "${this.name}"`)
    }
    this.services.set(name, value)

    // Mount any pending plugins whose dependencies are now satisfied.
    const waiting = this.root.pending.get(name)
    if (waiting !== undefined) {
      for (const record of [...waiting]) {
        if (record.disposer === null && record.inject.every((dep) => record.host.has(dep))) {
          this.mount(record)
          for (const dep of record.inject) {
            const set = this.root.pending.get(dep)
            set?.delete(record)
            if (set !== undefined && set.size === 0) this.root.pending.delete(dep)
          }
        }
      }
    }

    let disposed = false
    return async () => {
      if (disposed) return
      disposed = true
      if (this.services.get(name) !== value) return
      this.services.delete(name)
      // Unmount plugins that depend on this service.
      const deps = this.root.dependents.get(name)
      if (deps !== undefined) {
        for (const record of [...deps]) await this.unmount(record)
      }
    }
  }

  effect(execute: () => Disposable | void, label?: string): Disposable {
    if (this.disposed) throw new Error(`cannot register effect in disposed scope "${this.name}"`)
    const cleanup = execute() ?? noopDisposable

    // Ensure the cleanup runs at most once, regardless of whether it is
    // triggered through the returned disposer or through scope disposal.
    let ran = false
    const runOnce: Disposable = async () => {
      if (ran) return
      ran = true
      await cleanup()
    }

    const remove = this.effects.push(runOnce)
    return async () => {
      remove()
      await runOnce()
    }
  }

  on<K extends EventName>(name: K, fn: Events[K], options: { prepend?: boolean } = {}): Disposable {
    const remove = this.events.on(name, fn, options)
    return this.effect(() => remove, `event:${String(name)}`)
  }

  emit<K extends EventName>(name: K, ...args: EventArgs<K>): void {
    this.events.emit(name, ...args)
  }

  parallel<K extends EventName>(name: K, ...args: EventArgs<K>): Promise<void> {
    return this.events.parallel(name, ...args)
  }

  serial<K extends EventName>(name: K, ...args: EventArgs<K>): Promise<Awaited<EventReturn<K>>> {
    return this.events.serial(name, ...args)
  }

  bail<K extends EventName>(name: K, ...args: EventArgs<K>): EventReturn<K> {
    return this.events.bail(name, ...args)
  }

  waterfall<K extends EventName>(name: K, ...args: EventArgs<K>): Promise<Awaited<EventReturn<K>>> {
    return this.events.waterfall(name, ...args)
  }

  plugin<C = unknown>(plugin: Plugin<C>, config: C = {} as C): Disposable {
    const inject = injectOf(plugin)
    const record: PluginRecord = {
      host: this,
      inject,
      plugin,
      config,
      disposer: null,
      state: 'pending',
    }

    const missing = inject.filter((dep) => !this.has(dep))
    if (missing.length === 0) {
      this.mount(record)
    } else {
      for (const dep of missing) {
        let set = this.root.pending.get(dep)
        if (set === undefined) this.root.pending.set(dep, (set = new Set()))
        set.add(record)
      }
    }

    let disposed = false
    return async () => {
      if (disposed) return
      disposed = true
      if (record.disposer !== null) {
        await this.unmount(record)
      } else {
        for (const dep of record.inject) {
          const set = this.root.pending.get(dep)
          set?.delete(record)
          if (set !== undefined && set.size === 0) this.root.pending.delete(dep)
        }
        record.state = 'disposed'
      }
    }
  }

  private mount(record: PluginRecord): void {
    const scope = this.isolate(pluginName(record.plugin)) as ContextImpl
    record.state = 'loading'
    try {
      const result = runPlugin(record.plugin, scope, record.config)
      if (result !== undefined && result !== null) scope.effects.push(result)
      record.disposer = () => scope.dispose()
      record.state = 'active'
      for (const dep of record.inject) {
        let set = this.root.dependents.get(dep)
        if (set === undefined) this.root.dependents.set(dep, (set = new Set()))
        set.add(record)
      }
    } catch (error) {
      record.state = 'failed'
      void scope.dispose()
      throw error
    }
  }

  private async unmount(record: PluginRecord): Promise<void> {
    if (record.disposer === null) return
    record.state = 'unloading'
    const dispose = record.disposer
    record.disposer = null
    for (const dep of record.inject) {
      const set = this.root.dependents.get(dep)
      set?.delete(record)
      if (set !== undefined && set.size === 0) this.root.dependents.delete(dep)
    }
    await dispose()
    record.state = 'disposed'
  }

  isolate(name = `${this.name}:child`): Context {
    if (this.disposed) throw new Error(`cannot isolate from disposed scope "${this.name}"`)
    return new ContextImpl(this, name)
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    for (const child of [...this.children]) await child.dispose()
    this.children.clear()
    this.parent?.children.delete(this)
    await this.effects.dispose()
    this.services.clear()
  }
}
