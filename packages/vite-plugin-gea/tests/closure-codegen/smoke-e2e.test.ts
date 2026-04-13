/**
 * Smoke test: compile via transform, evaluate the output, render into jsdom,
 * assert DOM matches. This proves the full Phase-3 pipeline works end-to-end
 * for the simplest components.
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { transformFile } from '../../src/closure-codegen/transform.ts'
// Import the runtime directly so the test exercises the compiled component path.
import { Component } from '../../../gea/src/runtime/component.ts'
import { CompiledComponent } from '../../../gea/src/runtime/compiled-component.ts'
import { CompiledLeanReactiveComponent } from '../../../gea/src/runtime/compiled-lean-reactive-component.ts'
import { CompiledTinyReactiveComponent } from '../../../gea/src/runtime/compiled-tiny-reactive-component.ts'
import { CompiledReactiveComponent } from '../../../gea/src/runtime/compiled-reactive-component.ts'
import { CompiledStaticElementComponent } from '../../../gea/src/runtime/compiled-static-element-component.ts'
import { CompiledStaticComponent } from '../../../gea/src/runtime/compiled-static-component.ts'
import { GEA_STATIC_TEMPLATE } from '../../../gea/src/runtime/compiled-static-symbols.ts'
import { GEA_CREATE_TEMPLATE } from '../../../gea/src/runtime/symbols.ts'
import { scheduleAfterRenderAsync } from '../../../gea/src/runtime/after-render-async.ts'
import { reactiveText, reactiveTextValue } from '../../../gea/src/runtime/reactive-text.ts'
import { Store } from '../../../gea/src/store.ts'

const geaCore = {
  Component,
  CompiledComponent,
  CompiledLeanReactiveComponent,
  CompiledTinyReactiveComponent,
  CompiledReactiveComponent,
  CompiledStaticElementComponent,
  CompiledStaticComponent,
  GEA_STATIC_TEMPLATE,
  GEA_CREATE_TEMPLATE,
  scheduleAfterRenderAsync,
  reactiveText,
  reactiveTextValue,
  Store,
}

function setupDom() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>')
  ;(globalThis as any).window = dom.window
  ;(globalThis as any).document = dom.window.document
  ;(globalThis as any).HTMLElement = dom.window.HTMLElement
  ;(globalThis as any).Element = dom.window.Element
  ;(globalThis as any).Node = dom.window.Node
  ;(globalThis as any).Text = dom.window.Text
  ;(globalThis as any).Comment = dom.window.Comment
  ;(globalThis as any).DocumentFragment = dom.window.DocumentFragment
  ;(globalThis as any).queueMicrotask = queueMicrotask
  return dom
}

/**
 * Compile TSX via transform, strip typescript via esbuild, strip imports,
 * and evaluate as a function body against provided bindings.
 */
async function compileAndEval(source: string, bindings: Record<string, any>): Promise<any> {
  const { code } = transformFile(source)
  const esbuild = await import('esbuild')
  const stripped = await esbuild.transform(code, { loader: 'ts', target: 'esnext' })
  let js = stripped.code
  // Remove the @geajs/core import (we provide symbols as bindings), drop other imports
  js = js.replace(/import\s*\{([^}]+)\}\s*from\s*["']@geajs\/core["']\s*;?/g, '')
  js = js.replace(/^import\s.*;?\s*$/gm, '')
  // Capture default export: `export default class X` → expose X
  // esbuild transforms `export default class X` to `var stdin_default = X` style; rely on that.
  js = js.replace(/^export\s+default\s+class\s+(\w+)/gm, 'var __default = class $1')
  js = js.replace(/^export\s+class\s+(\w+)/gm, 'var $1 = class $1')
  js = js.replace(/^export\s+default\s+(\w+)\s*;?\s*$/gm, '__default = $1;')

  const paramNames = Object.keys(bindings)
  const paramValues = Object.values(bindings)
  const body =
    js + '\n; return (typeof __default !== "undefined" ? __default : (typeof App !== "undefined" ? App : undefined));'
  const fn = new Function(...paramNames, body)
  return fn(...paramValues)
}

describe('smoke-e2e: closure-codegen output against runtime', () => {
  before(() => setupDom())

  it('hello-world renders "Hello World" into #app', async () => {
    const src = `import { Component } from '@geajs/core'
export default class App extends Component {
  template() { return <div>Hello World</div> }
}`
    const AppClass = await compileAndEval(src, {
      Component: geaCore.Component,
      CompiledComponent: geaCore.CompiledComponent,
      CompiledStaticElementComponent: geaCore.CompiledStaticElementComponent,
      CompiledStaticComponent: geaCore.CompiledStaticComponent,
      GEA_STATIC_TEMPLATE: (geaCore as any).GEA_STATIC_TEMPLATE,
    })
    assert.ok(AppClass)
    const app = new AppClass()
    const parent = document.getElementById('app')!
    app.render(parent)
    assert.equal(parent.textContent, 'Hello World')
    app.dispose()
    assert.equal(parent.textContent, '')
  })

  it('counter renders reactively when store mutates', async () => {
    const src = `import { Component, Store } from '@geajs/core'
class CounterStore extends Store {
  count = 0
  increment() { this.count++ }
}
export default class Counter extends Component {
  store = new CounterStore()
  template() { return <div>Count: {this.store.count}</div> }
}`
    const Counter = await compileAndEval(src, {
      Component: geaCore.Component,
      Store: geaCore.Store,
      CompiledLeanReactiveComponent: geaCore.CompiledLeanReactiveComponent,
      CompiledTinyReactiveComponent: geaCore.CompiledTinyReactiveComponent,
      CompiledReactiveComponent: geaCore.CompiledReactiveComponent,
      GEA_CREATE_TEMPLATE: (geaCore as any).GEA_CREATE_TEMPLATE,
      reactiveText: (geaCore as any).reactiveText,
      reactiveTextValue: (geaCore as any).reactiveTextValue,
    })
    assert.ok(Counter)
    const c = new Counter()
    const parent = document.getElementById('app')!
    parent.innerHTML = ''
    c.render(parent)
    assert.match(parent.textContent!, /Count: 0/)
    c.store.increment()
    await new Promise((r) => queueMicrotask(() => r(null)))
    assert.match(parent.textContent!, /Count: 1/)
    c.dispose()
  })

  it('compiled output schedules onAfterRenderAsync when declared', async () => {
    const calls: string[] = []
    const src = `import { Component } from '@geajs/core'
declare const calls: string[]
export default class App extends Component {
  onAfterRenderAsync() { calls.push(this.el?.textContent ?? '') }
  template() { return <div>ready</div> }
}`
    const App = await compileAndEval(src, {
      Component: geaCore.Component,
      CompiledTinyReactiveComponent: geaCore.CompiledTinyReactiveComponent,
      GEA_CREATE_TEMPLATE: (geaCore as any).GEA_CREATE_TEMPLATE,
      scheduleAfterRenderAsync: geaCore.scheduleAfterRenderAsync,
      calls,
    })
    assert.ok(App)
    const app = new App()
    const parent = document.getElementById('app')!
    parent.innerHTML = ''
    app.render(parent)
    assert.deepEqual(calls, [])
    await new Promise((resolve) => queueMicrotask(() => resolve(null)))
    assert.deepEqual(calls, ['ready'])
    app.dispose()
  })
})
