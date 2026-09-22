import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { geaPlugin } from '../../src/index.ts'
import { RESOLVED_COMPILER_RUNTIME_ID } from '../../src/virtual-modules.ts'

// Regression for the "stale-hub" module-graph bug: a real, per-name census
// row of `binding-blocker: unresolved-binding-cell` traced to
// `virtual:gea-compiler-runtime` chasing a re-export the real
// compiler-runtime.ts barrel had already pruned.
//
// `virtual:gea-compiler-runtime`'s source used to be ONE
// `export { a, b, c, ... } from '<compiler-runtime.ts path>'` statement --
// every name re-exported from the barrel FILE itself, rather than from each
// name's own submodule (the way compiler-runtime.ts re-exports them). The
// module-graph plugin's dead-re-export pruning
// (`gea-vite-module-graph-plugin.mjs`'s `pruneDeadReExports`) removes one
// `export ... from '<target>'` statement at a time based on whether
// `<target>` survived Rollup's tree-shaking -- so collapsing every name onto
// one target (the barrel) made the whole block atomic: pruning could only
// ever keep-or-drop ALL of it, never a single dead name, because the barrel
// itself stays live as long as the app uses ANY one of its exports. Meanwhile
// the REAL barrel prunes per submodule correctly (each name/group has its own
// `export {...} from './runtime/x'` line pointing at its own file), so the
// virtual hub could keep re-exporting a name whose own submodule had already
// been dropped from the real barrel's snapshot -- exactly the "stale hub"
// mismatch this test locks down.
describe('virtual:gea-compiler-runtime re-export granularity', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('re-exports each name from its own submodule file, not from the barrel file itself', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gea-compiler-runtime-'))
    dirs.push(dir)
    const srcDir = path.join(dir, 'src')
    mkdirSync(srcDir, { recursive: true })

    const coreEntry = path.join(srcDir, 'index.ts')
    writeFileSync(coreEntry, 'export {}\n')

    const runtimePath = path.join(srcDir, 'compiler-runtime.ts')
    writeFileSync(
      runtimePath,
      [
        "export { usedThing } from './runtime/used-thing'",
        "export { unusedThing } from './runtime/unused-thing'",
        '',
      ].join('\n'),
    )

    const plugin = geaPlugin({}) as any
    const loadContext = {
      resolve: async () => ({ id: coreEntry }),
    }

    const source: string = await plugin.load.call(loadContext, RESOLVED_COMPILER_RUNTIME_ID)

    // Each name comes from its OWN submodule -- separate statements, each
    // pointing at the file compiler-runtime.ts itself points at (rewritten to
    // an absolute path, extension preserved exactly as compiler-runtime.ts's
    // own relative specifier -- extensionless here, same as the real file),
    // never at compiler-runtime.ts.
    const usedThingPath = path.join(srcDir, 'runtime', 'used-thing').replace(/\\/g, '/')
    const unusedThingPath = path.join(srcDir, 'runtime', 'unused-thing').replace(/\\/g, '/')

    assert.ok(
      source.includes(`export { usedThing } from ${JSON.stringify(usedThingPath)}`),
      `expected a per-submodule export line for usedThing, got:\n${source}`,
    )
    assert.ok(
      source.includes(`export { unusedThing } from ${JSON.stringify(unusedThingPath)}`),
      `expected a per-submodule export line for unusedThing, got:\n${source}`,
    )

    // The old behavior collapsed both names onto ONE `from` clause pointing
    // at the barrel file -- assert that shape is gone.
    const runtimePathNormalized = runtimePath.replace(/\\/g, '/')
    assert.ok(
      !source.includes(`from ${JSON.stringify(runtimePathNormalized)}`),
      `did not expect any re-export to point back at the barrel file itself, got:\n${source}`,
    )

    // Two independent re-export statements, one per submodule -- this is what
    // gives the module-graph plugin's dead-re-export pruning the granularity
    // to drop `unusedThing` alone when `./runtime/unused-thing` doesn't
    // survive tree-shaking, without also losing `usedThing`.
    const statementCount = (source.match(/\bfrom\b/g) ?? []).length
    assert.equal(statementCount, 2)
  })

  it('falls back to the single-statement form for a built .mjs runtime (no submodule files exist to preserve)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gea-compiler-runtime-dist-'))
    dirs.push(dir)
    const distDir = path.join(dir, 'dist')
    mkdirSync(distDir, { recursive: true })

    const coreEntry = path.join(distDir, 'index.mjs')
    writeFileSync(coreEntry, 'export {}\n')
    // A minified bundle has no per-submodule `export {...} from './x'` lines
    // left to parse -- the fallback below is what keeps this path working.
    writeFileSync(path.join(distDir, 'compiler-runtime.mjs'), 'export function mount(){}\n')

    const plugin = geaPlugin({}) as any
    const loadContext = {
      resolve: async () => ({ id: coreEntry }),
    }

    const source: string = await plugin.load.call(loadContext, RESOLVED_COMPILER_RUNTIME_ID)
    const runtimePathNormalized = path.join(distDir, 'compiler-runtime.mjs').replace(/\\/g, '/')
    assert.ok(
      source.includes(`} from ${JSON.stringify(runtimePathNormalized)}`),
      `expected the single-statement fallback pointing at the .mjs bundle, got:\n${source}`,
    )
  })
})
