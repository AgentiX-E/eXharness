import type { CommandHandler } from '../cli.js'
import { benchCommand } from './bench.js'
import { experimentCommand } from './experiment.js'
import { reportCommand } from './report.js'

export { benchCommand } from './bench.js'
export { experimentCommand } from './experiment.js'
export { reportCommand } from './report.js'
export { runSelfEvolutionComparison } from './self-evolution.js'

/** The built-in command table used by the production CLI entrypoint. */
export const defaultCommands: Record<string, CommandHandler> = {
  bench: benchCommand,
  experiment: experimentCommand,
  report: reportCommand,
}
