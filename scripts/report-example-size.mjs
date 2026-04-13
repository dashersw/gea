import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const dirs = process.argv.slice(2)

if (dirs.length === 0) {
  console.error('Usage: node scripts/report-example-size.mjs <dist-dir> [...dist-dir]')
  process.exit(1)
}

function collectFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const path = resolve(dir, entry.name)
    return entry.isDirectory() ? collectFiles(path) : [path]
  })
}

function bundleSize(distDir) {
  const files = collectFiles(resolve(distDir)).filter((file) => file.endsWith('.js') || file.endsWith('.css'))
  const rawBytes = files.reduce((total, file) => total + statSync(file).size, 0)
  const gzipBytes = files.reduce((total, file) => total + gzipSync(readFileSync(file)).length, 0)
  return { rawBytes, gzipBytes }
}

const results = dirs.map((dir) => ({ dir, ...bundleSize(dir) }))

function kb(bytes) {
  return bytes / 1000
}

for (const result of results) {
  console.log(`${result.dir}: ${kb(result.gzipBytes).toFixed(2)} kb gzip (${kb(result.rawBytes).toFixed(2)} kb raw)`)
}

if (results.length === 2) {
  const [base, router] = results
  const delta = router.gzipBytes - base.gzipBytes
  console.log(`router delta: ${kb(delta).toFixed(2)} kb gzip`)
  console.log(
    `docs shorthand: ~${kb(router.gzipBytes).toFixed(1)} kb gzipped with the router, ~${kb(base.gzipBytes).toFixed(1)} kb without`,
  )
}
