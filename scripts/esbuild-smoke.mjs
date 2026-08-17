/**
 * esbuild parse smoke gate.
 *
 * Parses every TypeScript source file with esbuild to catch syntax errors and
 * obvious module-grammar mistakes much faster than a full type-check. It is the
 * fast pre-commit gate; the full typecheck/test/coverage run in pre-push and CI.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { transform } from 'esbuild'

const packagesDir = 'packages'
const packages = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

let parsed = 0
let failed = false

for (const pkg of packages) {
  const srcDir = join(packagesDir, pkg, 'src')
  let files
  try {
    files = readdirSync(srcDir, { recursive: true }).filter((f) => typeof f === 'string' && f.endsWith('.ts'))
  } catch {
    continue
  }
  for (const file of files) {
    const path = join(srcDir, file)
    const source = readFileSync(path, 'utf8')
    try {
      await transform(source, {
        loader: 'ts',
        tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: true } },
      })
      parsed++
    } catch (error) {
      console.error(`esbuild-smoke: parse error in ${path}: ${error.message}`)
      failed = true
    }
  }
}

console.log(`esbuild-smoke: parsed ${parsed} TypeScript source files`)
if (failed) {
  console.error('esbuild-smoke: FAILED')
  process.exit(1)
}
