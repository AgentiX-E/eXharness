import type { Context, Plugin } from '@exharness/core'
import { QualityGateService } from './service.js'
import type { GateRunner } from './types.js'

declare module '@exharness/core' {
  interface Services {
    qualityGate: QualityGateService
  }
}

/**
 * A reversible core plugin that mounts a `QualityGateService` on the root
 * context so it is visible to the host scope. Removing the plugin unregisters
 * the service and all its checks.
 */
export function qualityGatePlugin(runners: readonly GateRunner[] = []): Plugin {
  return (ctx: Context) => {
    const service = new QualityGateService(runners)
    return ctx.root.provide('qualityGate', service)
  }
}
