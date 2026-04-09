import { readFileSync } from 'node:fs'

const RELATIVE_THRESHOLD = 0.2
const ABSOLUTE_THRESHOLD = 1

const [mainPath, branchPath] = process.argv.slice(2)

if (!mainPath || !branchPath) {
  console.error('Usage: node compare-benchmarks.mjs <main-results.json> <branch-results.json>')
  process.exit(1)
}

const main = JSON.parse(readFileSync(mainPath, 'utf8'))
const branch = JSON.parse(readFileSync(branchPath, 'utf8'))

if (!main.results || typeof main.results !== 'object') {
  console.error(`Missing or invalid .results in ${mainPath}`)
  process.exit(1)
}
if (!branch.results || typeof branch.results !== 'object') {
  console.error(`Missing or invalid .results in ${branchPath}`)
  process.exit(1)
}

const mainResults = main.results
const branchResults = branch.results

const metrics = [...new Set([...Object.keys(mainResults), ...Object.keys(branchResults)])].sort()

const rows = []
let regressionCount = 0

for (const metric of metrics) {
  const m = mainResults[metric]
  const b = branchResults[metric]

  const mainGea = typeof m?.gea === 'number' ? m.gea : undefined
  const branchGea = typeof b?.gea === 'number' ? b.gea : undefined

  if (mainGea === undefined || branchGea === undefined) {
    rows.push(`| ${metric} | ${mainGea !== undefined ? mainGea.toFixed(2) + 'ms' : 'n/a'} | ${branchGea !== undefined ? branchGea.toFixed(2) + 'ms' : 'n/a'} | n/a | :grey_question: missing |`)
    continue
  }
  const absoluteChange = branchGea - mainGea
  const relativeChange = mainGea === 0 ? (branchGea === 0 ? 0 : Infinity) : absoluteChange / mainGea

  let status = ''
  let changeStr = `${relativeChange >= 0 ? '+' : ''}${(relativeChange * 100).toFixed(1)}%`

  const isRegression = relativeChange > RELATIVE_THRESHOLD && absoluteChange > ABSOLUTE_THRESHOLD
  const isImprovement = relativeChange < -RELATIVE_THRESHOLD && absoluteChange < -ABSOLUTE_THRESHOLD

  if (isRegression) {
    status = ':warning: regression'
    changeStr += ` (+${absoluteChange.toFixed(2)}ms)`
    regressionCount++
  } else if (isImprovement) {
    status = ':rocket: improvement'
    changeStr += ` (${absoluteChange.toFixed(2)}ms)`
  }

  rows.push(`| ${metric} | ${mainGea.toFixed(2)}ms | ${branchGea.toFixed(2)}ms | ${changeStr} | ${status} |`)
}

const lines = [
  '## Performance comparison',
  '',
  `> Comparing \`${main.git?.sha?.slice(0, 7) || 'main'}\` (main) vs \`${branch.git?.sha?.slice(0, 7) || 'branch'}\` (branch)`,
  '',
  '| Metric | main | branch | change | |',
  '|---|---|---|---|---|',
  ...rows,
  '',
]

if (regressionCount > 0) {
  lines.push(`**Regression detected** in ${regressionCount} metric(s).`)
} else {
  lines.push('No performance regressions detected.')
}

console.log(lines.join('\n'))

if (regressionCount > 0) {
  process.exit(1)
}
