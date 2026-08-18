import { createLlmFromEnv, type LlmProvider } from '@exharness/llm'
import { defaultCommands } from './commands/index.js'
import { runCli } from './cli.js'

export interface MainIo {
  out: (text: string) => void
  err: (text: string) => void
}

/**
 * The production wiring for the CLI: bind the real environment, LLM factory,
 * file reader and command table to the generic `runCli` dispatcher. The LLM
 * factory is injectable for tests and defaults to the environment-based
 * DeepSeek factory.
 */
export function runMain(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  io: MainIo,
  createLlm: (env: Record<string, string | undefined>) => LlmProvider = createLlmFromEnv,
): Promise<number> {
  return runCli(argv, {
    out: io.out,
    err: io.err,
    env,
    createLlm,
    readFile: async (path) => {
      const { readFile } = await import('node:fs/promises')
      return readFile(path, 'utf8')
    },
    commands: defaultCommands,
    version: '0.1.0',
  })
}
