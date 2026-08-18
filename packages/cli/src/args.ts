/**
 * A tiny, dependency-free command-line argument parser. It intentionally keeps
 * a narrow, unambiguous grammar:
 *
 *   - the first positional token is the command (`bench`, `experiment`, …)
 *   - remaining positional tokens are command arguments
 *   - `--key=value` sets a string option
 *   - `--flag` sets a boolean flag
 *   - `--help` / `-h` requests help
 *
 * Short options are rejected rather than silently mis-parsed, so malformed
 * invocations fail loudly instead of doing the wrong thing.
 */

export interface CliArgs {
  command: string
  options: ReadonlyMap<string, string>
  flags: ReadonlySet<string>
  positionals: readonly string[]
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const positionals: string[] = []
  const options = new Map<string, string>()
  const flags = new Set<string>()

  for (const arg of argv) {
    if (arg === '--') continue
    if (arg === '--help' || arg === '-h') {
      flags.add('help')
      continue
    }
    if (arg.startsWith('--')) {
      const body = arg.slice(2)
      const eq = body.indexOf('=')
      if (eq !== -1) {
        const key = body.slice(0, eq)
        const value = body.slice(eq + 1)
        if (key.length === 0) throw new Error(`invalid option "${arg}"`)
        options.set(key, value)
      } else if (body.length > 0) {
        flags.add(body)
      }
    } else if (arg.startsWith('-') && arg !== '-') {
      throw new Error(`unsupported short option "${arg}" (use --help for usage)`)
    } else {
      positionals.push(arg)
    }
  }

  const command = positionals[0] ?? 'help'
  return { command, options, flags, positionals: positionals.slice(1) }
}
