import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MockProvider } from '@exharness/llm'
import { HELP_TEXT, runMain, type MainIo } from '../src/index.js'

function io() {
  const out: string[] = []
  const err: string[] = []
  const sink: MainIo = {
    out: (s) => out.push(s),
    err: (s) => err.push(s),
  }
  return { sink, out, err }
}

describe('runMain', () => {
  it('prints the version', async () => {
    const { sink, out } = io()
    expect(await runMain(['version'], {}, sink)).toBe(0)
    expect(out).toEqual(['0.1.0'])
  })

  it('prints help', async () => {
    const { sink, out } = io()
    expect(await runMain(['help'], {}, sink)).toBe(0)
    expect(out).toEqual([HELP_TEXT])
  })

  it('runs the experiment command end-to-end', async () => {
    const { sink, out } = io()
    expect(await runMain(['experiment', '--trials=2'], {}, sink)).toBe(0)
    expect(out[0]).toContain('BOHB mean loss')
  })

  it('runs the bench command with an injected LLM', async () => {
    const llm = new MockProvider({ responses: ['5', '42', '6', '4', '11', '3'] })
    const { sink, out } = io()
    expect(await runMain(['bench', 'arithmetic'], {}, sink, () => llm)).toBe(0)
    expect(out[0]).toContain('6/6 correct')
  })

  it('reads a gsm8k JSONL file through the real file reader', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'exharness-cli-'))
    try {
      const file = join(dir, 'gsm8k.jsonl')
      writeFileSync(file, '{"question":"What is 1+1?","answer":"2"}\n', 'utf8')
      const llm = new MockProvider({ responses: ['2'] })
      const { sink, out } = io()
      expect(await runMain(['bench', 'gsm8k', `--file=${file}`], {}, sink, () => llm)).toBe(0)
      expect(out[0]).toContain('1/1 correct')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
