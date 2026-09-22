import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponentForHmr, loadRuntimeModules } from '../helpers/compile'
import * as hmrBindings from '../helpers/gea-hmr-runtime'

type AcceptCallback = (newModule: unknown) => void

describe('HMR: unpatchable self-accept falls back to invalidate', { concurrency: false }, () => {
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

  const reactiveSource = (label: string) => `
    import { Component } from '@geajs/core'
    export default class Counter extends Component {
      count = 0
      template() {
        return (
          <div>
            <h1 class="title">${label}</h1>
            <span class="count">{this.count}</span>
          </div>
        )
      }
    }
  `

  it('invalidates when a mounted static component registers no instance', async () => {
    const url = 'file:///virtual/Banner.tsx'
    const Banner = await compileJsxComponentForHmr(
      staticSource('v1'),
      '/virtual/Banner.tsx',
      url,
      'Banner',
      {},
      hmrBindings,
    )
    assert.ok(selfAccept, 'module should self-accept')

    const root = document.createElement('div')
    document.body.appendChild(root)
    const banner = new Banner()
    banner.render(root)
    await flushMicrotasks()
    assert.equal(root.querySelector('.banner')?.textContent, 'v1')

    const BannerV2 = await compileJsxComponentForHmr(
      staticSource('v2'),
      '/virtual/Banner.tsx',
      url,
      'Banner',
      {},
      hmrBindings,
    )
    assert.equal(
      hmrBindings.handleComponentUpdate(url, { default: BannerV2 }),
      false,
      'a static component has no registered instance to patch',
    )

    selfAccept!({ default: BannerV2 })
    assert.equal(invalidations, 1, 'the unpatchable update must be handed back to Vite')
    banner.dispose()
  })

  it('does not invalidate when a live instance is patched, and renders the new template', async () => {
    const seed = `hmr-invalidate-${Date.now()}`
    await loadRuntimeModules(seed)
    const url = 'file:///virtual/Counter.tsx'
    const Counter = await compileJsxComponentForHmr(
      reactiveSource('v1'),
      '/virtual/Counter.tsx',
      url,
      'Counter',
      {},
      hmrBindings,
    )
    const firstAccept = selfAccept
    assert.ok(firstAccept, 'module should self-accept')

    const root = document.createElement('div')
    document.body.appendChild(root)
    const counter = new Counter()
    counter.render(root)
    await flushMicrotasks()
    counter.count = 4
    await flushMicrotasks()
    assert.equal(root.querySelector('.title')?.textContent, 'v1')
    assert.equal(root.querySelector('.count')?.textContent, '4')

    const CounterV2 = await compileJsxComponentForHmr(
      reactiveSource('v2'),
      '/virtual/Counter.tsx',
      url,
      'Counter',
      {},
      hmrBindings,
    )

    firstAccept!({ default: CounterV2 })
    await flushMicrotasks()

    assert.equal(invalidations, 0, 'a patched module must not fall back to a reload')
    assert.equal(root.querySelector('.title')?.textContent, 'v2', 'the hoisted template must not be stale')
    assert.equal(root.querySelector('.count')?.textContent, '4', 'component state survives the patch')
    counter.dispose()
  })
})
