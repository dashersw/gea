import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { flushMicrotasks, installDom } from '../../../tests/helpers/jsdom-setup'

describe('runtime-only browser entry', () => {
  let restoreDom: () => void

  beforeEach(() => {
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('exports the browser surface and supports runtime-only updates', async () => {
    const seed = `rt-browser-${Date.now()}-${Math.random()}`
    const gea = await import(`../src/runtime-only-browser?${seed}`)

    assert.ok(gea.Component)
    assert.ok(gea.Store)
    assert.ok(gea.h)
    assert.ok(gea.default)
    assert.equal(gea.default.Component, gea.Component)
    assert.equal(gea.default.Store, gea.Store)
    assert.equal(gea.default.h, gea.h)
    assert.equal(typeof gea.GEA_OBSERVER_REMOVERS, 'symbol')

    class CounterStore extends gea.Store {
      count = 0

      inc() {
        this.count++
      }
    }

    const store = new CounterStore()

    class CounterApp extends gea.Component {
      template() {
        return gea.h(
          'div',
          { class: 'runtime-only-app' },
          gea.h('button', { class: 'inc-btn', type: 'button' }, 'Increment'),
          gea.h('span', { class: 'count' }, String(store.count)),
        )
      }

      createdHooks() {
        this[gea.GEA_OBSERVER_REMOVERS].push(
          store.observe('count', () => {
            this.$('.count')!.textContent = String(store.count)
          }),
        )
      }

      get events() {
        return {
          click: {
            '.inc-btn': () => store.inc(),
          },
        }
      }
    }

    const root = document.createElement('div')
    document.body.appendChild(root)

    const app = new CounterApp()
    app.render(root)

    assert.equal(root.querySelector('.count')?.textContent, '0')
    assert.match(app.toString(), /runtime-only-app/)

    root.querySelector('.inc-btn')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushMicrotasks()
    assert.equal(root.querySelector('.count')?.textContent, '1')

    app.dispose()
    await flushMicrotasks()
    assert.equal(root.children.length, 0)
  })
})
