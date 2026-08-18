#!/usr/bin/env node
import { runMain } from './main.js'

runMain(process.argv.slice(2), process.env as Record<string, string | undefined>, {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
})
  .then((code) => {
    process.exit(code)
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  })
