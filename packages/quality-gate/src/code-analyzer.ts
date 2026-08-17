import type { GateCheckResult, GateContext, GateRunner } from './types.js'

/**
 * The client contract for the internal AgentiX code-analyzer. The real
 * integration shells out to the `code-analyzer review` CLI (or its MCP server);
 * tests inject a deterministic fake. Keeping it behind this interface keeps the
 * gate plugin environment-agnostic and hot-swappable.
 */
export interface CodeAnalyzerClient {
  /** Review a directory; returns whether it passes and how many issues were found. */
  review(path: string): Promise<{ passed: boolean; issues: number }>
}

export interface CodeAnalyzerRunnerOptions {
  client: CodeAnalyzerClient
  /** Directory to review, defaulting to the gate context `cwd` or ".". */
  path?: string
}

/**
 * A gate runner that delegates to the AgentiX code-analyzer (enterprise code
 * quality monitoring). Blocks the gate when the review reports blocking issues.
 */
export class CodeAnalyzerRunner implements GateRunner {
  readonly name = 'code-analyzer'
  private readonly client: CodeAnalyzerClient
  private readonly path?: string

  constructor(options: CodeAnalyzerRunnerOptions) {
    this.client = options.client
    this.path = options.path
  }

  async run(context: GateContext): Promise<GateCheckResult> {
    const path = this.path ?? (typeof context.cwd === 'string' ? context.cwd : '.')
    const result = await this.client.review(path)
    return {
      name: this.name,
      status: result.passed ? 'passed' : 'failed',
      summary: result.passed ? 'no blocking issues' : `${result.issues} blocking issue(s) found`,
      details: { issues: result.issues },
    }
  }
}
