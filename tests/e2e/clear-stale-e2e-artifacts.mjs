/**
 * When running the full E2E suite (no E2E_PROJECT), remove artifacts from a prior
 * single-example run. Otherwise resolveActiveExamples() keeps only that example's
 * project/webServer (~35 tests instead of the full matrix).
 */
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sessionFile = resolve(__dirname, '.e2e-session.json')
const portFile = resolve(__dirname, '.e2e-ports.json')

if (process.env.E2E_PROJECT) {
  process.exit(0)
}

try {
  if (existsSync(sessionFile)) {
    unlinkSync(sessionFile)
  }
  if (existsSync(portFile)) {
    const raw = JSON.parse(readFileSync(portFile, 'utf8'))
    if (raw.key !== '__all__') {
      unlinkSync(portFile)
    }
  }
} catch {
  /* ignore */
}
