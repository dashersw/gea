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
  // Skip the anchor text node -- only collect element children
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

describe('keyedList', () => {
  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  describe('initial render', () => {
    it('renders items on first effect run', () => {
      const { container } = setup(['a', 'b', 'c'])
      assert.deepEqual(getTexts(container), ['a', 'b', 'c'])
    })

    it('renders empty array as no children', () => {
      const { container } = setup([])
      assert.deepEqual(getTexts(container), [])
    })
  })

  describe('full replacement', () => {
    it('replaces all items when keys are completely different', () => {
      const { container, items } = setup(['a', 'b', 'c'])
      assert.deepEqual(getTexts(container), ['a', 'b', 'c'])

      items.value = ['x', 'y', 'z']
      assert.deepEqual(getTexts(container), ['x', 'y', 'z'])
    })

    it('handles transition from empty to populated', () => {
      const { container, items } = setup([])
      assert.deepEqual(getTexts(container), [])

      items.value = ['a', 'b']
      assert.deepEqual(getTexts(container), ['a', 'b'])
    })

    it('handles transition from populated to empty', () => {
      const { container, items } = setup(['a', 'b', 'c'])
      items.value = []
      assert.deepEqual(getTexts(container), [])
    })
  })

  describe('append', () => {
    it('appends new items at end', () => {
      const { container, items } = setup(['1', '2'])
      assert.deepEqual(getTexts(container), ['1', '2'])

      items.value = ['1', '2', '3', '4']
      assert.deepEqual(getTexts(container), ['1', '2', '3', '4'])
    })
  })

  describe('delete', () => {
    it('removes item from the middle', () => {
      const { container, items } = setup(['a', 'b', 'c'])
      items.value = ['a', 'c']
      assert.deepEqual(getTexts(container), ['a', 'c'])
    })

    it('removes item from the beginning', () => {
      const { container, items } = setup(['a', 'b', 'c'])
      items.value = ['b', 'c']
      assert.deepEqual(getTexts(container), ['b', 'c'])
    })

    it('removes item from the end', () => {
      const { container, items } = setup(['a', 'b', 'c'])
      items.value = ['a', 'b']
      assert.deepEqual(getTexts(container), ['a', 'b'])
    })

    it('removes multiple items', () => {
      const { container, items } = setup(['a', 'b', 'c', 'd'])
      items.value = ['a', 'c']
      assert.deepEqual(getTexts(container), ['a', 'c'])
    })
  })

  describe('insert', () => {
    it('inserts at the beginning', () => {
      const { container, items } = setup(['a', 'b'])
      items.value = ['new', 'a', 'b']
      assert.deepEqual(getTexts(container), ['new', 'a', 'b'])
    })

    it('inserts in the middle', () => {
      const { container, items } = setup(['a', 'c'])
      items.value = ['a', 'b', 'c']
      assert.deepEqual(getTexts(container), ['a', 'b', 'c'])
    })
  })

  describe('swap', () => {
    it('swaps two items', () => {
      const { container, items } = setup(['a', 'b', 'c'])
      items.value = ['c', 'b', 'a']
      assert.deepEqual(getTexts(container), ['c', 'b', 'a'])
    })

    it('swaps adjacent items', () => {
      const { container, items } = setup(['a', 'b', 'c'])
      items.value = ['b', 'a', 'c']
      assert.deepEqual(getTexts(container), ['b', 'a', 'c'])
    })
  })

  describe('reorder', () => {
    it('reorders items according to permutation', () => {
      const { container, items } = setup(['a', 'b', 'c'])
      items.value = ['c', 'a', 'b']
      assert.deepEqual(getTexts(container), ['c', 'a', 'b'])
    })

    it('reverses entire list', () => {
      const { container, items } = setup(['a', 'b', 'c', 'd'])
      items.value = ['d', 'c', 'b', 'a']
      assert.deepEqual(getTexts(container), ['d', 'c', 'b', 'a'])
    })
  })

  describe('DOM node reuse', () => {
    it('reuses DOM nodes for items with same keys', () => {
      const { container, items } = setup(['a', 'b', 'c'])
      const originalNodes = Array.from(container.childNodes).filter(
        (n) => n.nodeType === 1,
      )

      items.value = ['c', 'b', 'a']
      const reorderedNodes = Array.from(container.childNodes).filter(
        (n) => n.nodeType === 1,
      )

      // Same DOM nodes, just reordered
      assert.equal(reorderedNodes[0], originalNodes[2]) // 'c' was at index 2
      assert.equal(reorderedNodes[1], originalNodes[1]) // 'b' stayed at index 1
      assert.equal(reorderedNodes[2], originalNodes[0]) // 'a' was at index 0
    })

    it('preserves existing nodes when appending', () => {
      const { container, items } = setup(['a', 'b'])
      const originalNodes = Array.from(container.childNodes).filter(
        (n) => n.nodeType === 1,
      )

      items.value = ['a', 'b', 'c']
      const updatedNodes = Array.from(container.childNodes).filter(
        (n) => n.nodeType === 1,
      )

      assert.equal(updatedNodes[0], originalNodes[0])
      assert.equal(updatedNodes[1], originalNodes[1])
      assert.equal(updatedNodes.length, 3)
    })
  })

  describe('non-array input', () => {
    it('treats empty array assignment correctly', () => {
      const { container, items } = setup(['a'])
      items.value = []
      assert.deepEqual(getTexts(container), [])
    })
  })

  describe('batch updates', () => {
    it('handles batched signal writes', () => {
      const { container, items } = setup(['a', 'b'])
      batch(() => {
        items.value = ['x', 'y', 'z']
      })
      assert.deepEqual(getTexts(container), ['x', 'y', 'z'])
    })
  })

  describe('keyed reconciliation with objects', () => {
    it('reconciles keyed objects correctly', () => {
      const container = document.createElement('div')
      const anchor = document.createComment('')
      container.appendChild(anchor)

      type Item = { id: number; label: string }
      const items = signal<Item[]>([
        { id: 1, label: 'one' },
        { id: 2, label: 'two' },
        { id: 3, label: 'three' },
      ])

      keyedList(
        container,
        anchor,
        () => items.value,
        (item) => (item as Item).id,
        (getter) => {
          const el = document.createElement('div')
          const item = getter() as Item
          el.textContent = item.label
          el.setAttribute('data-id', String(item.id))
          return el
        },
        true,
      )

      assert.deepEqual(getTexts(container), ['one', 'two', 'three'])

      // Reorder by key
      items.value = [
        { id: 3, label: 'three' },
        { id: 1, label: 'one' },
        { id: 2, label: 'two' },
      ]
      assert.deepEqual(getTexts(container), ['three', 'one', 'two'])
    })
  })
})
