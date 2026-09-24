import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom } from '../../../../tests/helpers/jsdom-setup'
import { CompiledStaticComponent } from '../../src/runtime/compiled-static-component'
import { CompiledStaticElementComponent } from '../../src/runtime/compiled-static-element-component'
import { GEA_STATIC_TEMPLATE } from '../../src/runtime/compiled-static-symbols'

let teardown: () => void

class Banner extends CompiledStaticComponent {
  [GEA_STATIC_TEMPLATE](): Node {
    const el = document.createElement('h1')
    el.textContent = 'banner'
    return el
  }
}

class Badge extends CompiledStaticElementComponent {
  [GEA_STATIC_TEMPLATE](): HTMLElement {
    const el = document.createElement('span')
    el.textContent = 'badge'
    return el
  }
}

function countCreated(instance: any): () => number {
  let calls = 0
  const original = Object.getPrototypeOf(instance).created
  Object.getPrototypeOf(instance).created = function (this: unknown, props?: unknown) {
    calls++
    return original.call(this, props)
  }
  return () => calls
}

describe('static component bases call created() on first render', () => {
  beforeEach(() => {
    teardown = installDom()
  })
  afterEach(() => teardown())

  for (const [name, Ctor] of [
    ['CompiledStaticComponent', Banner],
    ['CompiledStaticElementComponent', Badge],
  ] as const) {
    it(`${name}: created() runs once, before the template is mounted`, () => {
      const root = document.createElement('div')
      const instance = new Ctor()
      const calls = countCreated(instance)
      instance.render(root)
      assert.equal(calls(), 1)
      assert.equal(root.children.length, 1)
      instance.render(root)
      assert.equal(calls(), 1, 'a re-render must not call created() again')
    })
  }
})
