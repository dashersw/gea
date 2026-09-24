import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import {
  buildEvalPrelude,
  compileJsxComponentForHmr,
  mergeEvalBindings,
  transformGeaSourceToEvalBodyForHmr,
} from '../helpers/compile'
import * as helperRuntime from '../helpers/gea-hmr-runtime'
import { HMR_RUNTIME_SOURCE } from '../../src/virtual-modules.ts'

import { CompiledStaticComponent } from '../../../gea/src/runtime/compiled-static-component'
import { GEA_STATIC_TEMPLATE } from '../../../gea/src/runtime/compiled-static-symbols'
import type { Disposer } from '../../../gea/src/runtime/disposer'

type AcceptCallback = (newModule: unknown) => void

// The shipped `virtual:gea-hmr` module, evaluated as-is (no Vite: import.meta.hot is undefined).
const hmrRuntime = await import(`data:text/javascript,${encodeURIComponent(HMR_RUNTIME_SOURCE)}`)

describe('HMR: static components patch in place', { concurrency: false }, () => {
  let restoreDom: () => void
  let prevHot: unknown
  let selfAccept: AcceptCallback | null
  let invalidations: number

  beforeEach(() => {
    restoreDom = installDom()
    selfAccept = null
    invalidations = 0
    prevHot = (globalThis as any).__geaHmrTestHot
    ;(globalThis as any).__geaHmrTestHot = {
      accept(...args: unknown[]) {
        if (args.length === 1 && typeof args[0] === 'function') selfAccept = args[0] as AcceptCallback
      },
      invalidate() {
        invalidations++
      },
    }
  })

  afterEach(() => {
    if (prevHot === undefined) delete (globalThis as any).__geaHmrTestHot
    else (globalThis as any).__geaHmrTestHot = prevHot
    restoreDom()
  })

  const staticSource = (label: string) => `
    import { Component } from '@geajs/core'
    export default class Banner extends Component {
      template() { return <h1 class="banner">${label}</h1> }
    }
  `

  const compile = (label: string) =>
    compileJsxComponentForHmr(
      staticSource(label),
      '/virtual/Banner.tsx',
      'file:///virtual/Banner.tsx',
      'Banner',
      {},
      hmrRuntime,
    )

  it('re-renders a mounted static component without invalidating and keeps its place among siblings', async () => {
    const Banner = await compile('v1')
    const accept = selfAccept!
    assert.ok(selfAccept, 'module should self-accept')

    const root = document.createElement('div')
    document.body.appendChild(root)
    root.appendChild(document.createElement('header'))
    const banner = new Banner()
    banner.render(root)
    root.appendChild(document.createElement('footer'))
    await flushMicrotasks()
    assert.equal(root.querySelector('.banner')?.textContent, 'v1')

    const BannerV2 = await compile('v2')
    accept({ default: BannerV2 })
    await flushMicrotasks()

    assert.equal(invalidations, 0, 'a patched static component must not fall back to a reload')
    assert.equal(root.querySelector('.banner')?.textContent, 'v2', 'the hoisted template must not be stale')
    assert.deepEqual(
      Array.from(root.children).map((el) => el.tagName.toLowerCase()),
      ['header', 'h1', 'footer'],
      'the re-rendered element must keep its position',
    )
    assert.equal(banner.el, root.children[1], 'the instance must track the new element')
    const BannerV3 = await compile('v3')
    accept({ default: BannerV3 })
    assert.equal(invalidations, 0)
    assert.equal(banner.el, root.children[1])
    assert.equal(banner.el?.textContent, 'v3')
    banner.dispose()
    assert.deepEqual(
      Array.from(root.children).map((el) => el.tagName.toLowerCase()),
      ['header', 'footer'],
    )
  })

  for (const [runtimeName, runtime] of [
    ['shipped', hmrRuntime],
    ['helper', helperRuntime],
  ] as const) {
    for (const relocation of ['detach', 'reparent'] as const) {
      it(`${runtimeName}: tolerates a sibling that render hooks ${relocation}`, async (t) => {
        const root = document.createElement('div')
        const otherParent = document.createElement('div')
        document.body.append(root, otherParent)
        const anchor = document.createElement('aside')
        const tail = document.createElement('footer')
        let relocate = false
        const compileVersion = (label: string) =>
          compileJsxComponentForHmr(
            `import { Component } from '@geajs/core'
           export default class Banner extends Component {
             template() { return <h1>${label}</h1> }
             onAfterRender() { relocateSibling() }
           }`,
            '/virtual/Banner.tsx',
            'file:///virtual/Banner.tsx',
            'Banner',
            {
              relocateSibling() {
                if (!relocate) return
                if (relocation === 'detach') anchor.remove()
                else otherParent.append(anchor)
              },
            },
            runtime,
          )
        const Before = await compileVersion('before')
        const instance = new Before()
        instance.render(root)
        root.append(anchor, tail)
        const After = await compileVersion('after')
        const errors = t.mock.method(console, 'error', () => {})
        relocate = true
        try {
          assert.equal(runtime.handleComponentUpdate('file:///virtual/Banner.tsx', { default: After }), true)
          assert.equal(errors.mock.callCount(), 0, 'HMR must not throw on a stale sibling anchor')
          assert.deepEqual(Array.from(root.children), [tail, instance.el])
          assert.equal(instance.el.textContent, 'after')
          assert.equal(anchor.parentNode, relocation === 'detach' ? null : otherParent)
        } finally {
          instance.dispose()
        }
      })
    }
  }

  it('disposes static-template callbacks and clears its root before each hot render', () => {
    const root = document.createElement('div')
    document.body.append(root)
    const calls: string[] = []
    const disposed: string[] = []
    const rootsAtRender: Array<HTMLElement | null> = []
    const version = (label: string) =>
      class StaticCleanupProbe extends CompiledStaticComponent {
        [GEA_STATIC_TEMPLATE](disposer: Disposer): Node {
          rootsAtRender.push(this.el)
          const listener = () => calls.push(label)
          document.addEventListener('hmr-probe', listener)
          disposer.add(() => {
            document.removeEventListener('hmr-probe', listener)
            disposed.push(label)
          })
          const element = document.createElement('h1')
          element.textContent = label
          return element
        }
      }
    const Before = version('before')
    const instance = new Before()
    instance.render(root)
    const oldRoot = instance.el!
    hmrRuntime.registerComponentInstance('StaticCleanupProbe', instance)
    try {
      for (const label of ['after', 'final']) {
        assert.equal(
          hmrRuntime.handleComponentUpdate('file:///virtual/static-cleanup.ts', { default: version(label) }),
          true,
        )
        document.dispatchEvent(new Event('hmr-probe'))
        assert.equal(root.textContent, label)
      }
      assert.deepEqual(calls, ['after', 'final'], 'only the current template callback should remain active')
      assert.deepEqual(disposed, ['before', 'after'])
      assert.deepEqual(rootsAtRender, [null, null, null], 'base disposal must clear the old root before rendering')
      assert.equal(oldRoot.isConnected, false)
    } finally {
      instance.dispose()
      hmrRuntime.unregisterComponentInstance('StaticCleanupProbe', instance)
    }
    assert.deepEqual(disposed, ['before', 'after', 'final'])
    document.dispatchEvent(new Event('hmr-probe'))
    assert.deepEqual(calls, ['after', 'final'])
    assert.equal(root.childNodes.length, 0)
  })

  for (const [runtimeName, runtime] of [
    ['shipped', hmrRuntime],
    ['helper', helperRuntime],
  ] as const) {
    it(`${runtimeName}: replaces every fragment root node and preserves surrounding siblings`, () => {
      const root = document.createElement('div')
      document.body.append(root)
      const header = document.createElement('header')
      const footer = document.createElement('footer')
      root.append(header)
      const version = (label: string) =>
        class StaticFragmentProbe extends CompiledStaticComponent {
          [GEA_STATIC_TEMPLATE](): Node {
            const fragment = document.createDocumentFragment()
            const heading = document.createElement('h1')
            heading.textContent = label
            const span = document.createElement('span')
            span.textContent = 'tail'
            fragment.append(document.createTextNode('start'), heading, span, document.createComment(label))
            return fragment
          }
        }
      const Before = version('before')
      const instance = new Before()
      instance.render(root)
      root.append(footer)
      runtime.registerComponentInstance('StaticFragmentProbe', instance)
      try {
        for (const label of ['after', 'final']) {
          const oldNodes = Array.from(root.childNodes).slice(1, -1)
          assert.equal(runtime.handleComponentUpdate('file:///virtual/fragment.ts', { default: version(label) }), true)
          assert.equal(root.childNodes.length, 6)
          assert.equal(root.firstChild, header)
          assert.equal(root.lastChild, footer)
          assert.equal(root.textContent, `start${label}tail`)
          assert.equal(root.childNodes[4].nodeType, 8)
          assert.equal(root.childNodes[4].textContent, label)
          assert.equal(instance.el, root.childNodes[3])
          assert.ok(oldNodes.every((node) => node.parentNode === null))
        }
      } finally {
        instance.dispose()
        runtime.unregisterComponentInstance('StaticFragmentProbe', instance)
      }
      assert.deepEqual(Array.from(root.childNodes), [header, footer])
      assert.equal(instance.el, null)
    })
  }

  const variants = {
    static: 'template() { return <h1>static</h1> }',
    fragment: 'template() { return <><h1>fragment</h1><span>tail</span></> }',
    props: 'template() { return <h1>{this.props.label || "props"}</h1> }',
    state: 'count = 1; template() { return <h1>{this.count}</h1> }',
  }
  const source = (body: string) => `import { Component } from '@geajs/core'
    export default class Banner extends Component { ${body} }`
  const compileBody = (body: string) =>
    compileJsxComponentForHmr(
      source(body),
      '/virtual/Banner.tsx',
      'file:///virtual/Banner.tsx',
      'Banner',
      {},
      hmrRuntime,
    )

  it('patches a compiled fragment to another fragment without invalidating', async () => {
    const Before = await compileBody(variants.fragment)
    const accept = selfAccept!
    const root = document.createElement('div')
    document.body.append(root)
    const instance = new Before()
    instance.render(root)
    const oldRoot = instance.el
    const After = await compileBody('template() { return <><h2>updated</h2><p>fragment</p></> }')
    accept({ default: After })
    assert.equal(invalidations, 0)
    assert.equal(root.textContent, 'updatedfragment')
    assert.equal(root.querySelectorAll('h2, p').length, 2)
    assert.equal(oldRoot.isConnected, false)
    instance.dispose()
    assert.equal(root.childNodes.length, 0)
  })

  for (const [from, to] of [
    ['static', 'props'],
    ['static', 'state'],
    ['props', 'static'],
    ['state', 'static'],
    ['static', 'fragment'],
    ['fragment', 'static'],
  ] as const) {
    it(`invalidates ${from} → ${to} without mutating mounted instances`, async () => {
      const Before = await compileBody(variants[from])
      const accept = selfAccept!
      const root = document.createElement('div')
      document.body.append(root)
      const instances = [new Before(), new Before()]
      for (const instance of instances) instance.render(root)
      const nodes = Array.from(root.childNodes)
      const proto = Object.getPrototypeOf(instances[0])
      const disposeDescriptors = instances.map((instance) => Object.getOwnPropertyDescriptor(instance, 'dispose'))
      const After = await compileBody(variants[to])
      assert.notEqual(Object.getPrototypeOf(proto), Object.getPrototypeOf(After.prototype))

      assert.equal(hmrRuntime.handleComponentUpdate('file:///virtual/Banner.tsx', { default: After }), null)
      accept({ default: After })
      assert.equal(invalidations, 1)
      assert.deepEqual(Array.from(root.childNodes), nodes)
      for (const [i, instance] of instances.entries()) {
        assert.equal(Object.getPrototypeOf(instance), proto)
        assert.deepEqual(Object.getOwnPropertyDescriptor(instance, 'dispose'), disposeDescriptors[i])
        assert.equal(instance.el, nodes[i])
        assert.doesNotThrow(() => instance.dispose())
      }
      assert.equal(root.childNodes.length, 0)
    })
  }

  it('tears down compiled subscriptions before re-rendering a stateful component', async () => {
    const body = (label: string) => `count = 1; template() { return <h1>${label}: {this.count}</h1> }`
    const Before = await compileBody(body('before'))
    const accept = selfAccept!
    const root = document.createElement('div')
    document.body.append(root)
    const instance = new Before()
    instance.render(root)
    const detached = root.firstElementChild!
    const After = await compileBody(body('after'))
    accept({ default: After })
    instance.count++
    await flushMicrotasks()
    assert.equal(root.textContent, 'after: 2')
    assert.equal(detached.textContent, 'before: 1', 'old DOM must not remain subscribed')
    assert.equal(invalidations, 0)
    instance.dispose()
  })

  async function compileMulti(body: string, label: string) {
    const bindings = mergeEvalBindings({})
    const code = await transformGeaSourceToEvalBodyForHmr(
      source(body) +
        `
export class Other extends Component {
        template() { return <aside>${label}</aside> }
      }`,
      '/virtual/Banner.tsx',
      'file:///virtual/Banner.tsx',
    )
    return new Function(
      ...Object.keys(bindings),
      '__geaHmrBindings',
      buildEvalPrelude() + code + '\nreturn { default: Banner, Other };',
    )(...Object.values(bindings), hmrRuntime)
  }

  for (const incompatible of [true, false]) {
    it(
      incompatible
        ? 'invalidates when another exported class patches successfully'
        : 'patches a mounted export when another export has no instances',
      async () => {
        const before = await compileMulti(variants.static, 'v1')
        const accept = selfAccept!
        const root = document.createElement('div')
        document.body.append(root)
        const banner = incompatible ? new before.default() : null
        banner?.render(root)
        const originalEl = banner?.el
        const other = new before.Other()
        other.render(root)
        const after = await compileMulti(variants.props, 'v2')
        accept(after)
        assert.equal(invalidations, incompatible ? 1 : 0)
        assert.equal(root.querySelector('aside')?.textContent, 'v2')
        if (banner) {
          assert.equal(banner.el, originalEl)
          assert.equal(Object.getPrototypeOf(banner), before.default.prototype)
          assert.doesNotThrow(() => banner.dispose())
        }
        other.dispose()
        assert.equal(root.childNodes.length, 0)
      },
    )
  }
})
