import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitDriver } from '../src/git.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exharness-git-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('GitDriver', () => {
  it('initializes idempotently and exposes its kind', async () => {
    const driver = new GitDriver({ dir })
    expect(driver.kind).toBe('git')
    await driver.init()
    await driver.init()
    expect(await driver.currentOid()).toBeNull() // empty repo has no HEAD
  })

  it('writes, commits and reads files back', async () => {
    const driver = new GitDriver({ dir })
    await driver.writeFile('docs/a.md', 'version 1')
    await driver.writeFile('docs/b.md', 'version 1')
    const oid = await driver.commit('add docs')
    expect(oid).toMatch(/^[0-9a-f]{40}$/)
    expect(await driver.readFile('docs/a.md')).toBe('version 1')
    expect(await driver.listFiles()).toEqual(['docs/a.md', 'docs/b.md'])
    expect(await driver.hasFile('docs/a.md')).toBe(true)
    expect(await driver.hasFile('missing.md')).toBe(false)
  })

  it('preserves history and reads a past revision by ref', async () => {
    const driver = new GitDriver({ dir })
    await driver.writeFile('f.txt', 'v1')
    const oid1 = await driver.commit('first')
    await driver.writeFile('f.txt', 'v2')
    const oid2 = await driver.commit('second')

    expect(await driver.readFile('f.txt')).toBe('v2')
    expect(await driver.readFile('f.txt', oid1)).toBe('v1')
    const log = await driver.log()
    expect(log).toHaveLength(2)
    expect(log[0]!.oid).toBe(oid2)
    expect(log[0]!.message).toBe('second')
    expect(log[0]!.author.name).toBe('Lambertyan')
    expect(log[1]!.oid).toBe(oid1)
  })

  it('rolls back to a previous commit via checkout', async () => {
    const driver = new GitDriver({ dir })
    await driver.writeFile('f.txt', 'v1')
    const oid1 = await driver.commit('first')
    await driver.writeFile('f.txt', 'v2')
    await driver.commit('second')

    await driver.checkout(oid1)
    expect(await driver.readFile('f.txt')).toBe('v1')
  })

  it('tracks deletions and commits them', async () => {
    const driver = new GitDriver({ dir })
    await driver.writeFile('f.txt', 'v1')
    await driver.commit('first')
    await driver.removeFile('f.txt')
    await driver.commit('delete')

    expect(await driver.hasFile('f.txt')).toBe(false)
    expect(await driver.listFiles()).toEqual([])
    expect(await driver.log()).toHaveLength(2)
  })

  it('returns null when reading an absent file', async () => {
    const driver = new GitDriver({ dir })
    await driver.writeFile('f.txt', 'x')
    await driver.commit('c')
    expect(await driver.readFile('missing.txt')).toBeNull()
  })

  it('rejects invalid constructor arguments and paths', async () => {
    expect(() => new GitDriver({ dir: '' })).toThrow(/non-empty path/)
    const driver = new GitDriver({ dir })
    await expect(driver.commit('')).rejects.toThrow(/non-empty/)
    await expect(driver.writeFile('', 'x')).rejects.toThrow(/invalid file path/)
    await expect(driver.writeFile('/abs.txt', 'x')).rejects.toThrow(/invalid file path/)
    await expect(driver.writeFile('../escape.txt', 'x')).rejects.toThrow(/invalid file path/)
  })

  it('accepts an injected filesystem implementation', async () => {
    const driver = new GitDriver({ dir, fs })
    await driver.writeFile('f.txt', 'via injected fs')
    await driver.commit('c')
    expect(await driver.readFile('f.txt')).toBe('via injected fs')
  })
})
