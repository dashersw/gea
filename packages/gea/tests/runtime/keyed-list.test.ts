/**
 * Unit tests for runtime/keyed-list.ts (specialized createEntry / patchEntry API).
 *
 * Covers: initial render, pure append fast path, in-place (aipu) replacement,
 * generic update (splice removal), reverse (reorder), full replace,
 * dispose removes subscription.
 *
 * The runtime expects compile-time specialization: per `.map()` site the
 * compiler emits createEntry / patchEntry / onItemRemove closures instead of
 * generic flag-driven kernels.
 */

import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom } from '../../../../tests/helpers/jsdom-setup'
import { Store } from '../../src/store'
import { createDisposer, type Disposer } from '../../src/runtime/disposer'
import { keyedList } from '../../src/runtime/keyed-list'
import { keyedListProp } from '../../src/runtime/keyed-list-prop'
import type { Entry } from '../../src/runtime/keyed-list/types'
import { _deferBulk, _rescue } from '../../src/runtime/keyed-list/rescue'
import { GEA_PROXY_RAW } from '../../src/runtime/symbols'

let teardown: () => void

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0))
}

interface Item {
  id: string
  label?: string
}

function setup(items: Item[]) {
  const store = new Store({ items }) as any
  const container = document.createElement('ul')
  const anchor = document.createComment('list-end')
  container.appendChild(anchor)
  const disposer = createDisposer()
  return { store, container, anchor, disposer }
}

function createLi(item: Item): Element {
  const li = document.createElement('li')
  li.setAttribute('data-id', item.id)
  li.textContent = item.label ?? item.id
  return li
}

function liTexts(container: Element): string[] {
  const out: string[] = []
  const kids = container.children
  for (let i = 0; i < kids.length; i++) out.push(kids[i].textContent ?? '')
  return out
}

/** Convenience adapter: builds createEntry/patchEntry from a render fn. */
function run(cfg: {
  container: Element
  anchor: Comment
  disposer: Disposer
  root: any
  path: readonly string[]
  key?: (item: Item, idx: number) => string
  render: (item: Item, d: Disposer) => Element
  onPatch?: (e: Entry, newItem: Item) => void
}): void {
  const key = cfg.key ?? ((it: Item) => it.id)
  keyedList({
    container: cfg.container,
    anchor: cfg.anchor,
    disposer: cfg.disposer,
    root: cfg.root,
    path: cfg.path,
    key,
    createEntry: (item: Item, idx: number): Entry => {
      const d = cfg.disposer.child()
      const el = cfg.render(item, d)
      return { key: key(item, idx), item, element: el, disposer: d, obs: null as any }
    },
    patchEntry: (e: Entry, newItem: Item) => {
      e.item = newItem
      if (cfg.onPatch) cfg.onPatch(e, newItem)
    },
  })
}

function runProp(cfg: {
  container: Element
  anchor: Comment
  disposer: Disposer
  root: any
  prop: string
  key?: (item: Item, idx: number) => string
  render: (item: Item) => Element
  onPatch?: (e: { item: Item; element: Element }, newItem: Item) => void
}): void {
  const key = cfg.key ?? ((it: Item) => it.id)
  keyedListProp({
    container: cfg.container,
    anchor: cfg.anchor,
    disposer: cfg.disposer,
    root: cfg.root,
    prop: cfg.prop,
    key,
    createEntry: (item: Item, idx: number) => ({
      key: key(item, idx),
      item,
      element: cfg.render(item),
    }),
    patchEntry: (e, newItem) => {
      e.item = newItem
      if (cfg.onPatch) cfg.onPatch(e, newItem)
    },
  })
}

describe('keyedList', () => {
  beforeEach(() => {
    teardown = installDom()
  })
  afterEach(() => {
    teardown()
  })

  it('first render inserts all items in order before anchor', () => {
    const { store, container, anchor, disposer } = setup([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    run({
      container,
      anchor,
      disposer,
      root: store,
      path: ['items'],
      render: (it: Item) => createLi(it),
    })
    assert.equal(container.children.length, 3)
    assert.deepEqual(liTexts(container), ['a', 'b', 'c'])
    assert.equal(container.lastChild, anchor)
  })

  it('pure append (push) creates new nodes without rebuilding existing', async () => {
    const { store, container, anchor, disposer } = setup([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    run({
      container,
      anchor,
      disposer,
      root: store,
      path: ['items'],
      render: (it: Item) => createLi(it),
    })
    const initial = Array.from(container.children) as Element[]
    for (const el of initial) (el as any).__sentinel = true

    store.items.push({ id: 'd' })
    await flush()

    assert.equal(container.children.length, 4)
    assert.deepEqual(liTexts(container), ['a', 'b', 'c', 'd'])
    for (let i = 0; i < 3; i++) {
      assert.equal((container.children[i] as any).__sentinel, true, `item ${i} should be reused`)
    }
    assert.equal((container.children[3] as any).__sentinel, undefined)
  })

  it('in-place replacement (aipu) rebuilds only the affected item', async () => {
    const { store, container, anchor, disposer } = setup([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    run({
      container,
      anchor,
      disposer,
      root: store,
      path: ['items'],
      render: (it: Item) => createLi(it),
    })
    const initial = Array.from(container.children) as Element[]
    for (const el of initial) (el as any).__sentinel = true

    store.items[1] = { id: 'x' }
    await flush()

    assert.deepEqual(liTexts(container), ['a', 'x', 'c'])
    assert.equal((container.children[0] as any).__sentinel, true, 'a reused')
    assert.equal((container.children[1] as any).__sentinel, undefined, 'x fresh')
    assert.equal((container.children[2] as any).__sentinel, true, 'c reused')
  })

  it('generic update (splice) removes the affected item', async () => {
    const { store, container, anchor, disposer } = setup([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    run({
      container,
      anchor,
      disposer,
      root: store,
      path: ['items'],
      render: (it: Item) => createLi(it),
    })
    const elA = container.children[0]
    const elC = container.children[2]

    store.items.splice(1, 1)
    await flush()

    assert.deepEqual(liTexts(container), ['a', 'c'])
    assert.equal(container.children[0], elA, 'a preserved')
    assert.equal(container.children[1], elC, 'c preserved, shifted left')
  })

  it('reverse keeps the same DOM elements and reorders them', async () => {
    const { store, container, anchor, disposer } = setup([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    run({
      container,
      anchor,
      disposer,
      root: store,
      path: ['items'],
      render: (it: Item) => createLi(it),
    })
    const [elA, elB, elC] = Array.from(container.children)

    store.items.reverse()
    await flush()

    assert.deepEqual(liTexts(container), ['c', 'b', 'a'])
    assert.equal(container.children[0], elC, 'c moved to front')
    assert.equal(container.children[1], elB, 'b stayed (stable)')
    assert.equal(container.children[2], elA, 'a moved to back')
  })

  it('swap (two-index exchange) keeps the same DOM nodes, reordered', async () => {
    const { store, container, anchor, disposer } = setup([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    run({
      container,
      anchor,
      disposer,
      root: store,
      path: ['items'],
      render: (it: Item) => createLi(it),
    })
    const el0 = container.children[0] as Element
    const el2 = container.children[2] as Element
    const tmp = store.items[0]
    store.items[0] = store.items[2]
    store.items[2] = tmp
    await flush()

    assert.deepEqual(liTexts(container), ['c', 'b', 'a'])
    assert.equal(container.children[0], el2, 'old index-2 node is now at the front (swap preserves DOM identity)')
    assert.equal(container.children[2], el0, 'old index-0 node is now at the tail (swap preserves DOM identity)')
  })

  it('uses an explicit key function for rows whose identity is not `id`', async () => {
    const { store, container, anchor, disposer } = setup([
      { id: 'row-1', label: 'alpha' },
      { id: 'row-2', label: 'beta' },
    ])
    run({
      container,
      anchor,
      disposer,
      root: store,
      path: ['items'],
      key: (it: Item) => it.label!,
      render: (it: Item) => createLi(it),
      onPatch: (entry, item) => {
        entry.element.textContent = item.label ?? item.id
      },
    })
    const alpha = container.children[0]
    const beta = container.children[1]

    store.items = [
      { id: 'new-2', label: 'beta' },
      { id: 'new-1', label: 'alpha' },
    ]
    await flush()

    assert.deepEqual(liTexts(container), ['beta', 'alpha'])
    assert.equal(container.children[0], beta)
    assert.equal(container.children[1], alpha)
  })

  it('keeps sibling keyed-list sites isolated even when keys overlap', async () => {
    const store = new Store({
      left: [
        { id: 'a', label: 'L-a' },
        { id: 'b', label: 'L-b' },
      ],
      right: [
        { id: 'a', label: 'R-a' },
        { id: 'b', label: 'R-b' },
      ],
    }) as any
    const left = document.createElement('ul')
    const right = document.createElement('ul')
    const leftAnchor = document.createComment('left')
    const rightAnchor = document.createComment('right')
    left.appendChild(leftAnchor)
    right.appendChild(rightAnchor)
    const disposer = createDisposer()

    run({
      container: left,
      anchor: leftAnchor,
      disposer,
      root: store,
      path: ['left'],
      render: (it: Item) => createLi(it),
    })
    run({
      container: right,
      anchor: rightAnchor,
      disposer,
      root: store,
      path: ['right'],
      render: (it: Item) => createLi(it),
    })
    const rightNodes = Array.from(right.children)

    store.left.reverse()
    await flush()

    assert.deepEqual(liTexts(left), ['L-b', 'L-a'])
    assert.deepEqual(liTexts(right), ['R-a', 'R-b'])
    assert.equal(right.children[0], rightNodes[0])
    assert.equal(right.children[1], rightNodes[1])
  })

  it('rescues a row when the target filtered list reconciles before the source list', async () => {
    const store = new Store({
      issues: [{ id: 'i1', status: 'right', label: 'Issue 1' }],
    }) as any
    const left = document.createElement('ul')
    const right = document.createElement('ul')
    const leftAnchor = document.createComment('left')
    const rightAnchor = document.createComment('right')
    left.appendChild(leftAnchor)
    right.appendChild(rightAnchor)
    const disposer = createDisposer()
    const pending = new Map<string, Entry>()

    const renderList = (container: Element, anchor: Comment, status: string): void => {
      keyedList({
        container,
        anchor,
        disposer,
        root: store,
        pending,
        path: () => store.issues.filter((issue: Item & { status: string }) => issue.status === status),
        key: (issue: Item) => issue.id,
        createEntry: (issue: Item): Entry => {
          const key = issue.id
          const rescued = _rescue(pending, String(key), issue)
          if (rescued) return rescued
          const d = disposer.child()
          return { key, item: (issue as any)[GEA_PROXY_RAW] || issue, element: createLi(issue), disposer: d, obs: null as any }
        },
        patchEntry: (entry: Entry, issue: Item) => {
          entry.item = (issue as any)[GEA_PROXY_RAW] || issue
          entry.element.textContent = issue.label ?? issue.id
        },
      })
    }

    renderList(left, leftAnchor, 'left')
    renderList(right, rightAnchor, 'right')
    const row = right.children[0]

    store.issues[0].status = 'left'
    await flush()

    assert.equal(left.children[0], row, 'leftward cross-list move preserves the row DOM node')
    assert.equal(right.children.length, 0)
  })

  it('handles primitive and null item keys by using the serialized key contract', async () => {
    const store = new Store({ items: [null, 'a', 2] }) as any
    const container = document.createElement('ul')
    const anchor = document.createComment('end')
    container.appendChild(anchor)
    const disposer = createDisposer()
    keyedList({
      container,
      anchor,
      disposer,
      root: store,
      path: ['items'],
      key: (item) => String(item ?? 'null'),
      createEntry: (item): Entry => {
        const el = document.createElement('li')
        el.textContent = String(item ?? 'null')
        return { key: String(item ?? 'null'), item, element: el, disposer: disposer.child(), obs: null as any }
      },
      patchEntry: (entry, item) => {
        entry.item = item
        entry.element.textContent = String(item ?? 'null')
      },
    })
    const nullNode = container.children[0]
    const twoNode = container.children[2]

    store.items = [2, 'a', null]
    await flush()

    assert.deepEqual(liTexts(container), ['2', 'a', 'null'])
    assert.equal(container.children[0], twoNode)
    assert.equal(container.children[2], nullNode)
  })

  it('disjoint key replace creates new row elements (all-new ids)', async () => {
    const { store, container, anchor, disposer } = setup([{ id: 'a' }, { id: 'b' }])
    run({
      container,
      anchor,
      disposer,
      root: store,
      path: ['items'],
      render: (it: Item) => createLi(it),
    })
    const a0 = container.children[0] as Element
    const a1 = container.children[1] as Element

    store.items = [{ id: 'n1' }, { id: 'n2' }]
    await flush()
    await flush()

    assert.deepEqual(liTexts(container), ['n1', 'n2'])
    assert.notEqual(container.children[0], a0, 'row 0 is a new node after disjoint replace')
    assert.notEqual(container.children[1], a1, 'row 1 is a new node after disjoint replace')
  })

  it('patches same-key replacement without replacing the row element', async () => {
    const { store, container, anchor, disposer } = setup([{ id: 'a', label: 'old' }])
    run({
      container,
      anchor,
      disposer,
      root: store,
      path: ['items'],
      render: (it: Item) => createLi(it),
      onPatch: (entry, item) => {
        entry.element.textContent = item.label ?? item.id
      },
    })
    const row = container.children[0]

    store.items = [{ id: 'a', label: 'new' }]
    await flush()

    assert.equal(container.children[0], row)
    assert.deepEqual(liTexts(container), ['new'])
  })

  it('clearing a mixed container preserves static siblings and the anchor', async () => {
    const { store, container, anchor, disposer } = setup([{ id: 'a' }, { id: 'b' }])
    const staticNode = document.createElement('li')
    staticNode.className = 'static-before'
    staticNode.textContent = 'static'
    container.insertBefore(staticNode, anchor)
    run({
      container,
      anchor,
      disposer,
      root: store,
      path: ['items'],
      render: (it: Item) => createLi(it),
    })

    store.items = []
    await flush()

    assert.equal(container.firstElementChild, staticNode)
    assert.equal(container.lastChild, anchor)
    assert.deepEqual(liTexts(container), ['static'])
  })

  it('new rows after a full key replacement receive fresh click handlers', async () => {
    const { store, container, anchor, disposer } = setup([{ id: 'x' }])
    const clicks: string[] = []
    run({
      container,
      anchor,
      disposer,
      root: store,
      path: ['items'],
      render: (it: Item) => {
        const el = createLi(it)
        const btn = document.createElement('button')
        btn.className = 'row-go'
        btn.addEventListener('click', () => {
          clicks.push(it.id)
        })
        el.appendChild(btn)
        return el
      },
    })
    store.items = [{ id: 'y' }, { id: 'z' }]
    await flush()
    await flush()
    const buttons = container.querySelectorAll('button.row-go')
    assert.equal(buttons.length, 2)
    ;(buttons[0] as HTMLButtonElement).click()
    ;(buttons[1] as HTMLButtonElement).click()
    assert.deepEqual(clicks, ['y', 'z'], 'handlers bind to the new row identities after replace')
  })

  it('full replace disposes old entries and creates fresh ones', async () => {
    const { store, container, anchor, disposer } = setup([{ id: 'a' }, { id: 'b' }])
    const disposed: string[] = []
    run({
      container,
      anchor,
      disposer,
      root: store,
      path: ['items'],
      render: (it: Item, d: Disposer) => {
        d.add(() => disposed.push(it.id))
        return createLi(it)
      },
    })
    assert.equal(container.children.length, 2)

    store.items = [{ id: 'new1' }, { id: 'new2' }]
    await flush()
    // _defer schedules dispose on the next microtask — wait again.
    await flush()

    assert.deepEqual(liTexts(container), ['new1', 'new2'])
    assert.ok(disposed.includes('a'), 'a disposed')
    assert.ok(disposed.includes('b'), 'b disposed')
  })

  it('bulk deferred rescue queues can rescue one row and dispose the rest', async () => {
    let disposedA = 0
    let disposedB = 0
    const mkEntry = (key: string, onDispose: () => void): Entry => ({
      key,
      item: { id: key },
      element: createLi({ id: key }),
      disposer: {
        add() {},
        dispose() {
          onDispose()
        },
        child() {
          return this
        },
      },
      obs: null as any,
    })

    const a = mkEntry('a', () => {
      disposedA++
    })
    const b = mkEntry('b', () => {
      disposedB++
    })
    const pending = new Map<string, Entry>()
    _deferBulk(pending, [a, b])

    assert.equal(_rescue(pending, 'a'), a, 'rescues an entry from the bulk queue by key')
    await flush()

    assert.equal(disposedA, 0, 'rescued entry is not disposed')
    assert.equal(disposedB, 1, 'unrescued entry is disposed on the microtask flush')
  })

  it('rescue does not cross sites: each `pending` Map is its own rescue queue', async () => {
    let disposed = 0
    const entry: Entry = {
      key: 'shared',
      item: { id: 'shared' },
      element: createLi({ id: 'shared' }),
      disposer: {
        add() {},
        dispose() {
          disposed++
        },
        child() {
          return this
        },
      },
      obs: null as any,
    }

    const left = new Map<string, Entry>()
    const right = new Map<string, Entry>()
    _deferBulk(left, [entry])

    assert.equal(_rescue(right, 'shared'), null, 'a different site cannot see the entry')
    await flush()

    assert.equal(disposed, 1, 'entry is disposed when no same-site rescue occurs')
  })

  it('prop kernel handles common updates and preserves row nodes', async () => {
    const { store, container, anchor, disposer } = setup([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ])
    runProp({
      container,
      anchor,
      disposer,
      root: store,
      prop: 'items',
      render: (it: Item) => createLi({ id: it.id, label: it.label }),
      onPatch: (entry, item) => {
        entry.element.textContent = item.label ?? item.id
      },
    })
    const bNode = container.children[1]
    const cNode = container.children[2]

    store.items[1].label = 'B!'
    await flush()

    assert.deepEqual(liTexts(container), ['A', 'B!', 'C'])
    assert.equal(container.children[1], bNode, 'dirty patch keeps the row node')

    store.items.push({ id: 'd', label: 'D' })
    await flush()
    const dNode = container.children[3]

    store.items.splice(0, 1)
    await flush()

    assert.deepEqual(liTexts(container), ['B!', 'C', 'D'])
    assert.equal(container.children[0], bNode)
    assert.equal(container.children[1], cNode)

    store.items.reverse()
    await flush()

    assert.deepEqual(liTexts(container), ['D', 'C', 'B!'])
    assert.equal(container.children[0], dNode)
    assert.equal(container.children[1], cNode)
    assert.equal(container.children[2], bNode)
  })

  it('dispose removes subscription: subsequent mutations have no effect', async () => {
    const { store, container, anchor, disposer } = setup([{ id: 'a' }])
    let createCalls = 0
    run({
      container,
      anchor,
      disposer,
      root: store,
      path: ['items'],
      render: (it: Item) => {
        createCalls++
        return createLi(it)
      },
    })
    assert.equal(createCalls, 1)

    disposer.dispose()
    store.items.push({ id: 'b' })
    await flush()

    assert.equal(createCalls, 1)
  })
})
