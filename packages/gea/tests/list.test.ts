import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'
import { applyListChanges } from '../src/lib/base/list'
import type { ListConfig } from '../src/lib/base/list'
import type { StoreChange } from '../src/lib/store'

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

function createRow(text: string): HTMLElement {
  const el = document.createElement('div')
  el.textContent = text
  el.setAttribute('data-gid', text)
  return el
}

function makeConfig(arpp: string[] = ['items']): ListConfig {
  return {
    arpp,
    create: (item: any) => createRow(String(item)),
  }
}

function getTexts(container: HTMLElement): string[] {
  return Array.from(container.children).map((el) => el.textContent || '')
}

describe('applyListChanges', () => {
  beforeEach(() => {
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  describe('no changes (null) – rerenderInPlace', () => {
    it('replaces existing rows', () => {
      const container = document.createElement('div')
      container.appendChild(createRow('old1'))
      container.appendChild(createRow('old2'))

      applyListChanges(container, ['new1', 'new2', 'new3'], null, makeConfig())
      assert.deepEqual(getTexts(container), ['new1', 'new2', 'new3'])
    })

    it('handles empty array', () => {
      const container = document.createElement('div')
      container.appendChild(createRow('x'))
      applyListChanges(container, [], null, makeConfig())
      assert.equal(container.children.length, 0)
    })

    it('grows list when next is longer', () => {
      const container = document.createElement('div')
      container.appendChild(createRow('1'))
      applyListChanges(container, ['a', 'b', 'c'], null, makeConfig())
      assert.deepEqual(getTexts(container), ['a', 'b', 'c'])
    })

    it('shrinks list when next is shorter', () => {
      const container = document.createElement('div')
      container.appendChild(createRow('a'))
      container.appendChild(createRow('b'))
      container.appendChild(createRow('c'))
      applyListChanges(container, ['x'], null, makeConfig())
      assert.deepEqual(getTexts(container), ['x'])
    })
  })

  describe('empty changes array – rerenderInPlace', () => {
    it('behaves same as null changes', () => {
      const container = document.createElement('div')
      applyListChanges(container, ['a', 'b'], [], makeConfig())
      assert.deepEqual(getTexts(container), ['a', 'b'])
    })
  })

  describe('append changes', () => {
    it('appends new items at end', () => {
      const container = document.createElement('div')
      container.appendChild(createRow('1'))
      container.appendChild(createRow('2'))

      const changes: StoreChange[] = [
        {
          type: 'append',
          property: '2',
          target: [],
          pathParts: ['items'],
          start: 2,
          count: 2,
        },
      ]

      applyListChanges(container, ['1', '2', '3', '4'], changes, makeConfig())
      assert.deepEqual(getTexts(container), ['1', '2', '3', '4'])
    })
  })

  describe('delete changes', () => {
    it('removes rows at specified indices', () => {
      const container = document.createElement('div')
      container.appendChild(createRow('a'))
      container.appendChild(createRow('b'))
      container.appendChild(createRow('c'))

      const changes: StoreChange[] = [
        {
          type: 'delete',
          property: '1',
          target: [],
          pathParts: ['items', '1'],
          previousValue: 'b',
        },
      ]

      applyListChanges(container, ['a', 'c'], changes, makeConfig())
      assert.deepEqual(getTexts(container), ['a', 'c'])
    })

    it('handles multiple deletes (sorted high-to-low)', () => {
      const container = document.createElement('div')
      container.appendChild(createRow('a'))
      container.appendChild(createRow('b'))
      container.appendChild(createRow('c'))
      container.appendChild(createRow('d'))

      const changes: StoreChange[] = [
        { type: 'delete', property: '3', target: [], pathParts: ['items', '3'], previousValue: 'd' },
        { type: 'delete', property: '1', target: [], pathParts: ['items', '1'], previousValue: 'b' },
      ]

      applyListChanges(container, ['a', 'c'], changes, makeConfig())
      assert.deepEqual(getTexts(container), ['a', 'c'])
    })
  })

  describe('add changes', () => {
    it('add at 0 rebuilds when first child is a non-list placeholder (same length as items)', () => {
      const container = document.createElement('div')
      const placeholder = document.createElement('div')
      placeholder.className = 'gesture-log-empty'
      placeholder.textContent = 'No gestures yet'
      container.appendChild(placeholder)

      const changes: StoreChange[] = [
        {
          type: 'add',
          property: '0',
          target: [],
          pathParts: ['gestureLog', '0'],
          newValue: 'first',
        },
      ]

      applyListChanges(container, ['first'], changes, makeConfig(['gestureLog']))
      assert.equal(container.children.length, 1)
      assert.equal(container.children[0].getAttribute('data-gid'), 'first')
      assert.equal(container.children[0].textContent, 'first')
    })

    it('inserts rows at specified positions', () => {
      const container = document.createElement('div')
      container.appendChild(createRow('a'))
      container.appendChild(createRow('c'))

      const changes: StoreChange[] = [
        {
          type: 'add',
          property: '1',
          target: [],
          pathParts: ['items', '1'],
          newValue: 'b',
        },
      ]

      applyListChanges(container, ['a', 'b', 'c'], changes, makeConfig())
      assert.deepEqual(getTexts(container), ['a', 'b', 'c'])
    })
  })

  describe('reorder changes', () => {
    it('reorders rows according to permutation', () => {
      const container = document.createElement('div')
      container.appendChild(createRow('a'))
      container.appendChild(createRow('b'))
      container.appendChild(createRow('c'))

      const changes: StoreChange[] = [
        {
          type: 'reorder',
          property: 'items',
          target: ['c', 'b', 'a'],
          pathParts: ['items'],
          permutation: [2, 1, 0],
          newValue: ['c', 'b', 'a'],
        },
      ]

      applyListChanges(container, ['c', 'b', 'a'], changes, makeConfig())
      assert.deepEqual(getTexts(container), ['c', 'b', 'a'])
    })
  })

  describe('swap changes', () => {
    it('swaps two rows', () => {
      const container = document.createElement('div')
      container.appendChild(createRow('a'))
      container.appendChild(createRow('b'))
      container.appendChild(createRow('c'))

      const changes: StoreChange[] = [
        {
          type: 'update',
          property: '0',
          target: [],
          pathParts: ['items', '0'],
          newValue: 'c',
          previousValue: 'a',
          arrayOp: 'swap',
          otherIndex: 2,
          opId: 'swap:0',
        },
        {
          type: 'update',
          property: '2',
          target: [],
          pathParts: ['items', '2'],
          newValue: 'a',
          previousValue: 'c',
          arrayOp: 'swap',
          otherIndex: 0,
          opId: 'swap:0',
        },
      ]

      applyListChanges(container, ['c', 'b', 'a'], changes, makeConfig())
      assert.deepEqual(getTexts(container), ['c', 'b', 'a'])
    })
  })

  describe('prop patches', () => {
    it('patches individual item properties without rebuilding', () => {
      const container = document.createElement('div')
      const row = document.createElement('div')
      row.className = 'item'
      row.textContent = 'original'
      container.appendChild(row)

      const items = [{ label: 'updated', done: true }]
      const config: ListConfig = {
        arrayPathParts: ['items'],
        create: () => document.createElement('div'),
        propPatchers: {
          label: [(rowEl, value) => (rowEl.textContent = value)],
        },
      }

      const changes: StoreChange[] = [
        {
          type: 'update',
          property: 'label',
          target: items[0],
          pathParts: ['items', '0', 'label'],
          newValue: 'updated',
          previousValue: 'original',
          isArrayItemPropUpdate: true,
          arrayPathParts: ['items'],
          arrayIndex: 0,
          leafPathParts: ['label'],
        },
      ]

      applyListChanges(container, items, changes, config)
      assert.equal(container.children[0].textContent, 'updated')
    })
  })

  describe('update on array path – full rebuild', () => {
    it('rebuilds when full array is replaced', () => {
      const container = document.createElement('div')
      container.appendChild(createRow('old'))

      const changes: StoreChange[] = [
        {
          type: 'update',
          property: 'items',
          target: {},
          pathParts: ['items'],
          newValue: ['x', 'y'],
          previousValue: ['old'],
        },
      ]

      applyListChanges(container, ['x', 'y'], changes, makeConfig())
      assert.deepEqual(getTexts(container), ['x', 'y'])
    })

    it('uses create path for root replacements even when render is available', () => {
      const container = document.createElement('div')
      const changes: StoreChange[] = [
        {
          type: 'update',
          property: 'items',
          target: {},
          pathParts: ['items'],
          newValue: ['x', 'y'],
          previousValue: [],
        },
      ]

      let createCalls = 0
      const config: ListConfig = {
        arrayPathParts: ['items'],
        create: (item: string) => {
          createCalls++
          return createRow(item)
        },
        render: (item: string) => `<div data-gid="${item}">${item}</div>`,
      }

      applyListChanges(container, ['x', 'y'], changes, config)
      assert.deepEqual(getTexts(container), ['x', 'y'])
      assert.equal(createCalls, 2)
    })

    it('patches rows in place for same-key root replacements when patchRow/getKey are available', () => {
      const container = document.createElement('div')
      const firstRow = document.createElement('div')
      firstRow.setAttribute('data-gid', '1')
      firstRow.textContent = 'row 1'
      const secondRow = document.createElement('div')
      secondRow.setAttribute('data-gid', '2')
      secondRow.textContent = 'row 2'
      container.appendChild(firstRow)
      container.appendChild(secondRow)

      const nextItems = [
        { id: 1, label: 'updated 1' },
        { id: 2, label: 'updated 2' },
      ]
      const prevItems = [
        { id: 1, label: 'row 1' },
        { id: 2, label: 'row 2' },
      ]
      const changes: StoreChange[] = [
        {
          type: 'update',
          property: 'items',
          target: {},
          pathParts: ['items'],
          newValue: nextItems,
          previousValue: prevItems,
        },
      ]

      const config: ListConfig = {
        arrayPathParts: ['items'],
        create: (item: { id: number; label: string }) => {
          const el = document.createElement('div')
          el.setAttribute('data-gid', String(item.id))
          el.textContent = item.label
          return el
        },
        getKey: (item: { id: number }) => String(item.id),
        patchRow: (row, item) => {
          row.textContent = item.label
          row.setAttribute('data-gid', String(item.id))
        },
      }

      applyListChanges(container, nextItems, changes, config)
      assert.equal(container.children[0], firstRow)
      assert.equal(container.children[1], secondRow)
      assert.deepEqual(getTexts(container), ['updated 1', 'updated 2'])
    })
  })

  describe('non-array input', () => {
    it('treats non-array as empty', () => {
      const container = document.createElement('div')
      applyListChanges(container, null as any, null, makeConfig())
      assert.equal(container.children.length, 0)
    })
  })
})
