/**
 * A function that undoes a side effect. May be synchronous or asynchronous.
 *
 * This is the smallest unit of "reversibility" in eXharness: every action a
 * plugin performs (registering a service, adding an event listener, opening a
 * connection) returns a `Disposable` that fully reverses it.
 */
export type Disposable = () => void | Promise<void>

/**
 * An ordered collection of disposers with **LIFO (last-in, first-out) cleanup**
 * semantics and **idempotent removal**.
 *
 * LIFO ordering guarantees that dependent resources are torn down before the
 * resources they depend on (mirroring how they were built up). Idempotency
 * guarantees that disposing twice — or removing an already-removed disposer —
 * is a safe no-op, which is essential for error paths and hot reload.
 */
export class DisposableList {
  private list: Disposable[] = []
  private active = new Set<Disposable>()

  /** Number of currently-registered disposers. */
  get size(): number {
    return this.list.length
  }

  /**
   * Register one or more disposers. Returns a disposer that removes exactly the
   * subset that was added by this call (already-registered duplicates are
   * skipped so a shared disposer is never double-unregistered).
   */
  push(...disposers: Disposable[]): Disposable {
    const added = disposers.filter((fn) => !this.active.has(fn))
    for (const fn of added) {
      this.active.add(fn)
      this.list.push(fn)
    }
    return () => {
      for (const fn of added) this.remove(fn)
    }
  }

  /** Remove a specific disposer. Idempotent — returns `false` if not present. */
  remove(fn: Disposable): boolean {
    if (!this.active.has(fn)) return false
    this.active.delete(fn)
    const index = this.list.indexOf(fn)
    if (index !== -1) this.list.splice(index, 1)
    return true
  }

  /** Detach and return all disposers in LIFO order. The list is left empty. */
  clear(): Disposable[] {
    const result = this.list.splice(0).reverse()
    this.active.clear()
    return result
  }

  /**
   * Run all disposers in LIFO order. Each disposer is awaited sequentially so
   * that asynchronous teardown (closing a DB, flushing a buffer) completes in a
   * deterministic order before the next one starts.
   */
  async dispose(): Promise<void> {
    for (const fn of this.clear()) {
      await fn()
    }
  }
}

/** A no-op disposer, useful as a default / sentinel. */
export const noopDisposable: Disposable = () => {}
