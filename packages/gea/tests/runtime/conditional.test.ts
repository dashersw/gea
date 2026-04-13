/**
 * Unit tests for runtime/conditional.ts.
 *
 * Covers: initial render picks correct branch; toggle true→false and back;
 * missing `mkFalse` uses a placeholder comment; dispose removes the live
 * branch and tears down its child disposer; nested DocumentFragment return
 * is unmounted cleanly.
 */

import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom } from '../../../../tests/helpers/jsdom-setup'
import { Store } from '../../src/store'
import { createDisposer } from '../../src/runtime/disposer'
import { trackPath } from '../../src/runtime/with-tracking'
import { conditional } from '../../src/runtime/conditional'

let teardown: () => void

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0))
}

describe('conditional', () => {
  beforeEach(() => {
    teardown = installDom()
  })
  afterEach(() => {
    teardown()
  })

  it('initial render picks the true branch when cond() is true', () => {
    const store = new Store({ on: true }) as any
    const parent = document.createElement('div')
    const anchor = document.createComment('')
    parent.appendChild(anchor)
    const disposer = createDisposer()

    conditional(
      parent,
      anchor,
      disposer,
      store,
      () => {
        trackPath(['on'])
        return store.on
      },
      () => document.createTextNode('T'),
      () => document.createTextNode('F'),
    )

    assert.equal(parent.textContent, 'T')
  })

  it('initial render picks the false branch when cond() is false', () => {
    const store = new Store({ on: false }) as any
    const parent = document.createElement('div')
    const anchor = document.createComment('')
    parent.appendChild(anchor)
    const disposer = createDisposer()

    conditional(
      parent,
      anchor,
      disposer,
      store,
      () => {
        trackPath(['on'])
        return store.on
      },
      () => document.createTextNode('T'),
      () => document.createTextNode('F'),
    )

    assert.equal(parent.textContent, 'F')
  })

  it('toggles true→false→true and swaps branches on each change', async () => {
    const store = new Store({ on: true }) as any
    const parent = document.createElement('div')
    const anchor = document.createComment('')
    parent.appendChild(anchor)
    const disposer = createDisposer()

    conditional(
      parent,
      anchor,
      disposer,
      store,
      () => {
        trackPath(['on'])
        return store.on
      },
      () => document.createTextNode('T'),
      () => document.createTextNode('F'),
    )

    assert.equal(parent.textContent, 'T')
    store.on = false
    await flush()
    assert.equal(parent.textContent, 'F')
    store.on = true
    await flush()
    assert.equal(parent.textContent, 'T')
  })

  it('does not remount when the condition value is unchanged', async () => {
    const store = new Store({ count: 1 }) as any
    const parent = document.createElement('div')
    const anchor = document.createComment('')
    parent.appendChild(anchor)
    const disposer = createDisposer()
    let trueMounts = 0

    conditional(
      parent,
      anchor,
      disposer,
      store,
      () => {
        trackPath(['count'])
        return store.count > 0
      },
      () => {
        trueMounts++
        return document.createTextNode('T')
      },
      () => document.createTextNode('F'),
    )

    store.count = 2
    await flush()

    assert.equal(parent.textContent, 'T')
    assert.equal(trueMounts, 1)
  })

  it('uses a placeholder comment when mkFalse is omitted', () => {
    const store = new Store({ on: false }) as any
    const parent = document.createElement('div')
    const anchor = document.createComment('anchor')
    parent.appendChild(anchor)
    const disposer = createDisposer()

    conditional(
      parent,
      anchor,
      disposer,
      store,
      () => {
        trackPath(['on'])
        return store.on
      },
      () => document.createTextNode('T'),
    )

    // No text content rendered; parent has placeholder comment + anchor.
    assert.equal(parent.textContent, '')
    // Two comment nodes: placeholder, anchor.
    const comments = Array.from(parent.childNodes).filter((n) => n.nodeType === 8)
    assert.equal(comments.length, 2)
  })

  it('removes an empty false placeholder before mounting the true branch', async () => {
    const store = new Store({ on: false }) as any
    const parent = document.createElement('div')
    const anchor = document.createComment('anchor')
    parent.appendChild(anchor)
    const disposer = createDisposer()

    conditional(
      parent,
      anchor,
      disposer,
      store,
      () => {
        trackPath(['on'])
        return store.on
      },
      () => document.createTextNode('T'),
    )
    const before = parent.childNodes.length

    store.on = true
    await flush()

    assert.equal(before, 2, 'false branch starts as placeholder + sentinel')
    assert.equal(parent.textContent, 'T')
    assert.equal(Array.from(parent.childNodes).filter((node) => node.nodeType === 8).length, 1)
  })

  it('disposer removes the current branch and tears down its child scope', async () => {
    const store = new Store({ on: true }) as any
    const parent = document.createElement('div')
    const anchor = document.createComment('')
    parent.appendChild(anchor)
    const disposer = createDisposer()

    let branchDisposed = 0
    conditional(
      parent,
      anchor,
      disposer,
      store,
      () => {
        trackPath(['on'])
        return store.on
      },
      (d) => {
        d.add(() => {
          branchDisposed++
        })
        return document.createTextNode('T')
      },
      () => document.createTextNode('F'),
    )

    assert.equal(parent.textContent, 'T')
    disposer.dispose()
    assert.equal(branchDisposed, 1)
    // After dispose, branch and sentinel are both removed.
    assert.equal(parent.textContent, '')
    assert.equal(parent.childNodes.length, 0)
  })

  it('disposes the old branch child scope when swapping', async () => {
    const store = new Store({ on: true }) as any
    const parent = document.createElement('div')
    const anchor = document.createComment('')
    parent.appendChild(anchor)
    const disposer = createDisposer()

    let trueDisposed = 0
    let falseDisposed = 0
    conditional(
      parent,
      anchor,
      disposer,
      store,
      () => {
        trackPath(['on'])
        return store.on
      },
      (d) => {
        d.add(() => {
          trueDisposed++
        })
        return document.createTextNode('T')
      },
      (d) => {
        d.add(() => {
          falseDisposed++
        })
        return document.createTextNode('F')
      },
    )

    assert.equal(trueDisposed, 0)
    store.on = false
    await flush()
    assert.equal(trueDisposed, 1)
    assert.equal(parent.textContent, 'F')
    store.on = true
    await flush()
    assert.equal(falseDisposed, 1)
    assert.equal(parent.textContent, 'T')
  })

  it('handles DocumentFragment branch returns correctly on swap', async () => {
    const store = new Store({ on: true }) as any
    const parent = document.createElement('div')
    const anchor = document.createComment('')
    parent.appendChild(anchor)
    const disposer = createDisposer()

    conditional(
      parent,
      anchor,
      disposer,
      store,
      () => {
        trackPath(['on'])
        return store.on
      },
      () => {
        const f = document.createDocumentFragment()
        f.appendChild(document.createTextNode('A'))
        f.appendChild(document.createTextNode('B'))
        return f
      },
      () => document.createTextNode('F'),
    )

    assert.equal(parent.textContent, 'AB')
    store.on = false
    await flush()
    // Both fragment children must have been removed.
    assert.equal(parent.textContent, 'F')
  })

  it('preserves SVG namespace for branch nodes supplied by the compiler', async () => {
    const store = new Store({ on: true }) as any
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const anchor = document.createComment('')
    svg.appendChild(anchor)
    const disposer = createDisposer()

    conditional(
      svg,
      anchor,
      disposer,
      store,
      () => {
        trackPath(['on'])
        return store.on
      },
      () => document.createElementNS('http://www.w3.org/2000/svg', 'circle'),
      () => document.createElementNS('http://www.w3.org/2000/svg', 'rect'),
    )

    assert.equal(svg.firstElementChild?.namespaceURI, 'http://www.w3.org/2000/svg')
    assert.equal(svg.firstElementChild?.tagName.toLowerCase(), 'circle')
    store.on = false
    await flush()
    assert.equal(svg.firstElementChild?.namespaceURI, 'http://www.w3.org/2000/svg')
    assert.equal(svg.firstElementChild?.tagName.toLowerCase(), 'rect')
  })

  it('ignores later store changes after the parent disposer is disposed', async () => {
    const store = new Store({ on: true }) as any
    const parent = document.createElement('div')
    const anchor = document.createComment('')
    parent.appendChild(anchor)
    const disposer = createDisposer()
    let mounts = 0

    conditional(
      parent,
      anchor,
      disposer,
      store,
      () => {
        trackPath(['on'])
        return store.on
      },
      () => {
        mounts++
        return document.createTextNode('T')
      },
      () => {
        mounts++
        return document.createTextNode('F')
      },
    )

    disposer.dispose()
    store.on = false
    await flush()

    assert.equal(mounts, 1)
    assert.equal(parent.textContent, '')
    assert.equal(parent.childNodes.length, 0)
  })
})
