import { describe, expect, it } from 'vitest'
import { LocalPythonExecutor } from '../src/code-executor.js'
import type { CodeExecutor } from '../src/code-executor.js'
import { buildHumanEvalCode, evaluateHumanEval, type HumanEvalSample } from '../src/human-eval.js'

const sample: HumanEvalSample = {
  taskId: 'HumanEval/0',
  prompt: `from typing import List


def has_close_elements(numbers: List[float], threshold: float) -> bool:
    """ Check if in given list of numbers, are any two numbers closer to each other than given threshold.
    >>> has_close_elements([1.0, 2.0, 3.0], 0.5)
    False
    """
`,
  test: `def check(candidate):
    assert candidate([1.0, 2.0, 3.0], 0.5) == False
    assert candidate([1.0, 2.0, 3.0], 1.5) == True
    assert candidate([1.0, 2.0, 8.0, 3.0], 0.5) == False
    assert candidate([1.0, 2.0, 8.0, 3.0], 2.0) == True
`,
  entryPoint: 'has_close_elements',
}

const correctCompletion = `    for idx, elem in enumerate(numbers):
        for idx2, elem2 in enumerate(numbers):
            if idx != idx2:
                distance = abs(elem - elem2)
                if distance < threshold:
                    return True
    return False
`

const wrongCompletion = `    return False
`

describe('buildHumanEvalCode', () => {
  it('assembles the candidate, test harness and check call', () => {
    const code = buildHumanEvalCode(
      'def f():\n    """doc"""\n',
      '    return 1\n',
      'def check(c):\n    assert c() == 1\n',
      'f',
    )
    expect(code).toContain('def f()')
    expect(code).toContain('return 1')
    expect(code).toContain('def check(c)')
    expect(code).toContain('check(f)')
  })
})

describe('evaluateHumanEval', () => {
  it('reports pass@1 = 1 for a correct completion', async () => {
    const executor = new LocalPythonExecutor()
    const result = await evaluateHumanEval([sample], executor, async () => correctCompletion, { numSamples: 1, k: 1 })
    expect(result.totalN).toBe(1)
    expect(result.totalC).toBe(1)
    expect(result.passAt1).toBe(1)
    expect(result.passAtK).toBe(1)
    expect(result.failedGenerations).toBe(0)
    expect(result.samples[0]).toEqual({ taskId: 'HumanEval/0', passed: 1, total: 1, failedGenerations: 0 })
  })

  it('reports pass@1 = 0 for an incorrect completion', async () => {
    const executor = new LocalPythonExecutor()
    const result = await evaluateHumanEval([sample], executor, async () => wrongCompletion, { numSamples: 1, k: 1 })
    expect(result.totalC).toBe(0)
    expect(result.passAt1).toBe(0)
  })

  it('aggregates multiple samples into an unbiased pass@k', async () => {
    const executor = new LocalPythonExecutor()
    const completions = [correctCompletion, wrongCompletion]
    let cursor = 0
    const result = await evaluateHumanEval(
      [sample, { ...sample, taskId: 'HumanEval/1' }],
      executor,
      async () => completions[cursor++ % completions.length]!,
      { numSamples: 2, k: 2 },
    )
    expect(result.totalN).toBe(4)
    expect(result.totalC).toBe(2)
    // pass@2 with n=4, c=2: 1 - C(2,2)/C(4,2) = 1 - 1/6 = 5/6.
    expect(result.passAtK).toBeCloseTo(5 / 6, 12)
  })

  it('returns zero for an empty sample set', async () => {
    const executor = new LocalPythonExecutor()
    const result = await evaluateHumanEval([], executor, async () => '', {})
    expect(result.totalN).toBe(0)
    expect(result.passAt1).toBe(0)
    expect(result.passAtK).toBe(0)
  })

  it('forwards a timeout to the executor', async () => {
    const executor = new LocalPythonExecutor()
    const result = await evaluateHumanEval([sample], executor, async () => correctCompletion, {
      numSamples: 1,
      k: 1,
      timeoutMs: 5000,
    })
    expect(result.passAt1).toBe(1)
  })

  it('rejects invalid options', async () => {
    const executor = new LocalPythonExecutor()
    await expect(evaluateHumanEval([sample], executor, async () => '', { numSamples: 0 })).rejects.toThrow(/numSamples/)
    await expect(evaluateHumanEval([sample], executor, async () => '', { numSamples: 1, k: 0 })).rejects.toThrow(/k/)
    await expect(evaluateHumanEval([sample], executor, async () => '', { numSamples: 1, k: 2 })).rejects.toThrow(
      /k must be <= numSamples/,
    )
  })

  it('records failed generations and continues when a completion throws', async () => {
    const executor = new LocalPythonExecutor()
    let calls = 0
    const result = await evaluateHumanEval(
      [sample, { ...sample, taskId: 'HumanEval/1' }],
      executor,
      async () => {
        calls++
        if (calls === 1) throw new Error('rate limited')
        return correctCompletion
      },
      { numSamples: 1, k: 1 },
    )
    expect(result.totalN).toBe(2)
    expect(result.totalC).toBe(1)
    expect(result.passAt1).toBe(0.5)
    expect(result.failedGenerations).toBe(1)
    expect(result.samples[0]).toEqual({ taskId: 'HumanEval/0', passed: 0, total: 1, failedGenerations: 1 })
    expect(result.samples[1]).toEqual({ taskId: 'HumanEval/1', passed: 1, total: 1, failedGenerations: 0 })
  })

  it('reports an all-failed generation with zero pass@k', async () => {
    const executor = new LocalPythonExecutor()
    const result = await evaluateHumanEval(
      [sample],
      executor,
      async () => {
        throw new Error('down')
      },
      { numSamples: 1, k: 1 },
    )
    expect(result.totalN).toBe(1)
    expect(result.totalC).toBe(0)
    expect(result.passAt1).toBe(0)
    expect(result.failedGenerations).toBe(1)
    expect(result.samples[0]).toEqual({ taskId: 'HumanEval/0', passed: 0, total: 1, failedGenerations: 1 })
  })

  it('records an executor failure and continues', async () => {
    const failingExecutor: CodeExecutor = {
      async execute() {
        throw new Error('python3 not found')
      },
    }
    const result = await evaluateHumanEval([sample], failingExecutor, async () => correctCompletion, {
      numSamples: 1,
      k: 1,
    })
    expect(result.totalN).toBe(1)
    expect(result.totalC).toBe(0)
    expect(result.passAt1).toBe(0)
    expect(result.failedGenerations).toBe(1)
    expect(result.samples[0]).toEqual({ taskId: 'HumanEval/0', passed: 0, total: 1, failedGenerations: 1 })
  })
})
