import { describe, expect, it } from 'vitest'
import {
  BASE_DEPTH_PROMPT,
  BREADTH_PROMPT,
  DEPTH_METHODS,
  buildEvolutionPrompt,
  buildSelfInstructPrompt,
  formatSeedTask,
} from '../src/index.js'

describe('Evol-Instruct prompts', () => {
  it('builds a depth prompt with the strategy inserted', () => {
    const prompt = buildEvolutionPrompt('deepen', 'Write a story about a dog.')
    expect(prompt).toContain(BASE_DEPTH_PROMPT.replace('{method}', DEPTH_METHODS.deepen))
    expect(prompt).toContain('#The Given Prompt#: Write a story about a dog.')
    expect(prompt).toContain('#Rewritten Prompt#:')
  })

  it('supports all four depth strategies', () => {
    for (const method of ['add-constraint', 'deepen', 'concretize', 'add-reasoning'] as const) {
      const prompt = buildEvolutionPrompt(method, 'task')
      expect(prompt).toContain(DEPTH_METHODS[method])
    }
  })

  it('builds a breadth prompt with the creator preamble', () => {
    const prompt = buildEvolutionPrompt('broaden', 'Write a haiku about the sea.')
    expect(prompt).toContain(BREADTH_PROMPT)
    expect(prompt).toContain('#Given Prompt#: Write a haiku about the sea.')
    expect(prompt).toContain('#Created Prompt#:')
  })

  it('distinguishes depth from breadth templates', () => {
    expect(buildEvolutionPrompt('deepen', 'x')).toContain('Prompt Rewriter')
    expect(buildEvolutionPrompt('broaden', 'x')).toContain('Prompt Creator')
  })
})

describe('formatSeedTask', () => {
  it('formats a task with input and output', () => {
    expect(
      formatSeedTask({ instruction: 'Fix the grammar.', input: 'He go school.', output: 'He goes to school.' }, 3),
    ).toBe('Task 3: Fix the grammar.\nInstance 3: He go school. -> He goes to school.')
  })

  it('formats a self-contained task without input', () => {
    expect(formatSeedTask({ instruction: 'Write a poem.', output: 'Roses are red...' }, 1)).toBe(
      'Task 1: Write a poem.\nInstance 1: Roses are red...',
    )
  })
})

describe('buildSelfInstructPrompt', () => {
  const seeds = [
    { instruction: 'Fix grammar.', input: 'He go.', output: 'He goes.' },
    { instruction: 'Write a poem.', output: 'Roses...' },
  ]

  it('embeds the seed demonstrations and target count', () => {
    const prompt = buildSelfInstructPrompt(seeds, 5)
    expect(prompt).toContain('come up with a set of 5 diverse task instructions')
    expect(prompt).toContain('Task 1: Fix grammar.')
    expect(prompt).toContain('Instance 1: He go. -> He goes.')
    expect(prompt).toContain('Task 2: Write a poem.')
    expect(prompt).toContain('List of 5 tasks:')
  })

  it('rejects empty seeds and invalid counts', () => {
    expect(() => buildSelfInstructPrompt([], 5)).toThrow(/at least one seed/)
    expect(() => buildSelfInstructPrompt(seeds, 0)).toThrow(/positive integer/)
    expect(() => buildSelfInstructPrompt(seeds, 1.5)).toThrow(/positive integer/)
  })
})
