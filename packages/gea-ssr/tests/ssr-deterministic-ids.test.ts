import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { renderToString, resetSSRIds } from '../src/render.ts'
import getUid, { resetUidCounter } from '../../gea/src/component/uid.ts'
import type { GeaComponentInstance } from '../src/types.ts'

describe('resetUidCounter', () => {
  it('resets UID counter to a deterministic seed', () => {
    resetUidCounter(0)
    const id1 = getUid()
    const id2 = getUid()

    resetUidCounter(0)
    const id1Again = getUid()
    const id2Again = getUid()

    assert.equal(id1, id1Again, 'First UID after reset(0) should be identical')
    assert.equal(id2, id2Again, 'Second UID after reset(0) should be identical')
  })

  it('produces different IDs for different seeds', () => {
    resetUidCounter(0)
    const idSeed0 = getUid()

    resetUidCounter(100)
    const idSeed100 = getUid()

    assert.notEqual(idSeed0, idSeed100, 'Different seeds should produce different IDs')
  })
})

describe('SSR deterministic IDs', () => {
  it('exports resetSSRIds function', () => {
    assert.equal(typeof resetSSRIds, 'function', 'resetSSRIds should be exported from render.ts')
  })

  it('renderToString produces identical HTML across consecutive calls', () => {
    class ChildComp implements GeaComponentInstance {
      props: Record<string, unknown>
      id_: string
      constructor(props?: Record<string, unknown>) {
        this.props = props || {}
        this.id_ = getUid()
      }
      template() { return `<span id="${this.id_}">child</span>` }
      toString() { return this.template() }
    }

    class ParentApp implements GeaComponentInstance {
      props: Record<string, unknown>
      id_: string
      _child: ChildComp
      constructor(props?: Record<string, unknown>) {
        this.props = props || {}
        this.id_ = getUid()
        this._child = new ChildComp()
      }
      template() {
        return `<div id="${this.id_}">${this._child}</div>`
      }
    }

    const html1 = renderToString(ParentApp)
    const html2 = renderToString(ParentApp)

    assert.equal(html1, html2, 'Consecutive renderToString calls must produce identical HTML with same IDs')
    assert.ok(html1.includes('id="0"'), 'Root component should have deterministic ID 0')
    assert.ok(html1.includes('id="1"'), 'Child component should have deterministic ID 1')
  })

  it('renderToString resets IDs so server and client can match', () => {
    class SimpleApp implements GeaComponentInstance {
      props: Record<string, unknown>
      id_: string
      constructor(props?: Record<string, unknown>) {
        this.props = props || {}
        this.id_ = getUid()
      }
      template() { return `<div id="${this.id_}">app</div>` }
    }

    const serverHtml = renderToString(SimpleApp)

    // Simulate client hydration: reset to same seed, create same components
    resetUidCounter(0)
    const clientApp = new SimpleApp()

    // Extract ID from server HTML
    const serverIdMatch = serverHtml.match(/id="([^"]+)"/)
    assert.ok(serverIdMatch, 'Server HTML should contain an ID')
    assert.equal(clientApp.id_, serverIdMatch![1], 'Client component ID must match server-rendered ID')
  })
})
