import http from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  MockEmbeddingProvider,
  OpenAiCompatibleEmbeddingProvider,
  cosineSimilarity,
  dotProduct,
  euclideanDistance,
  norm,
  normalize,
} from '../src/index.js'

describe('vector math', () => {
  it('computes cosine similarity', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosineSimilarity([1, 1], [1, 1])).toBeCloseTo(1)
    expect(cosineSimilarity([1, 2], [2, 4])).toBeCloseTo(1)
  })

  it('returns 0 for a zero vector', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0)
  })

  it('throws on dimension mismatch', () => {
    expect(() => cosineSimilarity([1, 2], [1])).toThrow(/dimension mismatch/)
    expect(() => dotProduct([1], [1, 2])).toThrow(/dimension mismatch/)
    expect(() => euclideanDistance([1], [1, 2])).toThrow(/dimension mismatch/)
  })

  it('computes dot product, euclidean distance and norm', () => {
    expect(dotProduct([1, 2, 3], [4, 5, 6])).toBe(32)
    expect(euclideanDistance([0, 0], [3, 4])).toBeCloseTo(5)
    expect(norm([3, 4])).toBeCloseTo(5)
  })

  it('normalizes to unit length and leaves zero vectors unchanged', () => {
    const v = normalize([3, 4])
    expect(norm(v)).toBeCloseTo(1)
    expect(normalize([0, 0])).toEqual([0, 0])
  })
})

describe('MockEmbeddingProvider', () => {
  it('produces deterministic, unit-length vectors of the requested dimension', async () => {
    const provider = new MockEmbeddingProvider(64)
    const [a, b] = await provider.embed(['hello', 'world'])
    expect(a).toHaveLength(64)
    expect(b).toHaveLength(64)
    expect(norm(a)).toBeCloseTo(1)
    const again = await provider.embed(['hello'])
    expect(again[0]).toEqual(a)
    expect(a).not.toEqual(b)
  })

  it('rejects non-positive dimensions', () => {
    expect(() => new MockEmbeddingProvider(0)).toThrow(/positive integer/)
  })
})

describe('OpenAiCompatibleEmbeddingProvider (real local HTTP)', () => {
  let server: http.Server
  let port: number

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        const parsed = JSON.parse(body || '{}')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            data: (parsed.input as string[]).map((_, i) => ({ index: i, embedding: [i, i + 0.5] })),
          }),
        )
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as any).port
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
  })

  it('embeds multiple texts preserving input order', async () => {
    const provider = new OpenAiCompatibleEmbeddingProvider({
      baseUrl: `http://127.0.0.1:${port}/v1`,
      apiKey: 'k',
      model: 'text-embedding',
    })
    const vectors = await provider.embed(['a', 'b'])
    expect(vectors).toEqual([
      [0, 0.5],
      [1, 1.5],
    ])
  })

  it('throws on non-2xx responses', async () => {
    const fail = http.createServer((_req, res) => {
      res.writeHead(500)
      res.end('err')
    })
    await new Promise<void>((resolve) => fail.listen(0, '127.0.0.1', resolve))
    const failPort = (fail.address() as any).port
    try {
      const provider = new OpenAiCompatibleEmbeddingProvider({
        baseUrl: `http://127.0.0.1:${failPort}/v1`,
        apiKey: 'k',
        model: 'm',
      })
      await expect(provider.embed(['a'])).rejects.toThrow(/500/)
    } finally {
      await new Promise<void>((resolve, reject) => fail.close((e) => (e ? reject(e) : resolve())))
    }
  })
})
