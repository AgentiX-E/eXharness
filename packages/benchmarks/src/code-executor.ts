import { spawn } from 'node:child_process'

/**
 * The result of executing a snippet of code in a sandboxed interpreter.
 */
export interface CodeExecutionResult {
  stdout: string
  stderr: string
  /** Process exit code (null/undefined is normalised to -1). */
  exitCode: number
  /** True when the execution was killed by the timeout. */
  timedOut: boolean
}

/**
 * A pluggable code executor. The default implementation runs a real local
 * interpreter subprocess (see `LocalPythonExecutor`); callers may substitute a
 * remote sandbox or a WASM interpreter without changing the evaluation logic.
 */
export interface CodeExecutor {
  execute(code: string, options?: { timeoutMs?: number }): Promise<CodeExecutionResult>
}

export interface LocalPythonExecutorOptions {
  /** Interpreter executable (defaults to `python3`). */
  pythonPath?: string
  /** Default per-execution timeout (defaults to 5000 ms). */
  timeoutMs?: number
}

/**
 * Executes Python code in a real `python3` subprocess. The code is piped over
 * stdin (so long programs never hit an argv length limit), stdout/stderr are
 * captured, and a wall-clock timeout kills the process with SIGKILL.
 */
export class LocalPythonExecutor implements CodeExecutor {
  private readonly pythonPath: string
  private readonly defaultTimeoutMs: number

  constructor(options: LocalPythonExecutorOptions = {}) {
    this.pythonPath = options.pythonPath ?? 'python3'
    if (this.pythonPath.length === 0) throw new Error('LocalPythonExecutor: pythonPath must be non-empty')
    this.defaultTimeoutMs = options.timeoutMs ?? 5000
  }

  async execute(code: string, options: { timeoutMs?: number } = {}): Promise<CodeExecutionResult> {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs
    if (!(timeoutMs > 0) || !Number.isFinite(timeoutMs)) {
      throw new Error('LocalPythonExecutor: timeoutMs must be a positive finite number')
    }

    return new Promise<CodeExecutionResult>((resolve, reject) => {
      const child = spawn(this.pythonPath, ['-'], { stdio: ['pipe', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      let timedOut = false
      let settled = false

      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, timeoutMs)

      const settle = (fn: () => void): void => {
        clearTimeout(timer)
        if (!settled) {
          settled = true
          fn()
        }
      }

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })
      child.on('error', (error) => {
        settle(() => reject(error))
      })
      child.on('close', (exitCode) => {
        settle(() => resolve({ stdout, stderr, exitCode: exitCode ?? -1, timedOut }))
      })

      child.stdin.write(code)
      child.stdin.end()
    })
  }
}
