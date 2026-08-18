import { describe, expect, it } from 'vitest'
import { errorMessage, HELP_TEXT, runCli, type CliDeps, type CommandHandler } from '../src/cli.js'

describe('errorMessage', () => {
  it('returns the message of an Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
  })

  it('stringifies a non-Error thrown value', () => {
    expect(errorMessage('raw')).toBe('raw')
    expect(errorMessage(42)).toBe('42')
  })
})

function harness(overrides: Partial<CliDeps> = {}) {
  const out: string[] = []
  const err: string[] = []
  const deps: CliDeps = {
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    env: {},
    createLlm: () => ({ kind: 'mock', async generate() {} }) as never,
    version: '0.1.0',
    ...overrides,
  }
  return { deps, out, err }
}

describe('runCli', () => {
  it('prints help for the help command', async () => {
    const { deps, out } = harness()
    expect(await runCli(['help'], deps)).toBe(0)
    expect(out).toEqual([HELP_TEXT])
  })

  it('prints help for the --help flag', async () => {
    const { deps, out } = harness()
    expect(await runCli(['bench', '--help'], deps)).toBe(0)
    expect(out).toEqual([HELP_TEXT])
  })

  it('prints the version', async () => {
    const { deps, out } = harness()
    expect(await runCli(['version'], deps)).toBe(0)
    expect(out).toEqual(['0.1.0'])
  })

  it('prints "unknown" when the version is omitted', async () => {
    const { deps, out } = harness({ version: undefined })
    expect(await runCli(['version'], deps)).toBe(0)
    expect(out).toEqual(['unknown'])
  })

  it('reports an unknown command', async () => {
    const { deps, err } = harness()
    expect(await runCli(['nope'], deps)).toBe(1)
    expect(err[0]).toContain('unknown command "nope"')
  })

  it('dispatches to a registered command handler', async () => {
    let seen = ''
    const commands: Record<string, CommandHandler> = {
      bench: async (args) => {
        seen = args.command
        return 0
      },
    }
    const { deps } = harness({ commands })
    expect(await runCli(['bench', 'mmlu', '--json'], deps)).toBe(0)
    expect(seen).toBe('bench')
  })

  it('maps a handler error to a non-zero exit code', async () => {
    const commands: Record<string, CommandHandler> = {
      bench: async () => {
        throw new Error('boom')
      },
    }
    const { deps, err } = harness({ commands })
    expect(await runCli(['bench'], deps)).toBe(1)
    expect(err[0]).toBe('boom')
  })

  it('maps a non-Error handler throw to its string form', async () => {
    const commands: Record<string, CommandHandler> = {
      bench: async () => {
        throw 'raw-string-error'
      },
    }
    const { deps, err } = harness({ commands })
    expect(await runCli(['bench'], deps)).toBe(1)
    expect(err[0]).toBe('raw-string-error')
  })

  it('maps a parse error to a non-zero exit code', async () => {
    const { deps, err } = harness()
    expect(await runCli(['bench', '-x'], deps)).toBe(1)
    expect(err[0]).toContain('unsupported short option')
  })
})
