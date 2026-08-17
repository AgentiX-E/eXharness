import { JSON_RPC_ERRORS, type JsonRpcRequest, type JsonRpcResponse, type McpTool } from './types.js'

/** An MCP-level error carrying a JSON-RPC error code. */
export class McpError extends Error {
  readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.code = code
  }
}

export interface McpServerOptions {
  /** Server name reported to clients during `initialize`. */
  name?: string
  /** Server version reported to clients during `initialize`. */
  version?: string
  /** MCP protocol version (defaults to 2024-11-05). */
  protocolVersion?: string
}

/**
 * A dependency-free MCP server core. It registers typed tools and handles
 * JSON-RPC 2.0 requests for `initialize`, `tools/list`, `tools/call` and
 * `ping`. Notifications (requests without an id) are handled without a reply.
 */
export class McpServer {
  private readonly tools = new Map<string, McpTool>()
  private readonly serverInfo: { name: string; version: string }
  private readonly protocolVersion: string

  constructor(options: McpServerOptions = {}) {
    this.serverInfo = { name: options.name ?? 'exharness', version: options.version ?? '0.1.0' }
    this.protocolVersion = options.protocolVersion ?? '2024-11-05'
  }

  registerTool(tool: McpTool): void {
    if (this.tools.has(tool.name)) throw new Error(`MCP: tool "${tool.name}" is already registered`)
    this.tools.set(tool.name, tool)
  }

  get toolNames(): string[] {
    return [...this.tools.keys()]
  }

  /** Handle a JSON-RPC message; returns null for notifications (no id). */
  async handle(message: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const isNotification = message.id === undefined
    try {
      const result = await this.dispatch(message.method, message.params ?? {})
      return isNotification ? null : { jsonrpc: '2.0', id: message.id!, result }
    } catch (error) {
      if (isNotification) return null
      const rpcError =
        error instanceof McpError
          ? { code: error.code, message: error.message }
          : { code: JSON_RPC_ERRORS.INTERNAL_ERROR, message: error instanceof Error ? error.message : String(error) }
      return { jsonrpc: '2.0', id: message.id!, error: rpcError }
    }
  }

  private async dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'initialize':
        return {
          protocolVersion: this.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: this.serverInfo,
        }
      case 'tools/list':
        return {
          tools: [...this.tools.values()].map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        }
      case 'tools/call': {
        const name = params.name
        if (typeof name !== 'string' || name.length === 0) {
          throw new McpError(JSON_RPC_ERRORS.INVALID_PARAMS, 'tools/call requires a non-empty string name')
        }
        const tool = this.tools.get(name)
        if (tool === undefined) throw new McpError(JSON_RPC_ERRORS.INVALID_PARAMS, `unknown tool "${name}"`)
        const args =
          typeof params.arguments === 'object' && params.arguments !== null
            ? (params.arguments as Record<string, unknown>)
            : {}
        return tool.handler(args)
      }
      case 'ping':
        return {}
      default:
        throw new McpError(JSON_RPC_ERRORS.METHOD_NOT_FOUND, `unknown method "${method}"`)
    }
  }
}
