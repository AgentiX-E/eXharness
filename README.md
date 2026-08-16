# eXharness

**TypeScript-native Agent Harness lifecycle management & self-evolution framework** — for Node and the browser.

eXharness turns the "execution shell" around an LLM (prompt templates, task routing, deterministic code solvers, format enforcement, validation rules) into a set of **hot-pluggable, reversible plugins** with full lifecycle management, and closes the loop with a **statistically rigorous self-evolution engine** that promotes better harness variants through Thompson-sampling Canary releases.

It is the TypeScript-native answer to Python-centric evaluation stacks, inspired by [arXiv:2608.12307 — *AI4AI at Test-Time: Strong-to-Weak Capability Transfer via Harnesses*](https://arxiv.org/abs/2608.12307) and the reversible-effect micro-kernel of [Cordis](https://github.com/cordiverse/cordis).

---

## Why eXharness

| Capability | eXharness | DeepEval / LangSmith / promptfoo / Ragas |
|---|---|---|
| TypeScript-native (Node **and** browser) | ✅ | ❌ (Python / server-side) |
| Harness hot-mount / hot-unmount / rollback | ✅ reversible effects | ❌ static scaffolds |
| Self-evolution (auto swap model / prompt / offload) | ✅ built-in | ❌ or bolted on |
| Pluggable storage (embedded SQLite ↔ distributed PG) | ✅ | partial / cloud-locked |
| Pluggable LLM & Embedding abstraction | ✅ zero-SDK fetch | partial |
| Statistically valid Canary (SPRT + t-test + effect size) | ✅ first-class | ❌ naive A/B |

## Packages

| Package | Purpose |
|---|---|
| `@exharness/core` | Zero-dependency reversible-effect micro-kernel (plugin / service / effect / event / context) |
| `@exharness/harness` | The five-component harness model + runner (prompt / router / solver / enforcer / validator) |
| `@exharness/eval` | High-precision statistics (t-test, Cohen's d, bootstrap, SPRT) + scoring metrics |
| `@exharness/evolution` | Monitoring + Thompson-sampling traffic routing + Canary promotion |
| `@exharness/storage` | Pluggable storage: in-memory / SQLite (embedded) / PostgreSQL (distributed) |
| `@exharness/llm` | Pluggable LLM: OpenAI-compatible (fetch) + deterministic mock |
| `@exharness/embedding` | Pluggable embedding + high-precision vector math (cosine / dot / normalize) |

## Quick start

```bash
pnpm install
pnpm build
pnpm test          # 139 tests
pnpm coverage      # lines 98.6% · functions 96.7% · statements 98.6%
```

```ts
import { createRoot } from '@exharness/core'

declare module '@exharness/core' {
  interface Services { storage: Storage }
}

const root = createRoot()

// Mount a plugin; it can be unmounted (and fully rolled back) at any time.
const off = root.plugin((ctx) => {
  ctx.effect(() => {
    console.log('harness mounted')
    return () => console.log('harness unmounted (reversible)')
  })
})

await off() // LIFO, idempotent, reversible
```

See [docs/architecture.md](./docs/architecture.md) for the full design and
[docs/user-guide.md](./docs/user-guide.md) for a step-by-step guide.

## Status

Early-stage reference implementation. `master` is the primary branch. CI and
quality gates are configured in `.github/workflows` and enforced before push via
Husky (typecheck + esbuild parse smoke + full regression).

## License

Apache-2.0
