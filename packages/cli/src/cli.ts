import type { HfFetch } from '@exharness/benchmarks'
import type { LlmProvider } from '@exharness/llm'
import { parseArgs, type CliArgs } from './args.js'

export type { CliArgs } from './args.js'

/** A command handler: parse the resolved args and return a process exit code. */
export type CommandHandler = (args: CliArgs, deps: CliDeps) => Promise<number>

export interface CliDeps {
  out: (text: string) => void
  err: (text: string) => void
  env: Record<string, string | undefined>
  /** LLM factory (injectable for tests; production reads the environment). */
  createLlm: (env: Record<string, string | undefined>) => LlmProvider
  /** File reader for file-backed benchmarks (injectable for tests). */
  readFile?: (path: string) => Promise<string>
  /** Injectable fetch for HuggingFace dataset loading (defaults to globalThis.fetch). */
  fetch?: HfFetch
  /** Command handlers (injectable for tests). */
  commands?: Partial<Record<string, CommandHandler>>
  version?: string
}

export const HELP_TEXT = `eXharness — TypeScript-native Agent Harness lifecycle & self-evolution framework

Usage:
  exharness <command> [options]

Commands:
  bench       Run a benchmark (arithmetic, mmlu, gsm8k, ifeval, humaneval)
  experiment  Run a BOHB-vs-random self-evolution experiment
  report      Run the full competitive benchmark report (MMLU/IFEval/GSM8K/HumanEval + self-evolution)
  version     Print the version
  help        Show this help

Options:
  --json      Emit machine-readable JSON
  --help, -h  Show this help
`

/** Normalise a thrown value to a human-readable message. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Parse argv, dispatch to the named command, and map thrown errors to a
 * non-zero exit code with a message on stderr. Returns 0 on success.
 */
export async function runCli(argv: readonly string[], deps: CliDeps): Promise<number> {
  let args: CliArgs
  try {
    args = parseArgs(argv)
  } catch (error) {
    deps.err(errorMessage(error))
    return 1
  }

  if (args.flags.has('help') || args.command === 'help') {
    deps.out(HELP_TEXT)
    return 0
  }

  if (args.command === 'version') {
    deps.out(deps.version ?? 'unknown')
    return 0
  }

  const handler = deps.commands?.[args.command]
  if (handler === undefined) {
    deps.err(`unknown command "${args.command}" (run "exharness help" for usage)`)
    return 1
  }

  try {
    return await handler(args, deps)
  } catch (error) {
    deps.err(errorMessage(error))
    return 1
  }
}
