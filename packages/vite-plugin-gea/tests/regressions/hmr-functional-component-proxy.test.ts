/**
 * Ensures the plugin classifies functional Gea component files as component modules so
 * `injectHMR` rewrites imports with `createHotComponentProxy` (see isComponentModule +
 * looksLikeGeaFunctionalComponentSource in src/index.ts).
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { ResolvedConfig } from 'vite'
import { geaPlugin } from '../../src/index'

test('geaPlugin: functional child module gets createHotComponentProxy on parent import (HMR)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gea-hmr-func-proxy-'))
  try {
    writeFileSync(
      join(dir, 'child.tsx'),
      `export default function Child() {
  return <div class="c">x</div>
}
`,
    )
    writeFileSync(
      join(dir, 'parent.tsx'),
      `import { Component } from '@geajs/core'
import Child from './child'

export default class Parent extends Component {
  template() {
    return <Child />
  }
}
`,
    )

    const plugin = geaPlugin()
    const configResolved = plugin.configResolved
    if (typeof configResolved === 'function') {
      configResolved.call({} as never, { command: 'serve' } as ResolvedConfig)
    }
    const transform = plugin.transform
    assert.ok(typeof transform === 'function')
    const run = transform as (this: unknown, code: string, id: string) => ReturnType<NonNullable<typeof transform>>

    const childPath = join(dir, 'child.tsx')
    const parentPath = join(dir, 'parent.tsx')
    const childCode = readFileSync(childPath, 'utf8')
    const parentCode = readFileSync(parentPath, 'utf8')

    await run.call({} as never, childCode, childPath)
    const parentOut = await run.call({} as never, parentCode, parentPath)

    const code = typeof parentOut === 'object' && parentOut && 'code' in parentOut ? String(parentOut.code) : ''
    assert.ok(code.includes('createHotComponentProxy'), 'parent should proxy functional child import for HMR')
    assert.ok(code.includes('__hmr_Child'), 'import should be rewritten to __hmr_Child + proxy')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
