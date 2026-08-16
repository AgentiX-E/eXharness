import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { MockProvider } from '@exharness/llm'
import {
  HarnessRunner,
  PredicateValidator,
  RegexSolver,
  TemplatePrompt,
  ZodEnforcer,
} from '../src/index.js'

describe('TemplatePrompt', () => {
  it('substitutes variables and leaves unknown ones empty', () => {
    const prompt = new TemplatePrompt('Task: {task} (route={route}, x={x})')
    expect(prompt.render({ task: 'hello', route: 'r1' })).toBe('Task: hello (route=r1, x=)')
  })
})

describe('ZodEnforcer', () => {
  const schema = z.object({ answer: z.number() })

  it('parses valid JSON against the schema', () => {
    const enforcer = new ZodEnforcer(schema)
    expect(enforcer.parse('{"answer": 42}')).toEqual({ answer: 42 })
  })

  it('throws a descriptive error for invalid output', () => {
    const enforcer = new ZodEnforcer(schema)
    expect(() => enforcer.parse('{"answer": "nope"}')).toThrow(/format enforcement failed/)
  })

  it('falls back to the raw string when JSON is malformed', () => {
    const enforcer = new ZodEnforcer(z.string())
    expect(enforcer.parse('{"unclosed"')).toBe('{"unclosed"')
  })
})

describe('PredicateValidator', () => {
  it('accumulates predicate failures and computes a score', () => {
    const validator = new PredicateValidator(
      [
        { name: 'positive', predicate: (n: number) => n > 0 },
        { name: 'even', predicate: (n: number) => n % 2 === 0 },
      ],
      (n) => n,
    )
    const result = validator.validate(3)
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(['even'])
    expect(result.score).toBe(3)
  })

  it('treats a throwing predicate as a failure', () => {
    const validator = new PredicateValidator([{ name: 'boom', predicate: () => { throw new Error('x') } }])
    expect(validator.validate(1).valid).toBe(false)
  })
})

describe('RegexSolver', () => {
  it('offloads a matching task into deterministic code', () => {
    const solver = new RegexSolver(/What is (\d+) plus (\d+)\?/)
    const input = { task: 'What is 2 plus 3?' }
    expect(solver.canSolve(input)).toBe(true)
    expect(solver.solve(input)).toBe('2')
  })

  it('declines a non-matching task', () => {
    const solver = new RegexSolver(/^compute:/)
    expect(solver.canSolve({ task: 'not matching' })).toBe(false)
  })

  it('supports named capture groups', () => {
    const solver = new RegexSolver(/result=(?<value>.+)/, 'value')
    expect(solver.solve({ task: 'result=abc' })).toBe('abc')
  })

  it('returns empty string when the capture group is absent', () => {
    const solver = new RegexSolver(/a(b)?c/, 1)
    expect(solver.solve({ task: 'ac' })).toBe('')
  })
})

describe('HarnessRunner', () => {
  it('uses the deterministic solver without calling the LLM', async () => {
    let llmCalls = 0
    const llm = {
      kind: 'spy',
      async generate() {
        llmCalls++
        return { content: 'should-not-happen' }
      },
    }
    const runner = new HarnessRunner({
      prompt: new TemplatePrompt('{task}'),
      validator: new PredicateValidator([{ name: 'truthy', predicate: (s: string) => s.length > 0 }]),
      solver: new RegexSolver(/result=(.+)/),
    })
    const output = await runner.run(llm, { task: 'result=done' })
    expect(output.result).toBe('done')
    expect(output.usedSolver).toBe(true)
    expect(llmCalls).toBe(0)
    expect(output.valid).toBe(true)
  })

  it('calls the LLM and enforces format with retry on invalid output', async () => {
    const responses = ['not-json', '{"answer": 7}']
    const llm = new MockProvider({ responses })
    const runner = new HarnessRunner({
      prompt: new TemplatePrompt('Solve: {task}'),
      validator: new PredicateValidator([{ name: 'positive', predicate: (o: { answer: number }) => o.answer > 0 }]),
      enforcer: new ZodEnforcer(z.object({ answer: z.number() })),
      maxAttempts: 3,
    })
    const output = await runner.run(llm, { task: 'compute' })
    expect(output.result).toEqual({ answer: 7 })
    expect(output.valid).toBe(true)
    expect(output.attempts).toBe(2)
    expect(output.usedSolver).toBe(false)
  })

  it('reports invalid results from the validator', async () => {
    const llm = new MockProvider({ responses: ['{"answer": -1}'] })
    const runner = new HarnessRunner({
      prompt: new TemplatePrompt('{task}'),
      validator: new PredicateValidator([{ name: 'positive', predicate: (o: { answer: number }) => o.answer > 0 }]),
      enforcer: new ZodEnforcer(z.object({ answer: z.number() })),
    })
    const output = await runner.run(llm, { task: 'x' })
    expect(output.valid).toBe(false)
    expect(output.validationErrors).toEqual(['positive'])
  })

  it('throws after exhausting retries', async () => {
    const llm = new MockProvider({ responses: ['bad', 'bad', 'bad'] })
    const runner = new HarnessRunner({
      prompt: new TemplatePrompt('{task}'),
      validator: new PredicateValidator([{ name: 'x', predicate: () => true }]),
      enforcer: new ZodEnforcer(z.object({ answer: z.number() })),
      maxAttempts: 2,
    })
    await expect(runner.run(llm, { task: 'x' })).rejects.toThrow(/failed after 2/)
  })

  it('returns the raw content when no enforcer is configured', async () => {
    const llm = new MockProvider({ responses: ['raw answer'] })
    const runner = new HarnessRunner({
      prompt: new TemplatePrompt('{task}'),
      validator: new PredicateValidator([{ name: 'truthy', predicate: (s: string) => s.length > 0 }]),
    })
    const output = await runner.run(llm, { task: 'x' })
    expect(output.result).toBe('raw answer')
    expect(output.valid).toBe(true)
    expect(output.usedSolver).toBe(false)
  })

  it('uses a custom router to select the route', async () => {
    const llm = new MockProvider({ responses: ['x'] })
    const runner = new HarnessRunner({
      prompt: new TemplatePrompt('{task}'),
      validator: new PredicateValidator([{ name: 'x', predicate: () => true }]),
      router: { route: () => 'custom-route' },
    })
    const output = await runner.run(llm, { task: 'x' })
    expect(output.route).toBe('custom-route')
  })
})
