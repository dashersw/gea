import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { installDom } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponentForHmr } from '../helpers/compile'
import { HMR_RUNTIME_SOURCE } from '../../src/virtual-modules.ts'

const runtime = await import(`data:text/javascript,${encodeURIComponent(HMR_RUNTIME_SOURCE)}`)
type AcceptCallback = (module: Record<string, unknown>) => void

describe('HMR scopes same-named components to their modules (#244)', { concurrency: false }, () => {
  let restoreDom: () => void
  let previousHot: unknown
  let selfAccept: AcceptCallback
  let invalidations: number

  beforeEach(() => {
    restoreDom = installDom()
    invalidations = 0
    previousHot = (globalThis as any).__geaHmrTestHot
    ;(globalThis as any).__geaHmrTestHot = {
      accept(callback: AcceptCallback) {
        selfAccept = callback
      },
      invalidate() {
        invalidations++
      },
    }
  })

  afterEach(() => {
    if (previousHot === undefined) delete (globalThis as any).__geaHmrTestHot
    else (globalThis as any).__geaHmrTestHot = previousHot
    restoreDom()
  })

  for (const exportKind of ['default', 'named'] as const) {
    const exportsFor = (Foo: unknown) => (exportKind === 'default' ? { default: Foo } : { Foo })
    const compile = async (path: string, label: string, timestamp: number) => {
      const Foo = await compileJsxComponentForHmr(
        `import { Component } from '@geajs/core'
         export ${exportKind === 'default' ? 'default ' : ''}class Foo extends Component {
           count = 1
           label() { return '${label}' }
           template() { return <h1>${label}: {this.count}</h1> }
         }`,
        path,
        `file://${path}?t=${timestamp}`,
        'Foo',
        {},
        runtime,
      )
      return { Foo, accept: selfAccept }
    }

    it(`${exportKind} export leaves the mounted Foo untouched when the other module updates`, async () => {
      const component = await compile('/src/components/Foo.tsx', 'component', 1)
      const view = await compile('/src/views/Foo.tsx', 'view', 1)
      assert.equal(component.Foo.name, view.Foo.name)
      assert.notEqual(component.Foo, view.Foo)

      const root = document.createElement('div')
      document.body.append(root)
      const instance = new component.Foo()
      instance.render(root)
      const element = instance.el
      const prototype = Object.getPrototypeOf(instance)
      const labelDescriptor = Object.getOwnPropertyDescriptor(instance, 'label')
      try {
        const updatedView = await compile('/src/views/Foo.tsx', 'updated view', 2)
        view.accept(exportsFor(updatedView.Foo))

        assert.equal(instance.el, element)
        assert.equal(root.textContent, 'component: 1')
        assert.equal(Object.getPrototypeOf(instance), prototype)
        assert.deepEqual(Object.getOwnPropertyDescriptor(instance, 'label'), labelDescriptor)
        assert.equal(instance.label(), 'component')
        assert.equal(invalidations, 1, 'an update with no instances keeps the existing invalidation fallback')
      } finally {
        instance.dispose()
      }
    })

    it(`${exportKind} export still patches its own instances across repeated saves`, async () => {
      const component = await compile('/src/components/Foo.tsx', 'before', 1)
      await compile('/src/views/Foo.tsx', 'view', 1)
      const root = document.createElement('div')
      document.body.append(root)
      const instance = new component.Foo()
      instance.render(root)
      instance.count = 7
      try {
        for (const [timestamp, label] of [
          [2, 'after'],
          [3, 'final'],
        ] as const) {
          const updated = await compile('/src/components/Foo.tsx', label, timestamp)
          component.accept(exportsFor(updated.Foo))

          assert.equal(Object.getPrototypeOf(instance), updated.Foo.prototype)
          assert.equal(instance.label(), label)
          assert.equal(root.textContent, `${label}: 7`)
          assert.equal(instance.count, 7)
          assert.equal(invalidations, 0)
        }
      } finally {
        instance.dispose()
      }
      assert.equal(root.childNodes.length, 0)
      assert.equal(
        runtime.handleComponentUpdate('file:///src/components/Foo.tsx?t=4', { default: component.Foo }),
        false,
      )
    })
  }
})
