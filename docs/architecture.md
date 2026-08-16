# eXharness Architecture

## 1. Design goals

1. **Node + browser** — every package is ESM/CJS dual, `sideEffects: false`, zero
   Node builtins in universal paths; Node-only drivers live behind subpath exports.
2. **Reversible effects** — every side effect returns a `Disposable`; teardown is
   LIFO, idempotent, and order-deterministic.
3. **Pluggable, embedded** — storage, LLM and embedding are behind interfaces with
   in-process implementations; no external service/process is required.
4. **Scientifically valid evolution** — Canary decisions use SPRT, Thompson
   sampling and effect sizes, not ad-hoc thresholds.

## 2. Package dependency graph

```
@exharness/core        (micro-kernel, zero deps)
    ├── @exharness/storage      (memory / sqlite / postgres)
    ├── @exharness/llm          (openai-compatible / mock)
    ├── @exharness/embedding    (openai-compatible / mock + vector math)
    ├── @exharness/harness      (depends on @exharness/llm + zod)
    ├── @exharness/eval         (statistics + metrics, zero deps)
    └── @exharness/evolution    (depends on @exharness/eval)
```

`core` is the only foundational layer; everything else is a service/plugin on top.

## 3. Core micro-kernel (`@exharness/core`)

Five concepts, mirroring Cordis semantics while being self-contained:

- **Plugin** — `(ctx, config) => void | Disposable` or `{ name?, inject?, apply }`.
  Plugins with unmet `inject` dependencies stay *pending* and mount automatically
  when dependencies appear (spatiotemporal composability).
- **Service** — type-safe DI via `declare module '@exharness/core' { interface Services {…} }`;
  `ctx.provide(name, value)` returns a disposer that removes the service and
  unmounts its dependents.
- **Effect** — `ctx.effect(execute)` registers a reversible side effect; teardown
  is LIFO, idempotent, and async-aware.
- **Event** — typed, five dispatch modes: `emit`, `parallel`, `serial`, `bail`,
  `waterfall`. Listener registration is itself reversible.
- **Context** — scoped container with `isolate()`; `dispose()` tears down
  descendants before itself.

Lifecycle state machine: `pending → loading → active`, and `failed / unloading /
disposed`. A failed mount rolls back partial effects.

## 4. Harness model (`@exharness/harness`)

The five components (after arXiv:2608.12307):

1. **Prompt template** — renders a task + variables into a prompt.
2. **Task router** — maps an input to a benchmark-specific route.
3. **Deterministic solver** — offloads stable reasoning into code; when it can
   solve the input, **no LLM call is made**.
4. **Format enforcer** — Zod-schema validation with retry-on-invalid.
5. **Validator** — pure-function assertions + optional score.

`HarnessRunner.run()` executes: route → offload → render → LLM → enforce (retry)
→ validate, returning a traced `HarnessOutput`.

## 5. Evaluation (`@exharness/eval`)

Self-implemented, high-precision, zero-dependency:

- Descriptive: mean (Welford variance), median/quantile, min/max.
- Inference: Welch & Student & paired t-test (p-values via the regularized
  incomplete beta function), Cohen's d / Hedges' g, Mann–Whitney U.
- Resampling: percentile bootstrap CI (seeded Mulberry32 PRNG).
- Metrics: accuracy, exact match, precision/recall/Fβ, confusion matrix.
- SPRT: Wald's sequential probability ratio test for Bernoulli outcomes.

## 6. Evolution (`@exharness/evolution`)

- **MetricsCollector** accumulates success rate / latency / cost per harness.
- **ThompsonRouter** maintains Beta–Binomial posteriors per arm and routes
  traffic by posterior sampling (exploration–exploitation optimal).
- **CanaryController** couples Thompson routing with SPRT: `accept-alternative`
  promotes the candidate, `accept-null` keeps/rolls back the baseline, otherwise
  keep collecting.

## 7. Storage / LLM / Embedding abstractions

- **Storage** — `StorageDriver` (connect / insert / get / list / update / remove /
  clear). `MemoryDriver` (universal), `SqliteDriver` (`better-sqlite3`, Node),
  `PostgresDriver` (`pg`, Node). Subpath exports keep Node-only drivers out of
  browser bundles.
- **LLM** — `LlmProvider.generate()`. `OpenAiCompatibleProvider` is fetch-based
  (OpenAI / DeepSeek / Ollama / vLLM) with no SDK; `MockProvider` is deterministic.
- **Embedding** — `EmbeddingProvider.embed()`, plus `cosineSimilarity`,
  `dotProduct`, `euclideanDistance`, `norm`, `normalize`.

## 8. Observability & quality gates

- Tracing data model follows OpenTelemetry GenAI semantic conventions so it can be
  exported to any OTel backend without vendor lock-in (see the roadmap).
- Husky pre-push runs typecheck + esbuild parse smoke + full regression, and
  GitHub Actions CI mirrors the same checks so local == remote.
