#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const benchRoot = resolve(root, '..', 'js-framework-benchmark')

const config = JSON.parse(readFileSync(resolve(root, 'benchmark-report.config.json'), 'utf-8'))

const { values } = parseArgs({
  options: {
    run: { type: 'boolean', default: false },
    rebuild: { type: 'boolean', default: false },
    framework: { type: 'string', multiple: true, default: [] },
    benchmark: { type: 'string', multiple: true, default: [] },
    count: { type: 'string', default: '' },
    headless: { type: 'boolean', default: true },
  },
  strict: false,
  allowPositionals: true,
})

const frameworks = values.framework.length > 0 ? values.framework : config.frameworks

function run(cmd, cwd) {
  console.log(`\n> ${cmd}\n`)
  execSync(cmd, { cwd, stdio: 'inherit' })
}

if (values.rebuild) {
  for (const fw of frameworks) {
    run(`node cli.js rebuild-single -f ${fw}`, benchRoot)
  }
}

if (values.run) {
  const fwFlags = frameworks.map((f) => `--framework ${f}`).join(' ')
  const bmFlags = values.benchmark.map((b) => `--benchmark ${b}`).join(' ')
  const headless = values.headless ? '--headless' : ''
  const countFlag = values.count ? `--count ${values.count}` : ''
  run(
    `node dist/benchmarkRunner.js ${fwFlags} ${bmFlags} ${headless} ${countFlag}`.trim(),
    resolve(benchRoot, 'webdriver-ts'),
  )
}

// Generate report
const fwFlags = frameworks.map((f) => `--framework ${f}`).join(' ')
run(`node dist/createResultJS.js ${fwFlags}`, resolve(benchRoot, 'webdriver-ts'))
run('npm run build', resolve(benchRoot, 'webdriver-ts-results'))

console.log('\nReport updated successfully.')
