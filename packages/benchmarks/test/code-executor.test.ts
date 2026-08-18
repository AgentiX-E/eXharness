import { describe, expect, it } from 'vitest'
import { LocalPythonExecutor } from '../src/code-executor.js'

describe('LocalPythonExecutor', () => {
  it('executes code and captures stdout', async () => {
    const executor = new LocalPythonExecutor()
    const result = await executor.execute('print(1 + 1)')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('2\n')
    expect(result.stderr).toBe('')
    expect(result.timedOut).toBe(false)
  })

  it('captures stderr and a non-zero exit code for failing code', async () => {
    const executor = new LocalPythonExecutor()
    const result = await executor.execute('import sys\nprint("boom", file=sys.stderr)\nsys.exit(3)')
    expect(result.exitCode).toBe(3)
    expect(result.stderr).toContain('boom')
    expect(result.timedOut).toBe(false)
  })

  it('reports a non-zero exit code for an uncaught exception', async () => {
    const executor = new LocalPythonExecutor()
    const result = await executor.execute('raise ValueError("bad")')
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('ValueError')
  })

  it('kills an infinite loop on timeout', async () => {
    const executor = new LocalPythonExecutor({ timeoutMs: 100 })
    const result = await executor.execute('while True:\n    pass')
    expect(result.timedOut).toBe(true)
  }, 10000)

  it('rejects when the interpreter is not found', async () => {
    const executor = new LocalPythonExecutor({ pythonPath: 'definitely-not-a-real-python' })
    await expect(executor.execute('print(1)')).rejects.toThrow()
  })

  it('validates construction arguments', async () => {
    expect(() => new LocalPythonExecutor({ pythonPath: '' })).toThrow(/non-empty/)
    const executor = new LocalPythonExecutor()
    await expect(executor.execute('print(1)', { timeoutMs: 0 })).rejects.toThrow(/positive finite/)
  })
})
