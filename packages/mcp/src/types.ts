/**
 * Minimal Model Context Protocol (MCP) types: JSON-RPC 2.0 messages and the
 * tool contract. This is a dependency-free implementation of the protocol
 * surface needed to expose eXharness capabilities to clients such as Claude
 * Desktop or Cursor.
 */

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  /** Requests carry an id; notifications (no id) expect no response. */
  id?: number | string
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: JsonRpcError
}

/** JSON-RPC 2.0 standard error codes. */
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const

/** A single text block in a tool result (MCP content format). */
export interface McpTextContent {
  type: 'text'
  text: string
}

export interface McpToolResult {
  content: McpTextContent[]
  /** When true, the tool reported a logical failure (not a protocol error). */
  isError?: boolean
}

/** A registered MCP tool: a name, JSON Schema input, and an async handler. */
export interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (args: Record<string, unknown>) => McpToolResult | Promise<McpToolResult>
}
