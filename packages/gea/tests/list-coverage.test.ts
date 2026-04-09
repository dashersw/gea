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

describe('list.ts – rerenderListInPlace edge cases (lines 38-40)', () => {
  beforeEach(() => {
    restoreDom = installDom()
  })
  afterEach(() => {
    restoreDom()
  })

  it('replaces rows in place when lengths match', () => {
    const container = document.createElement('div')
    container.appendChild(createRow('a'))
    container.appendChild(createRow('b'))
    applyListChanges(container, ['x', 'y'], null, makeConfig())
    assert.deepEqual(getTexts(container), ['x', 'y'])
  })
})

describe('list.ts – add at index 0 edge cases (lines 197-204)', () => {
  beforeEach(() => {
    restoreDom = installDom()
  })
  afterEach(() => {
    restoreDom()
  })

  it('rebuilds when add at 0 and first child has no data-gid, lengths differ', () => {
    const container = document.createElement('div')
    const plain = document.createElement('div')
    plain.textContent = 'plain'
    container.appendChild(plain)

    const changes: StoreChange[] = [
      { type: 'add', property: '0', target: [], pathParts: ['items', '0'], newValue: 'new' },
    ]

    applyListChanges(container, ['new', 'a'], changes, makeConfig())
    assert.deepEqual(getTexts(container), ['new', 'a'])
  })

  it('returns early when add at 0, no data-gid, but lengths match', () => {
    const container = document.createElement('div')
    const plain = document.createElement('div')
    plain.textContent = 'plain'
    container.appendChild(plain)
    const plain2 = document.createElement('div')
    plain2.textContent = 'plain2'
    container.appendChild(plain2)

    const changes: StoreChange[] = [
      { type: 'add', property: '0', target: [], pathParts: ['items', '0'], newValue: 'new' },
    ]

    applyListChanges(container, ['new', 'b'], changes, makeConfig())
    assert.equal(container.children.length, 2)
  })

  it('inserts at index 0 when first child has data-gid', () => {
    const container = document.createElement('div')
    container.appendChild(createRow('a'))
    container.appendChild(createRow('b'))

    const changes: StoreChange[] = [
      { type: 'add', property: '0', target: [], pathParts: ['items', '0'], newValue: 'new' },
    ]

    applyListChanges(container, ['new', 'a', 'b'], changes, makeConfig())
    assert.deepEqual(getTexts(container), ['new', 'a', 'b'])
  })
})

describe('list.ts – unhandled mutations trigger rebuild (line 192-195)', () => {
  beforeEach(() => {
    restoreDom = installDom()
  })
  afterEach(() => {
    restoreDom()
  })

  it('rebuilds on unrecognized change types', () => {
    const container = document.createElement('div')
    container.appendChild(createRow('old'))

    const changes: StoreChange[] = [{ type: 'unknown', property: '0', target: [], pathParts: ['items', '0'] }]

    applyListChanges(container, ['rebuilt'], changes, makeConfig())
    assert.deepEqual(getTexts(container), ['rebuilt'])
  })
})

describe('list.ts – swap with only one pair', () => {
  beforeEach(() => {
    restoreDom = installDom()
  })
  afterEach(() => {
    restoreDom()
  })

  it('handles swap change', () => {
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
        arrayOp: 'swap',
        opId: 'swap:0',
        otherIndex: 2,
      },
      {
        type: 'update',
        property: '2',
        target: [],
        pathParts: ['items', '2'],
        newValue: 'a',
        arrayOp: 'swap',
        opId: 'swap:0',
        otherIndex: 0,
      },
    ]

    applyListChanges(container, ['c', 'b', 'a'], changes, makeConfig())
    assert.deepEqual(getTexts(container), ['c', 'b', 'a'])
  })
})

describe('list.ts – reorder change', () => {
  beforeEach(() => {
    restoreDom = installDom()
  })
  afterEach(() => {
    restoreDom()
  })

  it('handles reorder changes with permutation', () => {
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
        arrayOp: 'reorder',
        permutation: [2, 0, 1],
      },
    ]

    applyListChanges(container, ['c', 'a', 'b'], changes, makeConfig())
    assert.deepEqual(getTexts(container), ['c', 'a', 'b'])
  })
})

describe('list.ts – delete with non-matching pathParts falls through', () => {
  beforeEach(() => {
    restoreDom = installDom()
  })
  afterEach(() => {
    restoreDom()
  })

  it('ignores delete with wrong arpp', () => {
    const container = document.createElement('div')
    container.appendChild(createRow('a'))
    container.appendChild(createRow('b'))

    const changes: StoreChange[] = [
      {
        type: 'delete',
        property: '0',
        target: [],
        pathParts: ['other', '0'],
      },
    ]

    applyListChanges(container, ['b'], changes, makeConfig())
    assert.deepEqual(getTexts(container), ['b'])
  })
})

describe('list.ts – append with non-matching pathParts falls through', () => {
  beforeEach(() => {
    restoreDom = installDom()
  })
  afterEach(() => {
    restoreDom()
  })

  it('ignores append with wrong arpp', () => {
    const container = document.createElement('div')
    container.appendChild(createRow('a'))

    const changes: StoreChange[] = [
      {
        type: 'append',
        property: '1',
        target: [],
        pathParts: ['other'],
        start: 1,
        count: 1,
        newValue: ['b'],
      },
    ]

    applyListChanges(container, ['a', 'b'], changes, makeConfig())
    assert.deepEqual(getTexts(container), ['a', 'b'])
  })
})

describe('list.ts – prop patches with non-matching pathParts', () => {
  beforeEach(() => {
    restoreDom = installDom()
  })
  afterEach(() => {
    restoreDom()
  })

  it('falls through to rebuild when prop patches have wrong arpp', () => {
    const container = document.createElement('div')
    container.appendChild(createRow('old'))

    const config: ListConfig = {
      arrayPathParts: ['items'],
      create: (item: any) => createRow(String(item)),
      propPatchers: {
        label: [(row, value) => (row.textContent = value)],
      },
    }

    const changes: StoreChange[] = [
      {
        type: 'update',
        property: 'label',
        target: {},
        pathParts: ['other', '0', 'label'],
        newValue: 'new',
        isArrayItemPropUpdate: true,
        arrayPathParts: ['other'],
        arrayIndex: 0,
        leafPathParts: ['label'],
      },
    ]

    applyListChanges(container, ['rebuilt'], changes, config)
    assert.deepEqual(getTexts(container), ['rebuilt'])
  })
})
