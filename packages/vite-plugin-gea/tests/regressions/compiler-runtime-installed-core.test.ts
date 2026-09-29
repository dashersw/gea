import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, it } from 'node:test'
import { build, createServer, type InlineConfig } from 'vite'
import { geaPlugin } from '../../src/index.ts'

const coreSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../gea/src')

const PROBE = `import { Component } from '@geajs/core'

export default class Probe extends Component {
  onAfterRenderAsync() {
    document.body.dataset.afterRenderAsync = 'ran'
  }
  template() {
    return <div id="probe">probe</div>
  }
}
`

// @geajs/core installed from npm: a real directory in node_modules (so Vite
// pre-bundles it in dev) whose exports point at built .mjs files. The .mjs
// files re-export core's source, so no `npm run build` is needed.
function installedCoreProject(dirs: string[]): InlineConfig {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'gea-installed-core-')))
  dirs.push(root)
  const core = path.join(root, 'node_modules/@geajs/core')
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ name: 'app', private: true, type: 'module' }),
    'index.html': '<!doctype html><div id="app"></div><script type="module" src="/src/main.ts"></script>',
    'src/main.ts': `import Probe from './Probe'\nnew Probe().render(document.getElementById('app')!)\n`,
    'src/Probe.tsx': PROBE,
    [`${core}/package.json`]: JSON.stringify({
      name: '@geajs/core',
      type: 'module',
      exports: {
        '.': { import: './dist/index.mjs' },
        './compiler-runtime': { import: './dist/compiler-runtime.mjs' },
      },
    }),
    [`${core}/dist/index.mjs`]: `export * from ${JSON.stringify(path.join(coreSrc, 'index.ts'))}\n`,
    [`${core}/dist/compiler-runtime.mjs`]: `export * from ${JSON.stringify(path.join(coreSrc, 'compiler-runtime.ts'))}\n`,
  }
  for (const [name, source] of Object.entries(files)) {
    const file = path.resolve(root, name)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, source)
  }
  return {
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [geaPlugin()],
    oxc: { jsx: 'preserve' },
    build: { write: false },
    server: { middlewareMode: true, hmr: false, ws: false },
  }
}

describe('virtual:gea-compiler-runtime with @geajs/core installed from npm', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('vite build keeps every runtime export, including scheduleAfterRenderAsync (#97)', async () => {
    const output: any = await build(installedCoreProject(dirs))
    const code = (Array.isArray(output) ? output : [output])
      .flatMap((result) => result.output)
      .filter((chunk) => chunk.type === 'chunk')
      .map((chunk) => chunk.code)
      .join('\n')

    assert.match(code, /onAfterRenderAsync/)
    assert.match(code, /requestAnimationFrame/)
  })

  it('dev loads the runtime from the pre-bundled @geajs/core, not a path next to the plugin (#96)', async () => {
    const server = await createServer(installedCoreProject(dirs))
    try {
      // The app's own `@geajs/core` import is pre-bundled...
      const core = await server.environments.client.pluginContainer.resolveId('@geajs/core', '/src/Probe.tsx')
      assert.match(core!.id, /\/node_modules\/\.vite\/deps\/@geajs_core\.js\?v=\w+$/)

      // ...so the runtime must come from the same pre-bundle, not from a path
      // guessed next to core's entry (none: it's a pre-bundle) or the plugin.
      const runtime = await server.transformRequest('virtual:gea-compiler-runtime')
      assert.match(
        runtime!.code,
        /^export \* from "\/node_modules\/\.vite\/deps\/@geajs_core_compiler-runtime\.js\?v=\w+"/,
        runtime!.code,
      )
    } finally {
      await server.close()
    }
  })
})
