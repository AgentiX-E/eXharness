import { MockProvider } from '@exharness/llm'
import { describe, expect, it } from 'vitest'
import { SelfInstructPipeline, parseGeneratedInstructions } from '../src/index.js'

const seeds = [
  { instruction: 'Fix the grammar of a sentence.', input: 'He go school.', output: 'He goes to school.' },
  { instruction: 'Write a haiku.', output: 'An old silent pond...' },
]

describe('parseGeneratedInstructions', () => {
  it('splits Task N-prefixed output', () => {
    const output = 'Task 1: First instruction.\nTask 2: Second instruction.\nTask 3: Third instruction.'
    expect(parseGeneratedInstructions(output)).toEqual([
      'First instruction.',
      'Second instruction.',
      'Third instruction.',
    ])
  })

  it('falls back to one instruction per line', () => {
    expect(parseGeneratedInstructions('first\nsecond\nthird')).toEqual(['first', 'second', 'third'])
  })

  it('returns an empty array for blank output', () => {
    expect(parseGeneratedInstructions('')).toEqual([])
    expect(parseGeneratedInstructions('   \n')).toEqual([])
  })
})

describe('SelfInstructPipeline', () => {
  it('generates instructions and grows the pool', async () => {
    const llm = new MockProvider({ responses: ['Task 1: alpha.\nTask 2: beta.'] })
    const pipeline = new SelfInstructPipeline(llm, seeds, { model: 'm', rng: () => 0 })
    const result = await pipeline.generateInstructions(2)
    expect(result).toEqual(['alpha.', 'beta.'])
    expect(pipeline.poolSize).toBe(4) // 2 seeds + 2 generated
  })

  it('deduplicates and filters generated instructions', async () => {
    const llm = new MockProvider({ responses: ['Task 1: alpha.\nTask 2: alpha.\nTask 3: x'] })
    const pipeline = new SelfInstructPipeline(llm, seeds, {
      model: 'm',
      rng: () => 0,
      filter: { minLength: 3 },
    })
    const result = await pipeline.generateInstructions(3)
    // "alpha." is deduplicated; "x" is filtered by minLength.
    expect(result).toEqual(['alpha.'])
    expect(pipeline.poolSize).toBe(3)
  })

  it('rejects instructions already in the seed pool', async () => {
    const llm = new MockProvider({ responses: ['Task 1: Write a haiku.'] })
    const pipeline = new SelfInstructPipeline(llm, seeds, { model: 'm', rng: () => 0 })
    const result = await pipeline.generateInstructions(1)
    expect(result).toEqual([])
    expect(pipeline.poolSize).toBe(2)
  })

  it('rejects invalid configuration', async () => {
    expect(() => new SelfInstructPipeline(new MockProvider(), [], { model: 'm' })).toThrow(/at least one seed/)
    const pipeline = new SelfInstructPipeline(new MockProvider(), seeds, { model: 'm' })
    await expect(pipeline.generateInstructions(0)).rejects.toThrow(/positive integer/)
  })
})
