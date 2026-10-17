import assert from 'node:assert/strict'
import { it } from 'node:test'
import { HMR_RUNTIME_SOURCE } from '../../packages/vite-plugin-gea/src/virtual-modules.ts'

const runtime = await import(`data:text/javascript,${encodeURIComponent(HMR_RUNTIME_SOURCE)}`)

it('patches only the Foo instances registered to the updated module', () => {
  const version = (label: string) =>
    class Foo {
      label() {
        return label
      }
    }
  const componentUrl = 'http://localhost:5173/src/components/Foo.tsx'
  const viewUrl = 'http://localhost:5173/src/views/Foo.tsx'
  const component = new (version('component'))()
  const view = new (version('view'))()
  runtime.registerComponentInstance(componentUrl, 'Foo', component)
  runtime.registerComponentInstance(viewUrl, 'Foo', view)
  const componentPrototype = Object.getPrototypeOf(component)
  try {
    const updatedView = version('updated view')
    assert.equal(runtime.handleComponentUpdate(viewUrl, { default: updatedView }), true)
    assert.equal(view.label(), 'updated view')
    assert.equal(Object.getPrototypeOf(view), updatedView.prototype)
    assert.equal(component.label(), 'component')
    assert.equal(Object.getPrototypeOf(component), componentPrototype)

    runtime.unregisterComponentInstance(viewUrl, 'Foo', view)
    assert.equal(runtime.handleComponentUpdate(viewUrl, { default: version('unused') }), false)
    assert.equal(runtime.handleComponentUpdate(componentUrl, { default: version('updated component') }), true)
    assert.equal(component.label(), 'updated component')
  } finally {
    runtime.unregisterComponentInstance(componentUrl, 'Foo', component)
    runtime.unregisterComponentInstance(viewUrl, 'Foo', view)
  }
})

it('keeps classes in the same module separate and normalizes save timestamps for registration and disposal', () => {
  const moduleUrl = 'http://localhost:5173/src/Foo.tsx'
  const version = (label: string) =>
    class Foo {
      label() {
        return label
      }
    }
  class Bar {
    label() {
      return 'bar'
    }
  }
  const foo = new (version('before'))()
  const bar = new Bar()
  runtime.registerComponentInstance(`${moduleUrl}?t=1#old`, 'Foo', foo)
  runtime.registerComponentInstance(moduleUrl, 'Bar', bar)
  try {
    for (const timestamp of [2, 3]) {
      assert.equal(runtime.handleComponentUpdate(`${moduleUrl}?t=${timestamp}`, { default: version('after') }), true)
      assert.equal(foo.label(), 'after')
      assert.equal(bar.label(), 'bar')
      assert.equal(Object.getPrototypeOf(bar), Bar.prototype)
    }
    runtime.unregisterComponentInstance(`${moduleUrl}?t=4#new`, 'Foo', foo)
    assert.equal(runtime.handleComponentUpdate(moduleUrl, { default: version('unused') }), false)
    assert.equal(runtime.handleComponentUpdate(moduleUrl, { default: Bar }), true)
  } finally {
    runtime.unregisterComponentInstance(moduleUrl, 'Foo', foo)
    runtime.unregisterComponentInstance(moduleUrl, 'Bar', bar)
  }
})
