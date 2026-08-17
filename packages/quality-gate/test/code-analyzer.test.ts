import { describe, expect, it } from 'vitest'
import { CodeAnalyzerRunner, type CodeAnalyzerClient } from '../src/index.js'

const passingClient: CodeAnalyzerClient = { review: async () => ({ passed: true, issues: 0 }) }
const failingClient: CodeAnalyzerClient = { review: async () => ({ passed: false, issues: 7 }) }

describe('CodeAnalyzerRunner', () => {
  it('passes when the review reports no blocking issues', async () => {
    const runner = new CodeAnalyzerRunner({ client: passingClient })
    const result = await runner.run({ cwd: '/repo' })
    expect(result.status).toBe('passed')
    expect(result.summary).toBe('no blocking issues')
    expect(result.details).toEqual({ issues: 0 })
  })

  it('fails when the review reports issues', async () => {
    const runner = new CodeAnalyzerRunner({ client: failingClient })
    const result = await runner.run({})
    expect(result.status).toBe('failed')
    expect(result.summary).toContain('7')
  })

  it('uses an explicit path over the context cwd', async () => {
    const seen: string[] = []
    const runner = new CodeAnalyzerRunner({
      path: '/explicit',
      client: { review: async (p) => (seen.push(p), { passed: true, issues: 0 }) },
    })
    await runner.run({ cwd: '/context' })
    expect(seen).toEqual(['/explicit'])
  })

  it('defaults the path to cwd then "."', async () => {
    const seen: string[] = []
    const client: CodeAnalyzerClient = { review: async (p) => (seen.push(p), { passed: true, issues: 0 }) }
    await new CodeAnalyzerRunner({ client }).run({ cwd: '/from-cwd' })
    await new CodeAnalyzerRunner({ client }).run({})
    expect(seen).toEqual(['/from-cwd', '.'])
  })
})
