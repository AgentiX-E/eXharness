import http from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MockProvider, OpenAiCompatibleProvider } from '../src/index.js'

describe('MockProvider', () => {
  it('echoes the last user message when echo is enabled', async () => {
    const provider = new MockProvider({ echo: true })
    const result = await provider.generate({
      model: 'x',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hello' },
      ],
    })
    expect(result.content).toBe('hello')
  })

  it('cycles deterministic responses in order', async () => {
    const provider = new MockProvider({ responses: ['a', 'b'] })
    expect((await provider.generate({ model: 'x', messages: [] })).content).toBe('a')
    expect((await provider.generate({ model: 'x', messages: [] })).content).toBe('b')
    expect((await provider.generate({ model: 'x', messages: [] })).content).toBe('a')
  })

  it('returns configured usage', async () => {
    const provider = new MockProvider({ usage: { inputTokens: 3, outputTokens: 4 } })
    const result = await provider.generate({ model: 'x', messages: [] })
    expect(result.usage).toEqual({ inputTokens: 3, outputTokens: 4 })
  })

  it('returns empty content by default', async () => {
    const provider = new MockProvider()
    expect((await provider.generate({ model: 'x', messages: [] })).content).toBe('')
  })
})

describe('OpenAiCompatibleProvider (real local HTTP)', () => {
  let server: http.Server
  let port: number
  const requests: Array<{ url: string; headers: http.IncomingHttpHeaders; body: any }> = []

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        requests.push({ url: req.url ?? '', headers: req.headers, body: JSON.parse(body || '{}') })
        if (req.url?.includes('/chat/completions')) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              choices: [{ message: { content: 'world' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 1, completion_tokens: 2 },
            }),
          )
        } else {
          res.writeHead(500)
          res.end('server error')
        }
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as any).port
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
  })

  it('sends a well-formed request and parses the response', async () => {
    const provider = new OpenAiCompatibleProvider({
      baseUrl: `http://127.0.0.1:${port}/v1`,
      apiKey: 'test-key',
      model: 'm1',
    })
    const result = await provider.generate({ messages: [{ role: 'user', content: 'hi' }] })
    expect(result.content).toBe('world')
    expect(result.finishReason).toBe('stop')
    expect(result.usage).toEqual({ inputTokens: 1, outputTokens: 2 })

    const request = requests[requests.length - 1]!
    expect(request.url).toBe('/v1/chat/completions')
    expect(request.headers.authorization).toBe('Bearer test-key')
    expect(request.body.model).toBe('m1')
    expect(request.body.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('passes jsonMode as response_format json_object', async () => {
    const provider = new OpenAiCompatibleProvider({ baseUrl: `http://127.0.0.1:${port}/v1`, apiKey: 'k' })
    await provider.generate({ model: 'm', messages: [], jsonMode: true })
    const request = requests[requests.length - 1]!
    expect(request.body.response_format).toEqual({ type: 'json_object' })
  })

  it('forwards temperature, maxTokens, stop and tools', async () => {
    const provider = new OpenAiCompatibleProvider({ baseUrl: `http://127.0.0.1:${port}/v1`, apiKey: 'k' })
    await provider.generate({
      model: 'm',
      messages: [],
      temperature: 0.3,
      maxTokens: 128,
      stop: ['\n'],
      tools: [{ type: 'function', function: { name: 'f', parameters: {} } }],
    })
    const request = requests[requests.length - 1]!
    expect(request.body.temperature).toBe(0.3)
    expect(request.body.max_tokens).toBe(128)
    expect(request.body.stop).toEqual(['\n'])
    expect(request.body.tools).toHaveLength(1)
  })

  it('throws a descriptive error on non-2xx responses', async () => {
    // A dedicated endpoint that always fails, exercising the error path.
    const failServer = http.createServer((_req, res) => {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'upstream down' } }))
    })
    await new Promise<void>((resolve) => failServer.listen(0, '127.0.0.1', resolve))
    const failPort = (failServer.address() as any).port
    try {
      const provider = new OpenAiCompatibleProvider({ baseUrl: `http://127.0.0.1:${failPort}/v1`, apiKey: 'k' })
      await expect(provider.generate({ model: 'm', messages: [] })).rejects.toThrow(/503/)
    } finally {
      await new Promise<void>((resolve, reject) => failServer.close((e) => (e ? reject(e) : resolve())))
    }
  })

  it('returns empty content when the model returns non-string content', async () => {
    const srv = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ choices: [{ message: { content: null } }] }))
    })
    await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve))
    const p = (srv.address() as any).port
    try {
      const provider = new OpenAiCompatibleProvider({ baseUrl: `http://127.0.0.1:${p}/v1`, apiKey: 'k' })
      const result = await provider.generate({ model: 'm', messages: [] })
      expect(result.content).toBe('')
    } finally {
      await new Promise<void>((resolve, reject) => srv.close((e) => (e ? reject(e) : resolve())))
    }
  })
})
