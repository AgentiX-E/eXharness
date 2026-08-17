import nodeFs from 'node:fs'
import path from 'node:path'
import * as git from 'isomorphic-git'

/**
 * A versioned document store built on isomorphic-git. Unlike the KV-shaped
 * `StorageDriver`, this exposes file + commit semantics and is intended for
 * low-frequency, auditable objects (harness definitions, evaluation reports,
 * candidate manifests) that need rollback and a human-readable history. It
 * runs on the local filesystem via Node's `fs`, with an injectable `fs` for
 * test isolation.
 */

export interface GitAuthor {
  name: string
  email: string
}

export interface GitCommitInfo {
  oid: string
  message: string
  author: GitAuthor
  /** Unix epoch milliseconds of the commit. */
  timestamp: number
}

export interface GitDriverOptions {
  /** Working directory (a `.git` repository, created by `init`). */
  dir: string
  /** File-system implementation (defaults to Node's `fs`). */
  fs?: typeof nodeFs
  /** Author used when `commit()` is called without an explicit author. */
  author?: GitAuthor
}

const DEFAULT_AUTHOR: GitAuthor = {
  name: 'Lambertyan',
  email: '35325629+Lambertyan@users.noreply.github.com',
}

export class GitDriver {
  readonly kind = 'git'

  private readonly dir: string
  private readonly fs: typeof nodeFs
  private readonly author: GitAuthor
  private initialized = false

  constructor(options: GitDriverOptions) {
    if (options.dir.length === 0) throw new Error('GitDriver: dir must be a non-empty path')
    this.dir = options.dir
    this.fs = options.fs ?? nodeFs
    this.author = options.author ?? DEFAULT_AUTHOR
  }

  /** Initialize an empty repository (idempotent). */
  async init(): Promise<void> {
    if (this.initialized) return
    await git.init({ fs: this.fs, dir: this.dir })
    this.initialized = true
  }

  /** Write a file into the working tree (does not commit). */
  async writeFile(filepath: string, content: string): Promise<void> {
    await this.ensureInit()
    this.assertRelativePath(filepath)
    const full = path.join(this.dir, filepath)
    await this.fs.promises.mkdir(path.dirname(full), { recursive: true })
    await this.fs.promises.writeFile(full, content, 'utf8')
  }

  /** Read a file at `ref` (defaults to HEAD). Returns null when absent. */
  async readFile(filepath: string, ref = 'HEAD'): Promise<string | null> {
    await this.ensureInit()
    this.assertRelativePath(filepath)
    const oid = await git.resolveRef({ fs: this.fs, dir: this.dir, ref })
    try {
      const { blob } = await git.readBlob({ fs: this.fs, dir: this.dir, oid, filepath })
      return new TextDecoder().decode(blob)
    } catch {
      return null
    }
  }

  /** List tracked files at `ref` (defaults to HEAD). */
  async listFiles(ref = 'HEAD'): Promise<string[]> {
    await this.ensureInit()
    return git.listFiles({ fs: this.fs, dir: this.dir, ref })
  }

  /** Whether a file exists at `ref`. */
  async hasFile(filepath: string, ref = 'HEAD'): Promise<boolean> {
    return (await this.readFile(filepath, ref)) !== null
  }

  /** Delete a file from the working tree (does not commit). */
  async removeFile(filepath: string): Promise<void> {
    await this.ensureInit()
    this.assertRelativePath(filepath)
    await this.fs.promises.rm(path.join(this.dir, filepath), { force: true })
  }

  /**
   * Stage every working-tree change (adds, modifications, deletions) and create
   * a commit. Returns the new commit oid.
   *
   * We enumerate the working tree explicitly instead of relying on
   * `git.statusMatrix`, whose stat-based (size + mtime) cache can misclassify a
   * same-size, same-mtime rewrite as "unchanged". `git.add` always re-hashes the
   * file content, so it is immune to that cache.
   */
  async commit(message: string, author: GitAuthor = this.author): Promise<string> {
    await this.ensureInit()
    if (message.length === 0) throw new Error('GitDriver: commit message must be non-empty')
    const workdirFiles = await this.walkWorkdir()
    const headFiles = await this.trackedFiles()

    for (const filepath of workdirFiles) {
      await git.add({ fs: this.fs, dir: this.dir, filepath })
    }
    for (const filepath of headFiles) {
      if (!workdirFiles.includes(filepath)) {
        await git.remove({ fs: this.fs, dir: this.dir, filepath })
      }
    }
    return git.commit({ fs: this.fs, dir: this.dir, message, author })
  }

  /** Commit history, optionally filtered to a single path. */
  async log(filepath?: string): Promise<GitCommitInfo[]> {
    await this.ensureInit()
    const commits = await git.log({ fs: this.fs, dir: this.dir, filepath })
    return commits.map((entry) => ({
      oid: entry.oid,
      message: entry.commit.message.trimEnd(),
      author: {
        name: entry.commit.author.name,
        email: entry.commit.author.email,
      },
      timestamp: entry.commit.author.timestamp * 1000,
    }))
  }

  /** Check out `ref`, replacing the working tree with its snapshot. */
  async checkout(ref: string): Promise<void> {
    await this.ensureInit()
    await git.checkout({ fs: this.fs, dir: this.dir, ref })
  }

  /** Resolve the current HEAD commit oid, or null when the repo has no commits. */
  async currentOid(): Promise<string | null> {
    await this.ensureInit()
    try {
      return await git.resolveRef({ fs: this.fs, dir: this.dir, ref: 'HEAD' })
    } catch {
      return null
    }
  }

  private async walkWorkdir(dir = this.dir, base = ''): Promise<string[]> {
    const entries = await this.fs.promises.readdir(dir, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
      const relative = base === '' ? entry.name : `${base}/${entry.name}`
      if (entry.isDirectory()) {
        if (entry.name === '.git') continue
        files.push(...(await this.walkWorkdir(path.join(dir, entry.name), relative)))
      } else if (entry.isFile()) {
        files.push(relative)
      }
    }
    return files
  }

  private async trackedFiles(): Promise<string[]> {
    try {
      return await git.listFiles({ fs: this.fs, dir: this.dir, ref: 'HEAD' })
    } catch {
      return []
    }
  }

  private async ensureInit(): Promise<void> {
    if (!this.initialized) await this.init()
  }

  private assertRelativePath(filepath: string): void {
    if (filepath.length === 0 || path.isAbsolute(filepath) || filepath.includes('..')) {
      throw new Error(`GitDriver: invalid file path "${filepath}"`)
    }
  }
}
