import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        'packages/*/src/**/*.test.ts',
        // Process entrypoints contain `process.exit`, which would terminate the
        // test runner if executed in-process. Their logic (wiring the real env,
        // io and LLM factory into `runCli` and passing back the exit code) lives
        // in the tested `main.ts` / `runMain` module.
        'packages/*/src/bin.ts',
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
})
