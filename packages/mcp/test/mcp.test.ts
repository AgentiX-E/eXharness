import { describe, expect, it } from 'vitest'
import { JSON_RPC_ERRORS, McpServer, type JsonRpcRequest } from '../src/index.js'

function request(method: string, params?: Record<string, unknown>, id: number | string = 1): JsonRpcRequest {
  return { jsonrpc: '2.0', id, method, params }
}

describe('McpServer', () => {
  function makeServer() {
    const server = new McpServer({ name: 'test', version: '1.0.0' })
    server.registerTool({
      name: 'add',
      description: 'Add two numbers.',
      inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } },
      handler: async (args) => ({ content: [{ type: 'text', text: String(Number(args.a) + Number(args.b)) }] }),
    })
    return server
  }

  it('handles initialize with server info and protocol version', async () => {
    const response = await makeServer().handle(request('initialize'))
    expect(response?.result).toEqual({
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'test', version: '1.0.0' },
    })
  })

  it('lists registered tools', async () => {
    const response = await makeServer().handle(request('tools/list'))
    expect(response?.result).toEqual({
      tools: [
        {
          name: 'add',
          description: 'Add two numbers.',
          inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } },
        },
      ],
    })
  })

  it('calls a tool handler', async () => {
    const response = await makeServer().handle(request('tools/call', { name: 'add', arguments: { a: 2, b: 3 } }))
    expect(response?.result).toEqual({ content: [{ type: 'text', text: '5' }] })
  })

  it('responds to ping', async () => {
    const response = await makeServer().handle(request('ping'))
    expect(response?.result).toEqual({})
  })

  it('returns METHOD_NOT_FOUND for unknown methods', async () => {
    const response = await makeServer().handle(request('unknown/method'))
    expect(response?.error?.code).toBe(JSON_RPC_ERRORS.METHOD_NOT_FOUND)
  })

  it('returns INVALID_PARAMS for unknown tools and missing names', async () => {
    const server = makeServer()
    expect((await server.handle(request('tools/call', { name: 'nope' })))?.error?.code).toBe(
      JSON_RPC_ERRORS.INVALID_PARAMS,
    )
    expect((await server.handle(request('tools/call', {})))?.error?.code).toBe(JSON_RPC_ERRORS.INVALID_PARAMS)
  })

  it('returns INTERNAL_ERROR when a handler throws', async () => {
    const server = new McpServer()
    server.registerTool({
      name: 'boom',
      description: 'throws',
      inputSchema: {},
      handler: () => {
        throw new Error('kaboom')
      },
    })
    const response = await server.handle(request('tools/call', { name: 'boom' }))
    expect(response?.error?.code).toBe(JSON_RPC_ERRORS.INTERNAL_ERROR)
    expect(response?.error?.message).toBe('kaboom')
  })

  it('returns null for notifications (no id)', async () => {
    const server = makeServer()
    expect(await server.handle({ jsonrpc: '2.0', method: 'ping' })).toBeNull()
    expect(await server.handle({ jsonrpc: '2.0', method: 'unknown/method' })).toBeNull()
  })

  it('rejects duplicate tool names and reports toolNames', () => {
    const server = makeServer()
    expect(server.toolNames).toEqual(['add'])
    expect(() =>
      server.registerTool({ name: 'add', description: 'dup', inputSchema: {}, handler: async () => ({ content: [] }) }),
    ).toThrow(/already registered/)
  })
})
