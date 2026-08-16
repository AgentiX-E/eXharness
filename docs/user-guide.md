# eXharness User Guide

## Installation

```bash
git clone <repo-url> && cd eXharness
pnpm install && pnpm build
```

## 1. Create a context and register services

```ts
import { createRoot } from '@exharness/core'
import { createStorage } from '@exharness/storage'
import { MockProvider } from '@exharness/llm'

declare module '@exharness/core' {
  interface Services {
    storage: import('@exharness/storage').StorageDriver
    llm: import('@exharness/llm').LlmProvider
  }
}

const root = createRoot()
root.provide('storage', createStorage())
root.provide('llm', new MockProvider({ responses: ['{"answer": 42}'] }))
```

## 2. Build and run a harness

```ts
import { z } from 'zod'
import { HarnessRunner, TemplatePrompt, ZodEnforcer, PredicateValidator, RegexSolver } from '@exharness/harness'

const runner = new HarnessRunner({
  prompt: new TemplatePrompt('Answer: {task}'),
  router: { route: (input) => (input.task.includes('math') ? 'math' : 'general') },
  solver: new RegexSolver(/(\d+) plus (\d+)/),
  enforcer: new ZodEnforcer(z.object({ answer: z.number() })),
  validator: new PredicateValidator([
    { name: 'positive', predicate: (o: { answer: number }) => o.answer > 0 },
  ]),
})

const llm = root.get('llm')
const output = await runner.run(llm, { task: '2 plus 3' })
console.log(output) // usedSolver: true, no LLM call
```

## 3. Evaluate with statistics

```ts
import { welchTTest, cohensD, bootstrapMeanCI, accuracy } from '@exharness/eval'

const baseline = [0.5, 0.6, 0.55]
const candidate = [0.7, 0.75, 0.72]
const test = welchTTest(baseline, candidate)
console.log(test.pValue, cohensD(baseline, candidate))
console.log(bootstrapMeanCI(candidate, { seed: 42 }))
console.log(accuracy([1, 2, 3], [1, 2, 4]))
```

## 4. Run a self-evolving Canary

```ts
import { CanaryController } from '@exharness/evolution'

const canary = new CanaryController({
  baselineId: 'v1',
  candidateId: 'v2',
  p0: 0.5,   // baseline success rate (H0)
  p1: 0.8,   // candidate target rate (H1)
})

for (let i = 0; i < 1000; i++) {
  const arm = canary.route()                 // Thompson sampling
  const success = Math.random() < 0.8        // observe the real outcome
  canary.observe(arm, success)
  if (canary.decision() !== 'continue') break
}

console.log(canary.decision())              // 'accept-alternative' | 'accept-null'
```

## 5. Choose a storage driver

```ts
import { MemoryDriver } from '@exharness/storage'          // Node + browser
import { SqliteDriver } from '@exharness/storage/sqlite'   // Node (embedded)
import { PostgresDriver } from '@exharness/storage/postgres' // Node (distributed)

const db = new SqliteDriver('/tmp/app.db')
await db.connect()
await db.insert('sessions', { id: 's1', messages: [] })
```

## 6. Use a real LLM / embedding (browser-safe fetch)

```ts
import { OpenAiCompatibleProvider } from '@exharness/llm'

const llm = new OpenAiCompatibleProvider({
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY!, // env-injected, never committed
  model: 'deepseek-chat',
})
```

## Notes

- Never commit API keys — inject via environment variables only.
- `master` is the primary branch; run the full regression before pushing.
