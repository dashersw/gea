import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { geaPlugin } from '../../src/index.ts'

describe('geaPlugin IR generation and Rollup tree-shaking', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('omits component and store IR for modules removed from the final bundle', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gea-ir-tree-shaking-'))
    dirs.push(dir)

    const irPath = path.join(dir, 'gea-ir.json')
    const usedPanel = writeFixture(
      dir,
      'UsedPanel.tsx',
      `import { Component } from '@geajs/core'
export class UsedPanel extends Component {
  template() { return <div>used</div> }
}
`,
    )
    const unusedStore = writeFixture(
      dir,
      'unused-store.ts',
      `import { Store } from '@geajs/core'
class UnusedStore extends Store {
  value = 1
}
export const unused = new UnusedStore()
`,
    )
    const unusedPanel = writeFixture(
      dir,
      'UnusedPanel.tsx',
      `import { Component } from '@geajs/core'
import { unused } from './unused-store'
export class UnusedPanel extends Component {
  template() { return <div>{unused.value}</div> }
}
`,
    )

    const plugin = geaPlugin({ ir: { enabled: true, outFile: irPath } }) as any
    const transformContext = { environment: { name: 'client' }, addWatchFile() {} }
    plugin.transform.call(transformContext, readFileSync(unusedStore, 'utf8'), unusedStore)
    plugin.transform.call(transformContext, readFileSync(unusedPanel, 'utf8'), unusedPanel)
    plugin.transform.call(transformContext, readFileSync(usedPanel, 'utf8'), usedPanel)

    plugin.generateBundle.call(
      {},
      {},
      {
        'index.js': {
          type: 'chunk',
          fileName: 'index.js',
          isEntry: true,
          facadeModuleId: usedPanel,
          modules: {
            [usedPanel]: {},
          },
        },
      },
    )

    const ir = JSON.parse(readFileSync(irPath, 'utf8'))
    assert.deepEqual(
      ir.modules.map((module: { file: string }) => path.basename(module.file)).sort(),
      ['UsedPanel.tsx'],
    )
    assert.deepEqual(
      ir.components.map((component: { exportName: string }) => component.exportName),
      ['UsedPanel'],
    )
    assert.deepEqual(ir.stores, [])
  })
})

function writeFixture(dir: string, name: string, source: string): string {
  const file = path.join(dir, name)
  writeFileSync(file, source)
  return file
}
