import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Component, GEA_CREATE_TEMPLATE } from '@geajs/core'
import { renderToString, resetSSRIds } from '../src/render.ts'
import { resetUidCounter } from '../../gea/src/uid.ts'
import getUid from '../../gea/src/uid.ts'

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
    class SimpleApp extends Component {
      [GEA_CREATE_TEMPLATE](): Node {
        const d = document.createElement('div')
        d.id = this.id
        d.textContent = 'app'
        return d
      }
    }

    const html1 = renderToString(SimpleApp as any)
    const html2 = renderToString(SimpleApp as any)

    assert.equal(html1, html2, 'Consecutive renderToString calls must produce identical HTML with same IDs')
    assert.ok(html1.includes('id="0"'), 'Root component should have deterministic ID 0')
  })

  it('renderToString resets IDs so server and client can match', () => {
    class SimpleApp extends Component {
      [GEA_CREATE_TEMPLATE](): Node {
        const d = document.createElement('div')
        d.id = this.id
        d.textContent = 'app'
        return d
      }
    }

    const serverHtml = renderToString(SimpleApp as any)

    // Simulate client hydration: reset to same seed, create same components
    resetUidCounter(0)
    const clientApp: any = new SimpleApp()

    // Extract ID from server HTML
    const serverIdMatch = serverHtml.match(/id="([^"]+)"/)
    assert.ok(serverIdMatch, 'Server HTML should contain an ID')
    assert.equal(clientApp.id, serverIdMatch![1], 'Client component ID must match server-rendered ID')
  })
})
