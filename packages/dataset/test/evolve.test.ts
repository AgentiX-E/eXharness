import { MockProvider } from '@exharness/llm'
import { describe, expect, it } from 'vitest'
import { EVOLUTION_METHODS, Evolver, randomEvolutionMethod } from '../src/index.js'

describe('EVOLUTION_METHODS and randomEvolutionMethod', () => {
  it('lists all five strategies', () => {
    expect(EVOLUTION_METHODS).toEqual(['add-constraint', 'deepen', 'concretize', 'add-reasoning', 'broaden'])
  })

  it('samples a valid method from a deterministic rng', () => {
    const rng = (() => {
      let i = 0
      return () => [0, 0.2, 0.4, 0.6, 0.8][i++ % 5]!
    })()
    for (let i = 0; i < 20; i++) {
      expect(EVOLUTION_METHODS).toContain(randomEvolutionMethod(rng))
    }
  })
})

describe('Evolver', () => {
  it('evolves an instruction through the LLM and trims the result', async () => {
    const llm = new MockProvider({ responses: ['  A more complex instruction.  '] })
    const evolver = new Evolver(llm, { model: 'm' })
    const result = await evolver.evolve('Write a story.', 'deepen')
    expect(result).toEqual({ instruction: 'A more complex instruction.', method: 'deepen' })
  })

  it('builds the right prompt for each strategy', async () => {
    const seen: string[] = []
    const capturing = {
      kind: 'capture' as const,
      generate: async (options: { messages: { content: string }[] }) => {
        seen.push(options.messages[0]!.content)
        return { content: 'evolved' }
      },
    }
    const evolver = new Evolver(capturing, { model: 'm' })
    await evolver.evolve('task', 'add-constraint')
    await evolver.evolve('task', 'broaden')
    expect(seen[0]).toContain('Prompt Rewriter')
    expect(seen[1]).toContain('Prompt Creator')
  })

  it('rejects a blank instruction', async () => {
    const evolver = new Evolver(new MockProvider({ responses: ['x'] }), { model: 'm' })
    await expect(evolver.evolve('   ', 'deepen')).rejects.toThrow(/non-empty/)
  })
})
