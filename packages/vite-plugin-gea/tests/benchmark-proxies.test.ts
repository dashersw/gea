/**
 * Wall-clock budgets are loose enough for full-workspace `npm test` runs (parallel packages + CPU contention).
 * For tight regression signal, run this file in isolation.
 *
 * v2 note: items are plain objects with signals installed by `ensureItemSignal`.
 * Mutating `item.label` directly triggers the item's signal and updates the DOM.
 * Replacing an array with new objects of the same key does NOT update item text
 * because the signalEffect is subscribed to the original item's `__s$label` signal.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { installDom, flushMicrotasks } from '../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, compileStore, loadRuntimeModules } from './helpers/compile'
import { resetDelegation } from '../../gea/src/dom/events'

function buildRows(count: number, startId = 1) {
  return Array.from({ length: count }, (_, index) => {
    const id = startId + index
    return { id, label: `row ${id}` }
  })
}

interface DomSpyCounts {
  appendChildCalls: number
  insertBeforeCalls: number
  removeChildCalls: number
  removeCalls: number
  querySelectorCalls: number
  getAttributeCalls: number
  setAttributeCalls: number
  cloneNodeCalls: number
  containerAppendChildCalls: number
  containerInsertBeforeCalls: number
  containerRemoveChildCalls: number
  containerInnerHTMLSetCalls: number
  containerTextContentSetCalls: number
}

function createDomOperationSpy() {
  const counts: DomSpyCounts = {
    appendChildCalls: 0,
    insertBeforeCalls: 0,
    removeChildCalls: 0,
    removeCalls: 0,
    querySelectorCalls: 0,
    getAttributeCalls: 0,
    setAttributeCalls: 0,
    cloneNodeCalls: 0,
    containerAppendChildCalls: 0,
    containerInsertBeforeCalls: 0,
    containerRemoveChildCalls: 0,
    containerInnerHTMLSetCalls: 0,
    containerTextContentSetCalls: 0,
  }

  let trackedContainer: Element | null = null

  const originalAppendChild = Node.prototype.appendChild
  const originalInsertBefore = Node.prototype.insertBefore
  const originalRemoveChild = Node.prototype.removeChild
  const originalTextContent = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')
  const originalRemove = Element.prototype.remove
  const originalQuerySelector = Element.prototype.querySelector
  const originalGetAttribute = Element.prototype.getAttribute
  const originalSetAttribute = Element.prototype.setAttribute
  const originalCloneNode = Element.prototype.cloneNode
  const originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')

  Node.prototype.appendChild = function (...args) {
    counts.appendChildCalls++
    if (trackedContainer && this === trackedContainer) counts.containerAppendChildCalls++
    return originalAppendChild.apply(this, args as [Node])
  }

  Node.prototype.insertBefore = function (...args) {
    counts.insertBeforeCalls++
    if (trackedContainer && this === trackedContainer) counts.containerInsertBeforeCalls++
    return originalInsertBefore.apply(this, args as [Node, Node | null])
  }

  Node.prototype.removeChild = function (...args) {
    counts.removeChildCalls++
    if (trackedContainer && this === trackedContainer) counts.containerRemoveChildCalls++
    return originalRemoveChild.apply(this, args as [Node])
  }

  Element.prototype.remove = function (...args) {
    counts.removeCalls++
    return originalRemove.apply(this, args)
  }

  Element.prototype.querySelector = function (...args) {
    counts.querySelectorCalls++
    return originalQuerySelector.apply(this, args as [string])
  }

  Element.prototype.getAttribute = function (...args) {
    counts.getAttributeCalls++
    return originalGetAttribute.apply(this, args as [string])
  }

  Element.prototype.setAttribute = function (...args) {
    counts.setAttributeCalls++
    return originalSetAttribute.apply(this, args as [string, string])
  }

  Element.prototype.cloneNode = function (...args) {
    counts.cloneNodeCalls++
    return originalCloneNode.apply(this, args as [boolean?])
  }

  if (originalInnerHTML?.configurable && originalInnerHTML.set && originalInnerHTML.get) {
    Object.defineProperty(Element.prototype, 'innerHTML', {
      configurable: true,
      enumerable: originalInnerHTML.enumerable ?? false,
      get() {
        return originalInnerHTML.get!.call(this)
      },
      set(value: string) {
        if (trackedContainer && this === trackedContainer) counts.containerInnerHTMLSetCalls++
        return originalInnerHTML.set!.call(this, value)
      },
    })
  }

  if (originalTextContent?.configurable && originalTextContent.set && originalTextContent.get) {
    Object.defineProperty(Node.prototype, 'textContent', {
      configurable: true,
      enumerable: originalTextContent.enumerable ?? false,
      get() {
        return originalTextContent.get!.call(this)
      },
      set(value: string) {
        if (trackedContainer && this === trackedContainer) counts.containerTextContentSetCalls++
        return originalTextContent.set!.call(this, value)
      },
    })
  }

  return {
    counts,
    trackContainer(element: Element) {
      trackedContainer = element
    },
    reset() {
      for (const key of Object.keys(counts) as Array<keyof DomSpyCounts>) counts[key] = 0
    },
    restore() {
      Node.prototype.appendChild = originalAppendChild
      Node.prototype.insertBefore = originalInsertBefore
      Node.prototype.removeChild = originalRemoveChild
      Element.prototype.remove = originalRemove
      Element.prototype.querySelector = originalQuerySelector
      Element.prototype.getAttribute = originalGetAttribute
      Element.prototype.setAttribute = originalSetAttribute
      Element.prototype.cloneNode = originalCloneNode
      if (originalInnerHTML) Object.defineProperty(Element.prototype, 'innerHTML', originalInnerHTML)
      if (originalTextContent) Object.defineProperty(Node.prototype, 'textContent', originalTextContent)
    },
  }
}

async function renderBenchmarkTable(seed: string) {
  const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

  const BenchmarkStore = await compileStore(
    `
      import { Store } from '@geajs/core'
      export default class BenchmarkStore extends Store {
        data = [] as Array<{ id: number; label: string }>
      }
    `,
    '/virtual/benchmark-store.ts',
    'BenchmarkStore',
    { Store },
  )
  const store = new BenchmarkStore()

  const BenchmarkTable = await compileJsxComponent(
    `
      import { Component } from '@geajs/core'
      import store from './store.ts'

      export default class BenchmarkTable extends Component {
        template() {
          return (
            <table>
              <tbody id="tbody">
                {store.data.map(item => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      }
    `,
    '/virtual/BenchmarkTable.jsx',
    'BenchmarkTable',
    { Component, store },
  )

  const root = document.createElement('div')
  document.body.appendChild(root)

  const view = new BenchmarkTable()
  view.render(root)

  return { store, view }
}

function getTableBody(view: { el: HTMLElement }) {
  const tbody = view.el.querySelector('tbody')
  assert.ok(tbody)
  return tbody as HTMLTableSectionElement
}

function getRows(tbody: ParentNode) {
  return Array.from(tbody.querySelectorAll('tr')) as HTMLTableRowElement[]
}

async function timed<T>(
  label: string,
  fn: () => Promise<T>,
  budgetMs?: number,
): Promise<{ result: T; elapsed: number }> {
  const start = performance.now()
  const result = await fn()
  const elapsed = performance.now() - start
  console.log(`    ⏱  ${label}: ${elapsed.toFixed(1)}ms${budgetMs ? ` (budget: ${budgetMs}ms)` : ''}`)
  if (budgetMs !== undefined) {
    assert.ok(elapsed <= budgetMs, `${label} took ${elapsed.toFixed(1)}ms, exceeding budget of ${budgetMs}ms`)
  }
  return { result, elapsed }
}

test('benchmark: partial update preserves row identity and avoids structural DOM ops', async () => {
  const restoreDom = installDom()
  resetDelegation()
  const spy = createDomOperationSpy()

  try {
    const { store, view } = await renderBenchmarkTable(`proxy-${Date.now()}-partial`)
    store.data = buildRows(1000)
    await flushMicrotasks()

    const tbody = getTableBody(view)
    const rowsBefore = getRows(tbody)
    spy.trackContainer(tbody)
    spy.reset()

    await timed(
      'partial update 1k',
      async () => {
        // v2: mutate item.label directly — triggers __s$label signal on same objects
        for (let index = 0; index < store.data.length; index += 10) {
          store.data[index].label = `updated ${index}`
        }
        await flushMicrotasks()
      },
      700,
    )

    const rowsAfter = getRows(tbody)
    assert.equal(rowsAfter.length, 1000)
    for (let index = 0; index < rowsAfter.length; index++) {
      assert.equal(rowsAfter[index], rowsBefore[index])
    }
    assert.equal(rowsAfter[0]?.children[1]?.textContent, 'updated 0')
    assert.equal(rowsAfter[1]?.children[1]?.textContent, 'row 2')
    assert.equal(spy.counts.containerAppendChildCalls, 0)
    assert.equal(spy.counts.containerInsertBeforeCalls, 0)
    assert.equal(spy.counts.containerRemoveChildCalls, 0)
    assert.equal(spy.counts.removeCalls, 0)
  } finally {
    spy.restore()
    restoreDom()
  }
})

test('benchmark: simulate 03_update10th1k_x16 without structural DOM churn', async () => {
  const restoreDom = installDom()
  resetDelegation()
  const spy = createDomOperationSpy()

  try {
    const { store, view } = await renderBenchmarkTable(`proxy-${Date.now()}-partial-x16`)
    store.data = buildRows(1000)
    await flushMicrotasks()

    const tbody = getTableBody(view)
    const rowsBefore = getRows(tbody)
    spy.trackContainer(tbody)
    spy.reset()

    await timed(
      '03_update10th1k x16',
      async () => {
        for (let iteration = 0; iteration < 16; iteration++) {
          // v2: mutate item.label directly on same objects
          for (let index = 0; index < store.data.length; index += 10) {
            store.data[index].label = `updated ${iteration}-${index}`
          }
          await flushMicrotasks()
        }
      },
      3500,
    )

    const rowsAfter = getRows(tbody)
    assert.equal(rowsAfter.length, 1000)
    for (let index = 0; index < rowsAfter.length; index++) {
      assert.equal(rowsAfter[index], rowsBefore[index])
    }
    assert.equal(rowsAfter[0]?.children[1]?.textContent, 'updated 15-0')
    assert.equal(rowsAfter[10]?.children[1]?.textContent, 'updated 15-10')
    assert.equal(rowsAfter[1]?.children[1]?.textContent, 'row 2')
    assert.equal(spy.counts.containerAppendChildCalls, 0)
    assert.equal(spy.counts.containerInsertBeforeCalls, 0)
    assert.equal(spy.counts.containerRemoveChildCalls, 0)
    assert.equal(spy.counts.removeCalls, 0)
  } finally {
    spy.restore()
    restoreDom()
  }
})

test('benchmark: keyed remove deletes one row without bulk container rewrites', async () => {
  const restoreDom = installDom()
  resetDelegation()
  const spy = createDomOperationSpy()

  try {
    const { store, view } = await renderBenchmarkTable(`proxy-${Date.now()}-remove`)
    store.data = buildRows(1000)
    await flushMicrotasks()

    const tbody = getTableBody(view)
    const rowsBefore = getRows(tbody)
    const removedRow = rowsBefore[500]
    const shiftedRow = rowsBefore[501]

    spy.trackContainer(tbody)
    spy.reset()

    await timed(
      'remove row from 1k',
      async () => {
        // v2: use wrapped array splice — triggers _notify()
        store.data.splice(500, 1)
        await flushMicrotasks()
      },
      400,
    )

    const rowsAfter = getRows(tbody)
    assert.equal(rowsAfter.length, 999)
    assert.equal(rowsAfter[500], shiftedRow)
    assert.ok(!rowsAfter.includes(removedRow!))
    assert.equal(spy.counts.containerAppendChildCalls, 0)
    assert.equal(spy.counts.containerInnerHTMLSetCalls, 0)
    assert.equal(spy.counts.containerTextContentSetCalls, 0)
  } finally {
    spy.restore()
    restoreDom()
  }
})

test('benchmark: keyed append preserves existing rows', async () => {
  const restoreDom = installDom()
  resetDelegation()
  const spy = createDomOperationSpy()

  try {
    const { store, view } = await renderBenchmarkTable(`proxy-${Date.now()}-append`)
    store.data = buildRows(1000)
    await flushMicrotasks()

    const tbody = getTableBody(view)
    const rowsBefore = getRows(tbody)

    spy.trackContainer(tbody)
    spy.reset()

    await timed(
      'append 1k to 1k',
      async () => {
        // v2: push triggers wrapped array _notify()
        store.data.push(...buildRows(1000, 1001))
        await flushMicrotasks()
      },
      1800,
    )

    const rowsAfter = getRows(tbody)
    assert.equal(rowsAfter.length, 2000)
    for (let index = 0; index < rowsBefore.length; index++) {
      assert.equal(rowsAfter[index], rowsBefore[index])
    }
    // v2 keyed list uses insertBefore(fragment, anchor) for append — 1 container insertBefore
    assert.ok(spy.counts.containerInsertBeforeCalls <= 1, 'at most 1 container insertBefore for fragment')
    assert.equal(spy.counts.containerRemoveChildCalls, 0)
    assert.equal(spy.counts.containerInnerHTMLSetCalls, 0)
    assert.equal(spy.counts.containerTextContentSetCalls, 0)
  } finally {
    spy.restore()
    restoreDom()
  }
})

test('benchmark: simulate 08_create1k-after1k_x2 preserving prior identities', async () => {
  const restoreDom = installDom()
  resetDelegation()
  const spy = createDomOperationSpy()

  try {
    const { store, view } = await renderBenchmarkTable(`proxy-${Date.now()}-append-x2`)
    store.data = buildRows(1000)
    await flushMicrotasks()

    const tbody = getTableBody(view)
    const rowsBefore = getRows(tbody)

    spy.trackContainer(tbody)
    spy.reset()

    let rebuiltRows: HTMLTableRowElement[] = []

    await timed(
      '08_create1k-after1k x2',
      async () => {
        store.data.push(...buildRows(1000, 1001))
        await flushMicrotasks()
        const rowsAfterFirstAppend = getRows(tbody)
        for (let index = 0; index < rowsBefore.length; index++) {
          assert.equal(rowsAfterFirstAppend[index], rowsBefore[index])
        }

        store.data = buildRows(1000)
        await flushMicrotasks()
        rebuiltRows = getRows(tbody)

        spy.reset()
        store.data.push(...buildRows(1000, 1001))
        await flushMicrotasks()
      },
      3500,
    )

    const rowsAfterSecondAppend = getRows(tbody)
    assert.equal(rowsAfterSecondAppend.length, 2000)
    for (let index = 0; index < rebuiltRows.length; index++) {
      assert.equal(rowsAfterSecondAppend[index], rebuiltRows[index])
    }
    assert.equal(spy.counts.containerRemoveChildCalls, 0)
    assert.equal(spy.counts.containerInnerHTMLSetCalls, 0)
    assert.equal(spy.counts.containerTextContentSetCalls, 0)
  } finally {
    spy.restore()
    restoreDom()
  }
})

test('benchmark: disjoint keyed replace recreates rows', async () => {
  const restoreDom = installDom()
  resetDelegation()
  const spy = createDomOperationSpy()

  try {
    const { store, view } = await renderBenchmarkTable(`proxy-${Date.now()}-replace`)
    store.data = buildRows(1000)
    await flushMicrotasks()

    const tbody = getTableBody(view)
    const rowsBefore = getRows(tbody)
    const rowSetBefore = new Set(rowsBefore)

    spy.trackContainer(tbody)
    spy.reset()

    await timed(
      'replace 1k rows',
      async () => {
        store.data = buildRows(1000, 2001)
        await flushMicrotasks()
      },
      1200,
    )

    const rowsAfter = getRows(tbody)
    assert.equal(rowsAfter.length, 1000)
    assert.notEqual(rowsAfter[0], rowsBefore[0])
    for (const row of rowsAfter) assert.ok(!rowSetBefore.has(row))
  } finally {
    spy.restore()
    restoreDom()
  }
})

test('benchmark: same-key replace preserves row identity and avoids structural churn', async () => {
  const restoreDom = installDom()
  resetDelegation()
  const spy = createDomOperationSpy()

  try {
    const { store, view } = await renderBenchmarkTable(`proxy-${Date.now()}-same-key-replace`)
    store.data = buildRows(1000)
    await flushMicrotasks()

    const tbody = getTableBody(view)
    const rowsBefore = getRows(tbody)

    spy.trackContainer(tbody)
    spy.reset()

    await timed(
      'replace 1k rows with same keys (in-place label mutation)',
      async () => {
        // v2: mutate item.label directly — same-key replace must use in-place mutation
        for (let index = 0; index < store.data.length; index++) {
          store.data[index].label = `updated ${store.data[index].id}`
        }
        await flushMicrotasks()
      },
      1200,
    )

    const rowsAfter = getRows(tbody)
    assert.equal(rowsAfter.length, 1000)
    for (let index = 0; index < rowsAfter.length; index++) {
      assert.equal(rowsAfter[index], rowsBefore[index])
    }
    assert.equal(rowsAfter[0]?.children[1]?.textContent, 'updated 1')
    assert.equal(rowsAfter[999]?.children[1]?.textContent, 'updated 1000')
    assert.equal(spy.counts.containerAppendChildCalls, 0)
    assert.equal(spy.counts.containerInsertBeforeCalls, 0)
    assert.equal(spy.counts.containerRemoveChildCalls, 0)
    assert.equal(spy.counts.containerInnerHTMLSetCalls, 0)
    assert.equal(spy.counts.containerTextContentSetCalls, 0)
  } finally {
    spy.restore()
    restoreDom()
  }
})

test('benchmark: clear uses container clear path without structural churn', async () => {
  const restoreDom = installDom()
  resetDelegation()
  const spy = createDomOperationSpy()

  try {
    const { store, view } = await renderBenchmarkTable(`proxy-${Date.now()}-clear`)
    store.data = buildRows(1000)
    await flushMicrotasks()

    const tbody = getTableBody(view)
    spy.trackContainer(tbody)
    spy.reset()

    await timed(
      'clear 1k rows',
      async () => {
        store.data = []
        await flushMicrotasks()
      },
      700,
    )

    assert.equal(getRows(tbody).length, 0)
    // v2 keyed list clear: removes each node individually (not textContent='')
    // to avoid destroying sibling nodes from conditional branches sharing the parent.
    assert.equal(spy.counts.containerInsertBeforeCalls, 0)
    assert.equal(spy.counts.containerRemoveChildCalls, 1000, 'each row removed individually')
  } finally {
    spy.restore()
    restoreDom()
  }
})

test('benchmark: simulate 09_clear1k_x8 using the same clear path repeatedly', async () => {
  const restoreDom = installDom()
  resetDelegation()
  const spy = createDomOperationSpy()

  try {
    const { store, view } = await renderBenchmarkTable(`proxy-${Date.now()}-clear-x8`)
    const tbody = getTableBody(view)
    spy.trackContainer(tbody)

    await timed(
      '09_clear1k x8',
      async () => {
        for (let iteration = 0; iteration < 8; iteration++) {
          store.data = buildRows(1000, iteration * 1000 + 1)
          await flushMicrotasks()
          spy.reset()
          store.data = []
          await flushMicrotasks()

          assert.equal(getRows(tbody).length, 0)
          // v2 keyed list clear: removes each node individually (not textContent='')
          assert.equal(spy.counts.containerInsertBeforeCalls, 0)
          assert.equal(spy.counts.containerRemoveChildCalls, 1000, 'each row removed individually')
        }
      },
      4500,
    )
  } finally {
    spy.restore()
    restoreDom()
  }
})
