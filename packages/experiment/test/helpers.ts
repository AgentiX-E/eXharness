import { evaluateArithmetic } from '@exharness/harness'
import { gsm8kBenchmark, type Benchmark } from '@exharness/benchmarks'
import { mulberry32, type Rng } from '@exharness/evolution'
import type { LlmProvider, LlmResult, LlmGenerateOptions } from '@exharness/llm'

const ARITHMETIC_PATTERN = /(?:\d+(?:\.\d+)?\s*[+\-*/]\s*)+\d+(?:\.\d+)?/

/**
 * A deterministic test LLM that actually evaluates the arithmetic expression
 * embedded in the prompt (simulating a model that can compute), but returns a
 * wrong answer with probability `baseError + temperature * slope`. This makes
 * the benchmark error rate a smooth, reproducible function of the harness
 * temperature — exactly what an optimizer can learn.
 */
export class ArithmeticLlm implements LlmProvider {
  readonly kind = 'arithmetic-test'
  private readonly rng: Rng

  constructor(
    private readonly baseError = 0.1,
    private readonly slope = 0.8,
    seed = 1,
  ) {
    this.rng = mulberry32(seed)
  }

  async generate(options: LlmGenerateOptions): Promise<LlmResult> {
    const lastUser = [...options.messages].reverse().find((m) => m.role === 'user')
    const prompt = lastUser?.content ?? ''
    ARITHMETIC_PATTERN.lastIndex = 0
    const match = ARITHMETIC_PATTERN.exec(prompt)
    const answer = match === null ? 0 : evaluateArithmetic(match[0].trim())
    const temperature = options.temperature ?? 0
    const errorRate = Math.min(1, Math.max(0, this.baseError + temperature * this.slope))
    const wrong = this.rng() < errorRate
    return { content: String(wrong ? answer + 1 : answer), finishReason: 'stop' }
  }
}

/** A small deterministic arithmetic benchmark (GSM8K-style numeric answers). */
export function arithmeticBenchmark(): Benchmark {
  return gsm8kBenchmark('arithmetic', [
    { question: 'What is 2 + 3?', answer: '5' },
    { question: 'What is 7 * 6?', answer: '42' },
    { question: 'What is 10 - 4?', answer: '6' },
    { question: 'What is 20 / 5?', answer: '4' },
    { question: 'What is 3 + 4 * 2?', answer: '11' },
    { question: 'What is 9 - 2 * 3?', answer: '3' },
  ])
}
