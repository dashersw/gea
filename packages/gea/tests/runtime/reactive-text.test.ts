/**
 * reactiveText — binds Text node content to a store path or getter.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Store } from '../../src/store'
import { createDisposer } from '../../src/runtime/disposer'
import { reactiveText } from '../../src/runtime/reactive-text'

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('reactiveText – static path', () => {
  it('initial render patches text from store', async () => {
    const s = new Store({ name: 'alice' }) as any
    const node = document.createTextNode('')
    const d = createDisposer()
    reactiveText(node, d, s, ['name'])
    await flush()
    assert.equal(node.nodeValue, 'alice')
  })
  it('updates text after store mutation', async () => {
    const s = new Store({ name: 'alice' }) as any
    const node = document.createTextNode('')
    const d = createDisposer()
    reactiveText(node, d, s, ['name'])
    await flush()
    s.name = 'bob'
    await flush()
    assert.equal(node.nodeValue, 'bob')
  })
  it('dispose removes subscription — further mutations ignored', async () => {
    const s = new Store({ name: 'alice' }) as any
    const node = document.createTextNode('')
    const d = createDisposer()
    reactiveText(node, d, s, ['name'])
    await flush()
    s.name = 'bob'
    await flush()
    d.dispose()
    s.name = 'carol'
    await flush()
    assert.equal(node.nodeValue, 'bob')
  })
})

describe('reactiveText – getter mode', () => {
  it('tracks getter deps and updates on change', async () => {
    const s = new Store({ first: 'jane', last: 'doe' }) as any
    const node = document.createTextNode('')
    const d = createDisposer()
    reactiveText(node, d, s, () => s.first + ' ' + s.last)
    assert.equal(node.nodeValue, 'jane doe')
    s.last = 'roe'
    await flush()
    assert.equal(node.nodeValue, 'jane roe')
  })
  it('dispose halts getter re-runs', async () => {
    const s = new Store({ v: 1 }) as any
    const node = document.createTextNode('')
    const d = createDisposer()
    reactiveText(node, d, s, () => String(s.v))
    s.v = 2
    await flush()
    assert.equal(node.nodeValue, '2')
    d.dispose()
    s.v = 3
    await flush()
    assert.equal(node.nodeValue, '2')
  })
})

describe('reactiveText – nodes a prop thunk read tagged', () => {
  const OWNER = Symbol.for('gea.jsx.owner')
  const READS = Symbol.for('gea.jsx.reads')

  // Tags a node as a prop thunk read does. `numbered: false` is the record an
  // older compiler makes, with no read number.
  function read(numbered: boolean): { node: Node; disposed: () => boolean } {
    const node = document.createElement('b')
    const d = createDisposer()
    let disposed = false
    d.add(() => (disposed = true))
    const rec: Record<string, unknown> = { d, nodes: [node] }
    if (numbered) {
      const g = globalThis as any
      rec.seq = g[READS] = (typeof g[READS] === 'number' ? g[READS] : 0) + 1
      rec.kept = false
    }
    ;(node as any)[OWNER] = rec
    return { node, disposed: () => disposed }
  }

  function slot(s: any, getter: () => unknown): void {
    const host = document.createElement('div')
    const anchor = document.createTextNode('')
    host.appendChild(anchor)
    reactiveText(anchor, createDisposer(), s, getter)
  }

  it('keeps a read made before the getter ran once the slot drops it', async () => {
    const s = new Store({ on: true }) as any
    const kept = read(true)
    slot(s, () => (s.on ? kept.node : 'none'))
    s.on = false
    await flush()
    assert.equal(kept.disposed(), false)
  })

  it('disposes a read the getter made once the slot drops it', async () => {
    const s = new Store({ on: true }) as any
    let fresh: ReturnType<typeof read> | null = null
    slot(s, () => (s.on ? (fresh = read(true)).node : 'none'))
    s.on = false
    await flush()
    assert.equal(fresh!.disposed(), true)
  })

  it('disposes a read with no number once the slot drops it, as before', async () => {
    const s = new Store({ on: true }) as any
    const old = read(false)
    slot(s, () => (s.on ? old.node : 'none'))
    s.on = false
    await flush()
    assert.equal(old.disposed(), true)
  })
})
