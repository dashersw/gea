/**
 * Wall-clock budgets are loose enough for full-workspace `npm test` runs (parallel packages + CPU contention).
 * For tight regression signal, run this file in isolation.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { JSDOM } from 'jsdom'

import { geaPlugin } from '../src/index'
import { buildEvalPrelude, mergeEvalBindings } from './helpers/compile'

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0)
  const cancelAnimationFrame = (id: number) => clearTimeout(id)

  dom.window.requestAnimationFrame = requestAnimationFrame
  dom.window.cancelAnimationFrame = cancelAnimationFrame

  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Element: globalThis.Element,
    Node: globalThis.Node,
    NodeFilter: globalThis.NodeFilter,
    MutationObserver: globalThis.MutationObserver,
    Event: globalThis.Event,
    CustomEvent: globalThis.CustomEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  }

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    MutationObserver: dom.window.MutationObserver,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    requestAnimationFrame,
    cancelAnimationFrame,
  })

  return () => {
    Object.assign(globalThis, previous)
    dom.window.close()
  }
}

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function compileJsxComponent(source: string, id: string, className: string, bindings: Record<string, unknown>) {
  const allBindings = mergeEvalBindings(bindings)
  const plugin = geaPlugin()
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
  const result = await transform?.call({} as never, source, id)
  assert.ok(result)

  const code = typeof result === 'string' ? result : result.code
  const compiledSource = `${buildEvalPrelude()}${code
    .replace(/^import .*;$/gm, '')
    .replaceAll('import.meta.hot', 'undefined')
    .replaceAll('import.meta.url', '""')
    .replace(/export default class\s+/, 'class ')}
return ${className};`

  return new Function(...Object.keys(allBindings), compiledSource)(...Object.values(allBindings))
}

async function loadRuntimeModules(seed: string) {
  const { default: ComponentManager } = await import('../../gea/src/lib/base/component-manager')
  ComponentManager.instance = undefined
  const [compMod, storeMod] = await Promise.all([
    import(`../../gea/src/lib/base/component.tsx?${seed}`),
    import(`../../gea/src/lib/store.ts?${seed}`),
  ])
  return [compMod, storeMod] as const
}

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
  const store = new Store({ data: [] as Array<{ id: number; label: string }> })

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

function updateEveryTenth(rows: Array<{ id: number; label: string }>, iteration: number) {
  for (let index = 0; index < rows.length; index += 10) {
    rows[index].label = `updated ${iteration}-${index}`
  }
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

test('benchmark proxy: partial update preserves row identity and avoids structural DOM ops', async () => {
  const restoreDom = installDom()
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

test('benchmark proxy: simulate 03_update10th1k_x16 without structural DOM churn', async () => {
  const restoreDom = installDom()
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
          updateEveryTenth(store.data, iteration)
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

test('benchmark proxy: keyed remove deletes one row without bulk container rewrites', async () => {
  const restoreDom = installDom()
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
    assert.equal(spy.counts.containerInsertBeforeCalls, 0)
    assert.equal(spy.counts.containerInnerHTMLSetCalls, 0)
    assert.equal(spy.counts.containerTextContentSetCalls, 0)
    assert.ok(spy.counts.removeCalls <= 1)
    assert.ok(spy.counts.containerRemoveChildCalls <= 1)
  } finally {
    spy.restore()
    restoreDom()
  }
})

test('benchmark proxy: keyed append preserves existing rows and appends at container once', async () => {
  const restoreDom = installDom()
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
    assert.ok(spy.counts.containerAppendChildCalls <= 1)
    assert.equal(spy.counts.containerInsertBeforeCalls, 0)
    assert.equal(spy.counts.containerRemoveChildCalls, 0)
    assert.equal(spy.counts.containerInnerHTMLSetCalls, 0)
    assert.equal(spy.counts.containerTextContentSetCalls, 0)
  } finally {
    spy.restore()
    restoreDom()
  }
})

test('benchmark proxy: simulate 08_create1k-after1k_x2 preserving prior identities', async () => {
  const restoreDom = installDom()
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
    assert.equal(spy.counts.containerInsertBeforeCalls, 0)
    assert.equal(spy.counts.containerRemoveChildCalls, 0)
    assert.equal(spy.counts.containerInnerHTMLSetCalls, 0)
    assert.equal(spy.counts.containerTextContentSetCalls, 0)
  } finally {
    spy.restore()
    restoreDom()
  }
})

test('benchmark proxy: disjoint keyed replace recreates rows without per-row moves', async () => {
  const restoreDom = installDom()
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
    assert.equal(spy.counts.containerInsertBeforeCalls, 0)
    assert.equal(spy.counts.containerAppendChildCalls, 0)
  } finally {
    spy.restore()
    restoreDom()
  }
})

test('benchmark proxy: same-key replace preserves row identity and avoids structural churn', async () => {
  const restoreDom = installDom()
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
      'replace 1k rows with same keys',
      async () => {
        store.data = buildRows(1000).map((row) => ({ ...row, label: `updated ${row.id}` }))
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

test('benchmark proxy: clear uses container clear path without structural churn', async () => {
  const restoreDom = installDom()
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
    assert.equal(spy.counts.containerAppendChildCalls, 0)
    assert.equal(spy.counts.containerInsertBeforeCalls, 0)
    assert.equal(spy.counts.containerRemoveChildCalls, 0)
  } finally {
    spy.restore()
    restoreDom()
  }
})

test('benchmark proxy: simulate 09_clear1k_x8 using the same clear path repeatedly', async () => {
  const restoreDom = installDom()
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
          assert.equal(spy.counts.containerAppendChildCalls, 0)
          assert.equal(spy.counts.containerInsertBeforeCalls, 0)
          assert.equal(spy.counts.containerRemoveChildCalls, 0)
        }
      },
      4500,
    )
  } finally {
    spy.restore()
    restoreDom()
  }
})
