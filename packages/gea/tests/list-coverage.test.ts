import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'
import { keyedList } from '../src/dom/keyed-list'
import { signal } from '../src/signals/signal'
import { batch } from '../src/signals/batch'
import { resetState } from '../src/signals/tracking'
import { resetBatch } from '../src/signals/batch'

let restoreDom: () => void

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const prev = {
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
  }
  Object.assign(globalThis, {
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
  })
  return () => {
    Object.assign(globalThis, prev)
    dom.window.close()
  }
}

function getTexts(container: HTMLElement): string[] {
  return Array.from(container.childNodes)
    .filter((n) => n.nodeType === 1)
    .map((el) => el.textContent || '')
}

function setup(initialItems: string[] = []) {
  const container = document.createElement('div')
  const anchor = document.createComment('')
  container.appendChild(anchor)

  const items = signal<string[]>(initialItems)

  keyedList(
    container,
    anchor,
    () => items.value,
    (item) => item as string,
    (getter) => {
      const el = document.createElement('div')
      el.textContent = getter() as string
      return el
    },
    true,
  )

  return { container, items }
}

describe('keyedList – clear to populated and back', () => {
  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })
  afterEach(() => {
    restoreDom()
  })

  it('transitions from empty to items and back to empty', () => {
    const { container, items } = setup([])
    assert.deepEqual(getTexts(container), [])

    items.value = ['a', 'b']
    assert.deepEqual(getTexts(container), ['a', 'b'])

    items.value = []
    assert.deepEqual(getTexts(container), [])
  })
})

describe('keyedList – single item removal (fast path)', () => {
  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })
  afterEach(() => {
    restoreDom()
  })

  it('removes one item from the middle preserving others', () => {
    const { container, items } = setup(['a', 'b', 'c', 'd'])
    const originalNodes = Array.from(container.childNodes).filter((n) => n.nodeType === 1)

    items.value = ['a', 'b', 'd']
    const updatedNodes = Array.from(container.childNodes).filter((n) => n.nodeType === 1)

    assert.deepEqual(getTexts(container), ['a', 'b', 'd'])
    // Original node for 'a' is preserved
    assert.equal(updatedNodes[0], originalNodes[0])
    // Original node for 'b' is preserved
    assert.equal(updatedNodes[1], originalNodes[1])
    // Original node for 'd' is preserved
    assert.equal(updatedNodes[2], originalNodes[3])
  })

  it('removes the first item', () => {
    const { container, items } = setup(['a', 'b', 'c'])
    items.value = ['b', 'c']
    assert.deepEqual(getTexts(container), ['b', 'c'])
  })

  it('removes the last item', () => {
    const { container, items } = setup(['a', 'b', 'c'])
    items.value = ['a', 'b']
    assert.deepEqual(getTexts(container), ['a', 'b'])
  })
})

describe('keyedList – swap fast path', () => {
  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })
  afterEach(() => {
    restoreDom()
  })

  it('swaps first and last elements', () => {
    const { container, items } = setup(['a', 'b', 'c'])
    const originalNodes = Array.from(container.childNodes).filter((n) => n.nodeType === 1)

    items.value = ['c', 'b', 'a']
    const swappedNodes = Array.from(container.childNodes).filter((n) => n.nodeType === 1)

    assert.deepEqual(getTexts(container), ['c', 'b', 'a'])
    // DOM nodes are reused
    assert.equal(swappedNodes[0], originalNodes[2])
    assert.equal(swappedNodes[1], originalNodes[1])
    assert.equal(swappedNodes[2], originalNodes[0])
  })

  it('swaps adjacent elements', () => {
    const { container, items } = setup(['a', 'b', 'c'])
    items.value = ['a', 'c', 'b']
    assert.deepEqual(getTexts(container), ['a', 'c', 'b'])
  })
})

describe('keyedList – append fast path', () => {
  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })
  afterEach(() => {
    restoreDom()
  })

  it('appends multiple items to existing list', () => {
    const { container, items } = setup(['a'])
    const origNode = Array.from(container.childNodes).filter((n) => n.nodeType === 1)[0]

    items.value = ['a', 'b', 'c']
    const updatedNodes = Array.from(container.childNodes).filter((n) => n.nodeType === 1)

    assert.deepEqual(getTexts(container), ['a', 'b', 'c'])
    assert.equal(updatedNodes[0], origNode) // original node preserved
  })
})

describe('keyedList – full replacement (no key overlap)', () => {
  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })
  afterEach(() => {
    restoreDom()
  })

  it('replaces all items when keys are completely different', () => {
    const { container, items } = setup(['a', 'b', 'c'])
    const origNodes = Array.from(container.childNodes).filter((n) => n.nodeType === 1)

    items.value = ['x', 'y', 'z']
    const newNodes = Array.from(container.childNodes).filter((n) => n.nodeType === 1)

    assert.deepEqual(getTexts(container), ['x', 'y', 'z'])
    // Nodes should be different since keys don't overlap
    assert.notEqual(newNodes[0], origNodes[0])
    assert.notEqual(newNodes[1], origNodes[1])
    assert.notEqual(newNodes[2], origNodes[2])
  })
})

describe('keyedList – general reconciliation with LIS', () => {
  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })
  afterEach(() => {
    restoreDom()
  })

  it('handles complex reorder with additions and removals', () => {
    const { container, items } = setup(['a', 'b', 'c', 'd', 'e'])
    // Remove 'b' and 'd', add 'f', reorder
    items.value = ['e', 'c', 'f', 'a']
    assert.deepEqual(getTexts(container), ['e', 'c', 'f', 'a'])
  })

  it('handles interleaving of old and new keys', () => {
    const { container, items } = setup(['a', 'b', 'c'])
    items.value = ['x', 'a', 'y', 'b', 'z', 'c']
    assert.deepEqual(getTexts(container), ['x', 'a', 'y', 'b', 'z', 'c'])
  })
})

describe('keyedList – rapid sequential updates', () => {
  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })
  afterEach(() => {
    restoreDom()
  })

  it('handles multiple rapid updates correctly', () => {
    const { container, items } = setup(['a', 'b', 'c'])

    items.value = ['a', 'b', 'c', 'd']
    assert.deepEqual(getTexts(container), ['a', 'b', 'c', 'd'])

    items.value = ['d', 'c', 'b', 'a']
    assert.deepEqual(getTexts(container), ['d', 'c', 'b', 'a'])

    items.value = ['b']
    assert.deepEqual(getTexts(container), ['b'])

    items.value = []
    assert.deepEqual(getTexts(container), [])

    items.value = ['x', 'y']
    assert.deepEqual(getTexts(container), ['x', 'y'])
  })
})

describe('keyedList – single item list', () => {
  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })
  afterEach(() => {
    restoreDom()
  })

  it('handles single item to different single item', () => {
    const { container, items } = setup(['a'])
    items.value = ['b']
    assert.deepEqual(getTexts(container), ['b'])
  })

  it('handles single item removal', () => {
    const { container, items } = setup(['a'])
    items.value = []
    assert.deepEqual(getTexts(container), [])
  })
})

describe('keyedList – index signal support', () => {
  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })
  afterEach(() => {
    restoreDom()
  })

  it('provides index getter when noIndex is false', () => {
    const container = document.createElement('div')
    const anchor = document.createComment('')
    container.appendChild(anchor)

    const items = signal<string[]>(['a', 'b', 'c'])
    const capturedIndices: number[] = []

    keyedList(
      container,
      anchor,
      () => items.value,
      (item) => item as string,
      (getter, index) => {
        const el = document.createElement('div')
        const idx = index!()
        capturedIndices.push(idx)
        el.textContent = `${getter()}-${idx}`
        return el
      },
      false, // noIndex = false, so index is provided
    )

    assert.deepEqual(capturedIndices, [0, 1, 2])
    assert.deepEqual(getTexts(container), ['a-0', 'b-1', 'c-2'])
  })
})

describe('keyedList – duplicate key handling', () => {
  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })
  afterEach(() => {
    restoreDom()
  })

  it('renders with unique keys from objects', () => {
    const container = document.createElement('div')
    const anchor = document.createComment('')
    container.appendChild(anchor)

    type Item = { id: number; text: string }
    const items = signal<Item[]>([
      { id: 1, text: 'first' },
      { id: 2, text: 'second' },
    ])

    keyedList(
      container,
      anchor,
      () => items.value,
      (item) => (item as Item).id,
      (getter) => {
        const el = document.createElement('div')
        el.textContent = (getter() as Item).text
        return el
      },
      true,
    )

    assert.deepEqual(getTexts(container), ['first', 'second'])

    items.value = [
      { id: 2, text: 'second' },
      { id: 3, text: 'third' },
      { id: 1, text: 'first' },
    ]
    assert.deepEqual(getTexts(container), ['second', 'third', 'first'])
  })
})
