import { describe, expect, it } from 'vitest'
import { parseArgs } from '../src/args.js'

describe('parseArgs', () => {
  it('parses a command with options, flags and positionals', () => {
    const args = parseArgs(['bench', 'mmlu', '--samples=20', '--json'])
    expect(args.command).toBe('bench')
    expect(args.positionals).toEqual(['mmlu'])
    expect(args.options.get('samples')).toBe('20')
    expect(args.flags.has('json')).toBe(true)
  })

  it('defaults to help for an empty invocation', () => {
    const args = parseArgs([])
    expect(args.command).toBe('help')
    expect(args.positionals).toEqual([])
  })

  it('treats help as a flag', () => {
    expect(parseArgs(['bench', '--help']).flags.has('help')).toBe(true)
    expect(parseArgs(['-h']).flags.has('help')).toBe(true)
  })

  it('ignores a bare -- separator', () => {
    const args = parseArgs(['bench', '--', 'positional'])
    expect(args.positionals).toEqual(['positional'])
  })

  it('rejects short options other than -h', () => {
    expect(() => parseArgs(['bench', '-x'])).toThrow(/unsupported short option/)
  })

  it('rejects an empty option key', () => {
    expect(() => parseArgs(['bench', '--=value'])).toThrow(/invalid option/)
  })

  it('handles a flag without a value', () => {
    const args = parseArgs(['experiment', '--verbose'])
    expect(args.flags.has('verbose')).toBe(true)
    expect(args.options.size).toBe(0)
  })
})
