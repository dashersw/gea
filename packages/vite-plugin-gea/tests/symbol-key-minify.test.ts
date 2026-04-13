import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { geaPlugin } from '../src/index.ts'
import { minifyGeaSymbolForKeys } from '../src/symbol-key-minify.ts'

function renderChunkWithConfig(config: any, code: string): string {
  const plugin = geaPlugin() as any
  plugin.configResolved(config)
  const result = plugin.renderChunk(code)
  return result?.code ?? code
}

describe('symbol-key minifier', () => {
  it('shortens whitelisted Gea Symbol.for registry keys', () => {
    const out = minifyGeaSymbolForKeys(
      [
        `const el = Symbol.for("gea.element")`,
        `const comp = Symbol.for('gea.dom.component')`,
        'const tpl = Symbol.for(`gea.component.createTemplate`)',
      ].join('\n'),
    )

    assert.match(out, /Symbol\.for\("0"\)/)
    assert.match(out, /Symbol\.for\('1'\)/)
    assert.match(out, /Symbol\.for\(`2`\)/)
    assert.doesNotMatch(out, /gea\.element|gea\.dom\.component|gea\.component\.createTemplate/)
  })

  it('leaves non-call string content untouched', () => {
    const out = minifyGeaSymbolForKeys(`console.log("gea.element", Symbol.keyFor(sym))`)
    assert.equal(out, `console.log("gea.element", Symbol.keyFor(sym))`)
  })

  it('runs for app builds and self-contained browser lib builds', () => {
    const code = `const c = Symbol.for("gea.dom.component")`

    assert.equal(renderChunkWithConfig({ command: 'build', build: { ssr: false } }, code), `const c = Symbol.for("1")`)
    assert.equal(
      renderChunkWithConfig({ command: 'build', build: { ssr: false, lib: { formats: ['iife'] } } }, code),
      `const c = Symbol.for("1")`,
    )
  })

  it('skips SSR and non-browser library builds', () => {
    const code = `const c = Symbol.for("gea.dom.component")`

    assert.equal(renderChunkWithConfig({ command: 'build', build: { ssr: true } }, code), code)
    assert.equal(
      renderChunkWithConfig({ command: 'build', build: { ssr: false, lib: { formats: ['es'] } } }, code),
      code,
    )
  })
})
