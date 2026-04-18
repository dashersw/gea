import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { JSDOM } from 'jsdom'

import { createBenchmarkHistoryEntry } from '../../../scripts/benchmark-history.mjs'
import { GEA_PROXY_GET_TARGET } from '../../gea/src/lib/symbols'
import { compileJsxComponent, loadRuntimeModules } from './helpers/compile'

const __dirname = dirname(fileURLToPath(import.meta.url))

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  dom.window.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0)
  dom.window.cancelAnimationFrame = (id: number) => clearTimeout(id)

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
    requestAnimationFrame: dom.window.requestAnimationFrame,
    cancelAnimationFrame: dom.window.cancelAnimationFrame,
  })

  return () => {
    Object.assign(globalThis, previous)
    dom.window.close()
  }
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}

async function cleanupDelay() {
  await new Promise((resolve) => setTimeout(resolve, 50))
}

function buildRows(count: number, startId = 1) {
  return Array.from({ length: count }, (_, i) => ({ id: startId + i, label: `row ${startId + i}` }))
}

// ---------------------------------------------------------------------------
// Vanilla baseline — matches the DOM structure of our gea component
// ---------------------------------------------------------------------------

const rowTemplate = (() => {
  const tr = (() => {
    try {
      return document.createElement('tr')
    } catch {
      return null
    }
  })()
  if (tr) tr.innerHTML = '<td> </td><td> </td>'
  return tr
})()

function ensureTemplate() {
  if (rowTemplate) return rowTemplate
  const tr = document.createElement('tr')
  tr.innerHTML = '<td> </td><td> </td>'
  return tr
}

function vanillaCreateRow(tmpl: HTMLElement, id: number, label: string) {
  const tr = tmpl.cloneNode(true) as HTMLElement
  tr.firstChild!.firstChild!.nodeValue = String(id)
  tr.firstChild!.nextSibling!.firstChild!.nodeValue = label
  return tr
}

class VanillaBench {
  tbody: HTMLElement
  rows: HTMLElement[] = []
  data: Array<{ id: number; label: string }> = []
  tmpl: HTMLElement

  constructor(tbody: HTMLElement) {
    this.tbody = tbody
    this.tmpl = ensureTemplate()
  }

  populate(count: number, startId = 1) {
    this.rows = []
    this.data = []
    this.tbody.textContent = ''
    const detached = !this.tbody.parentNode
    if (!detached) this.tbody.remove()
    for (let i = 0; i < count; i++) {
      const id = startId + i
      const label = `row ${id}`
      const tr = vanillaCreateRow(this.tmpl, id, label)
      this.rows.push(tr)
      this.data.push({ id, label })
      this.tbody.appendChild(tr)
    }
    if (!detached) document.body.appendChild(this.tbody)
  }

  update() {
    for (let i = 0; i < this.data.length; i += 10) {
      this.data[i].label += ' !!!'
      this.rows[i].firstChild!.nextSibling!.firstChild!.nodeValue = this.data[i].label
    }
  }

  swap() {
    if (this.data.length <= 998) return
    this.tbody.insertBefore(this.rows[998], this.rows[2])
    this.tbody.insertBefore(this.rows[1], this.rows[999])
    const tmp = this.rows[998]
    this.rows[998] = this.rows[1]
    this.rows[1] = tmp
    const tmpd = this.data[998]
    this.data[998] = this.data[1]
    this.data[1] = tmpd
  }

  removeRow(idx: number) {
    this.rows[idx].remove()
    this.rows.splice(idx, 1)
    this.data.splice(idx, 1)
  }

  clear() {
    this.tbody.textContent = ''
    this.rows = []
    this.data = []
  }

  append(count: number, startId: number) {
    for (let i = 0; i < count; i++) {
      const id = startId + i
      const label = `row ${id}`
      const tr = vanillaCreateRow(this.tmpl, id, label)
      this.rows.push(tr)
      this.data.push({ id, label })
      this.tbody.appendChild(tr)
    }
  }

  replace(count: number, startId: number) {
    this.tbody.textContent = ''
    this.rows = []
    this.data = []
    for (let i = 0; i < count; i++) {
      const id = startId + i
      const label = `row ${id}`
      const tr = vanillaCreateRow(this.tmpl, id, label)
      this.rows.push(tr)
      this.data.push({ id, label })
      this.tbody.appendChild(tr)
    }
  }
}

class VanillaClassToggleBench {
  tbody: HTMLElement
  rows: HTMLElement[] = []
  activeRow: HTMLElement | null = null

  constructor(tbody: HTMLElement) {
    this.tbody = tbody
  }

  populate(items: string[]) {
    this.tbody.textContent = ''
    this.rows = []
    this.activeRow = null
    const fragment = document.createDocumentFragment()
    for (let i = 0; i < items.length; i++) {
      const row = document.createElement('div')
      row.className = 'card'
      row.textContent = items[i]
      this.rows.push(row)
      fragment.appendChild(row)
    }
    this.tbody.appendChild(fragment)
  }

  setActive(index: number) {
    if (this.activeRow) this.activeRow.className = 'card'
    this.activeRow = this.rows[index] || null
    if (this.activeRow) this.activeRow.className = 'card active'
  }
}

class VanillaDerivedFilterBench {
  tbody: HTMLElement
  data: Array<{ id: number; label: string; active: boolean }> = []
  rows = new Map<number, HTMLElement>()

  constructor(tbody: HTMLElement) {
    this.tbody = tbody
  }

  populate(items: Array<{ id: number; label: string; active: boolean }>) {
    this.data = items.map((item) => ({ ...item }))
    this.rows.clear()
    this.tbody.textContent = ''
    const fragment = document.createDocumentFragment()
    for (const item of this.data) {
      if (!item.active) continue
      const row = document.createElement('tr')
      row.innerHTML = `<td>${item.label}</td>`
      this.rows.set(item.id, row)
      fragment.appendChild(row)
    }
    this.tbody.appendChild(fragment)
  }

  setActive(index: number, active: boolean) {
    const item = this.data[index]
    item.active = active
    const existing = this.rows.get(item.id) || null

    if (active) {
      if (existing) return
      const row = document.createElement('tr')
      row.innerHTML = `<td>${item.label}</td>`
      this.rows.set(item.id, row)

      let nextVisible: HTMLElement | null = null
      for (let i = index + 1; i < this.data.length; i++) {
        if (!this.data[i].active) continue
        nextVisible = this.rows.get(this.data[i].id) || null
        if (nextVisible) break
      }
      this.tbody.insertBefore(row, nextVisible)
      return
    }

    if (existing) {
      existing.remove()
      this.rows.delete(item.id)
    }
  }
}

// ---------------------------------------------------------------------------
// Gea setup
// ---------------------------------------------------------------------------

async function setupGea(seed: string) {
  const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
  const store = new Store({ data: [] as Array<{ id: number; label: string }> })

  const fixturePath = join(__dirname, 'fixtures/benchmark-table.jsx')
  const Cls = await compileJsxComponent(
    `import { Component } from '@geajs/core'
     import store from './benchmark-store.ts'
     export default class T extends Component {
       template() {
         return (
           <table><tbody id="tbody">
             {store.data.map(item => (
               <tr key={item.id}><td>{item.id}</td><td>{item.label}</td></tr>
             ))}
           </tbody></table>
         )
       }
     }`,
    fixturePath,
    'T',
    { Component, store },
  )

  const root = document.createElement('div')
  document.body.appendChild(root)
  const view = new Cls()
  view.render(root)
  return { store, view, root }
}

async function setupUnresolvedPropMapGea(seed: string, items: string[]) {
  const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
  const store = new Store({ activeId: null as string | null })

  const fixturePath = join(__dirname, 'fixtures/benchmark-unresolved-props.jsx')
  const Cls = await compileJsxComponent(
    `import { Component } from '@geajs/core'
     import store from './benchmark-store.ts'
     export default class T extends Component {
       template({ items }) {
         return (
           <div class="body">
             {items.map(item => (
               <div key={item} class={\`card \${store.activeId === item ? 'active' : ''}\`}>
                 {item}
               </div>
             ))}
           </div>
         )
       }
     }`,
    fixturePath,
    'T',
    { Component, store },
  )

  const root = document.createElement('div')
  document.body.appendChild(root)
  const view = new Cls({ items })
  view.render(root)
  return { store, view, root }
}

function buildFilterToggleRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    label: `row ${i + 1}`,
    active: i % 2 === 0,
  }))
}

async function setupHelperDerivedFilterMapGea(
  seed: string,
  items: Array<{ id: number; label: string; active: boolean }>,
) {
  const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
  const store = new Store({ items: items.map((item) => ({ ...item })) })

  const fixturePath = join(__dirname, 'fixtures/benchmark-derived-filter.jsx')
  const Cls = await compileJsxComponent(
    `import { Component } from '@geajs/core'
     import store from './benchmark-store.ts'
     export default class T extends Component {
       getDisplayData() {
         return store.items.filter(item => item.active)
       }
       template() {
         const displayData = this.getDisplayData()
         return (
           <table><tbody>
             {displayData.map(item => (
               <tr key={item.id}><td>{item.label}</td></tr>
             ))}
           </tbody></table>
         )
       }
     }`,
    fixturePath,
    'T',
    { Component, store },
  )

  const root = document.createElement('div')
  document.body.appendChild(root)
  const view = new Cls()
  view.render(root)
  await flush()
  return { store, view, root }
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

const WARMUP = 5
const RUNS = 21

function buildStringItems(count: number, startId = 1) {
  return Array.from({ length: count }, (_, i) => String(startId + i))
}

function median(arr: number[]) {
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

interface SimResult {
  vanilla: number
  gea: number
  slowdown: number
}

const recordedResults: Record<string, SimResult> = {}

function report(name: string, r: SimResult) {
  recordedResults[name] = r
  const color = r.slowdown <= 1.5 ? '🟢' : r.slowdown <= 3 ? '🟡' : '🔴'
  console.log(
    `    ${color} ${name.padEnd(24)} vanilla ${r.vanilla.toFixed(2).padStart(8)}ms   ` +
      `gea ${r.gea.toFixed(2).padStart(8)}ms   slowdown ${r.slowdown.toFixed(2)}x`,
  )
}

after(() => {
  if (process.env.BENCHMARK_HISTORY_WRITE !== '1') return
  if (Object.keys(recordedResults).length === 0) return

  const repoRoot = join(__dirname, '../../..')
  createBenchmarkHistoryEntry({
    suite: 'benchmark-simulation',
    source: 'simulation',
    changeSummary: process.env.BENCHMARK_CHANGE_SUMMARY || 'manual benchmark simulation run',
    config: {
      warmup: WARMUP,
      runs: RUNS,
    },
    results: recordedResults,
    historyPath: join(repoRoot, 'benchmark-history', 'benchmark-simulation.jsonl'),
    latestPath: join(repoRoot, 'benchmark-history', 'benchmark-simulation.latest.json'),
  })
})

// ---------------------------------------------------------------------------
// Benchmark simulations
// ---------------------------------------------------------------------------
//
// This suite runs the same operations in JSDOM for both vanilla DOM and gea
// (compiled component + store) and reports gea/vanilla slowdown ratios.
// It finishes in ~5–6s vs ~5min for the full browser benchmark.
//
// RELIABILITY:
// - Ratios do NOT match the real benchmark numerically. In the browser, DOM/
//   layout/paint dominate, so gea is only ~1.1–1.5x slower than vanilla. In
//   JSDOM, vanilla DOM is cheap, so ratios are much higher (2–18x). That’s
//   expected.
// - Use the simulation for: (1) regression checks — re-run after a change and
//   compare ratios; a big jump (e.g. remove row 1.8x → 15x) indicates a regression.
//   (2) Relative ordering — which operations are costliest for gea (e.g.
//   partial update vs remove row) correlates with real benchmark ordering.
// - For final numbers and cross-framework comparison, run the full benchmark
//   and the report (see skills/js-framework-benchmark-report/SKILL.md).
//

describe('benchmark simulation: gea vs vanilla slowdown', () => {
  test('01 create rows (1k)', async () => {
    const restoreDom = installDom()
    try {
      const vanilla = new VanillaBench(document.createElement('tbody'))
      document.body.appendChild(vanilla.tbody)
      const { store, root } = await setupGea(`sim-create-${Date.now()}`)

      const vTimes: number[] = []
      const eTimes: number[] = []

      for (let run = 0; run < WARMUP + RUNS; run++) {
        vanilla.clear()
        const v0 = performance.now()
        vanilla.populate(1000)
        const v1 = performance.now()

        store.data = []
        await flush()
        const e0 = performance.now()
        store.data = buildRows(1000)
        await flush()
        const e1 = performance.now()

        if (run >= WARMUP) {
          vTimes.push(v1 - v0)
          eTimes.push(e1 - e0)
        }
      }

      const r: SimResult = { vanilla: median(vTimes), gea: median(eTimes), slowdown: median(eTimes) / median(vTimes) }
      report('create rows', r)
      const rowCount = root.querySelectorAll('tbody tr').length
      assert.equal(rowCount, 1000, `expected 1000 rows, got ${rowCount}`)
    } finally {
      await cleanupDelay()
      restoreDom()
    }
  })

  test('02 replace all rows (1k)', async () => {
    const restoreDom = installDom()
    try {
      const vanilla = new VanillaBench(document.createElement('tbody'))
      document.body.appendChild(vanilla.tbody)
      vanilla.populate(1000)
      const { store } = await setupGea(`sim-replace-${Date.now()}`)
      store.data = buildRows(1000)
      await flush()

      const vTimes: number[] = []
      const eTimes: number[] = []

      for (let run = 0; run < WARMUP + RUNS; run++) {
        const startId = (run + 1) * 2000 + 1
        const v0 = performance.now()
        vanilla.replace(1000, startId)
        const v1 = performance.now()

        const e0 = performance.now()
        store.data = buildRows(1000, startId + 1000)
        await flush()
        const e1 = performance.now()

        if (run >= WARMUP) {
          vTimes.push(v1 - v0)
          eTimes.push(e1 - e0)
        }
      }

      const r: SimResult = { vanilla: median(vTimes), gea: median(eTimes), slowdown: median(eTimes) / median(vTimes) }
      report('replace all rows', r)
    } finally {
      await cleanupDelay()
      restoreDom()
    }
  })

  test('03 partial update (1k, every 10th)', async () => {
    const restoreDom = installDom()
    try {
      const vanilla = new VanillaBench(document.createElement('tbody'))
      document.body.appendChild(vanilla.tbody)
      vanilla.populate(1000)
      const { store } = await setupGea(`sim-partial-${Date.now()}`)
      store.data = buildRows(1000)
      await flush()

      const vTimes: number[] = []
      const eTimes: number[] = []

      for (let run = 0; run < WARMUP + RUNS; run++) {
        const v0 = performance.now()
        vanilla.update()
        const v1 = performance.now()

        const e0 = performance.now()
        for (let i = 0; i < store.data.length; i += 10) {
          store.data[i].label += ' !!!'
        }
        await flush()
        const e1 = performance.now()

        if (run >= WARMUP) {
          vTimes.push(v1 - v0)
          eTimes.push(e1 - e0)
        }
      }

      const r: SimResult = { vanilla: median(vTimes), gea: median(eTimes), slowdown: median(eTimes) / median(vTimes) }
      report('partial update', r)
    } finally {
      await cleanupDelay()
      restoreDom()
    }
  })

  test('04 select row', async () => {
    const restoreDom = installDom()
    try {
      const [{ default: Component }, { Store }] = await loadRuntimeModules(`sim-select-${Date.now()}`)
      const store = new Store({ data: [] as Array<{ id: number; label: string }>, selected: 0 })
      const selectRowFixturePath = join(__dirname, 'fixtures/benchmark-select-row.jsx')

      const Cls = await compileJsxComponent(
        `import { Component } from '@geajs/core'
         import store from './benchmark-store.ts'
         export default class T extends Component {
           template() {
             return (
               <table><tbody id="tbody">
                 {store.data.map(item => (
                   <tr key={item.id} class={store.selected === item.id ? 'danger' : ''}>
                     <td>{item.id}</td><td>{item.label}</td>
                   </tr>
                 ))}
               </tbody></table>
             )
           }
         }`,
        selectRowFixturePath,
        'T',
        { Component, store },
      )

      const root = document.createElement('div')
      document.body.appendChild(root)
      const view = new Cls()
      view.render(root)

      store.data = buildRows(1000)
      await flush()

      const vanilla = new VanillaBench(document.createElement('tbody'))
      document.body.appendChild(vanilla.tbody)
      vanilla.populate(1000)
      let vanillaSelected: HTMLElement | null = null

      const vTimes: number[] = []
      const eTimes: number[] = []

      for (let run = 0; run < WARMUP + RUNS; run++) {
        const selectId = (run % 1000) + 1

        const v0 = performance.now()
        if (vanillaSelected) vanillaSelected.className = ''
        vanillaSelected = vanilla.rows[selectId - 1]
        vanillaSelected.className = 'danger'
        const v1 = performance.now()

        const e0 = performance.now()
        store.selected = selectId
        ;(store as any).flushSync()
        const e1 = performance.now()

        if (run >= WARMUP) {
          vTimes.push(v1 - v0)
          eTimes.push(e1 - e0)
        }
      }

      const r: SimResult = { vanilla: median(vTimes), gea: median(eTimes), slowdown: median(eTimes) / median(vTimes) }
      report('select row', r)
    } finally {
      await cleanupDelay()
      restoreDom()
    }
  })

  test('04b comprehensive call profile — all benchmark ops', async () => {
    const restoreDom = installDom()
    try {
      const seed = `sim-callcount-all-${Date.now()}`
      const [{ default: Component }, storeModule] = await loadRuntimeModules(seed)
      const { Store, _getBrowserRootProxyHandler } = storeModule as any
      const store = new Store({ data: [] as Array<{ id: number; label: string }>, selected: 0 })
      const fixturePath = join(__dirname, 'fixtures/benchmark-select-row.jsx')

      const Cls = await compileJsxComponent(
        `import { Component } from '@geajs/core'
         import store from './benchmark-store.ts'
         export default class T extends Component {
           template() {
             return (
               <table><tbody id="tbody">
                 {store.data.map(item => (
                   <tr key={item.id} class={store.selected === item.id ? 'danger' : ''}>
                     <td>{item.id}</td><td>{item.label}</td>
                   </tr>
                 ))}
               </tbody></table>
             )
           }
         }`,
        fixturePath,
        'T',
        { Component, store },
      )

      const root = document.createElement('div')
      document.body.appendChild(root)
      const view = new Cls()
      view.render(root)
      store.data = buildRows(1000)
      await flush()
      store.selected = 1
      await flush()

      let proxyGetCalls = 0,
        proxySetCalls = 0
      const handler = _getBrowserRootProxyHandler()
      const origHandlerGet = handler.get
      const origHandlerSet = handler.set
      handler.get = function (...args: any[]) {
        proxyGetCalls++
        return origHandlerGet.apply(this, args)
      }
      handler.set = function (...args: any[]) {
        proxySetCalls++
        return origHandlerSet.apply(this, args)
      }

      let getByIdCalls = 0
      const origGetById = document.getElementById.bind(document)
      document.getElementById = (id: string) => {
        getByIdCalls++
        return origGetById(id)
      }

      const elProto = (window as any).Element.prototype
      const nodeProto = (window as any).Node.prototype

      let cnGet = 0,
        cnSet = 0
      const cnDesc = Object.getOwnPropertyDescriptor(elProto, 'className')!
      Object.defineProperty(elProto, 'className', {
        get() {
          cnGet++
          return cnDesc.get!.call(this)
        },
        set(v: string) {
          cnSet++
          cnDesc.set!.call(this, v)
        },
        configurable: true,
      })

      let tcSet = 0
      const tcDesc =
        Object.getOwnPropertyDescriptor(nodeProto, 'textContent') ||
        Object.getOwnPropertyDescriptor(elProto, 'textContent')
      if (tcDesc) {
        Object.defineProperty(nodeProto, 'textContent', {
          get() {
            return tcDesc.get!.call(this)
          },
          set(v: string) {
            tcSet++
            tcDesc.set!.call(this, v)
          },
          configurable: true,
        })
      }

      let insertBeforeCalls = 0
      const origInsertBefore = nodeProto.insertBefore
      nodeProto.insertBefore = function (...args: any[]) {
        insertBeforeCalls++
        return origInsertBefore.apply(this, args)
      }

      let childrenGet = 0
      const childrenDesc =
        Object.getOwnPropertyDescriptor((window as any).HTMLElement.prototype, 'children') ||
        Object.getOwnPropertyDescriptor(elProto, 'children')
      if (childrenDesc) {
        Object.defineProperty(elProto, 'children', {
          get() {
            childrenGet++
            return childrenDesc.get!.call(this)
          },
          configurable: true,
        })
      }

      let appendChildCalls = 0
      const origAppendChild = nodeProto.appendChild
      nodeProto.appendChild = function (...args: any[]) {
        appendChildCalls++
        return origAppendChild.apply(this, args)
      }

      let removeCalls = 0
      const origRemove = elProto.remove
      if (origRemove) {
        elProto.remove = function () {
          removeCalls++
          return origRemove.call(this)
        }
      }

      let cloneNodeCalls = 0
      const origCloneNode = nodeProto.cloneNode
      nodeProto.cloneNode = function (...args: any[]) {
        cloneNodeCalls++
        return origCloneNode.apply(this, args)
      }

      let idSet = 0
      const idDesc = Object.getOwnPropertyDescriptor(elProto, 'id')
      if (idDesc && idDesc.set) {
        Object.defineProperty(elProto, 'id', {
          get() {
            return idDesc.get!.call(this)
          },
          set(v: string) {
            idSet++
            idDesc.set!.call(this, v)
          },
          configurable: true,
        })
      }

      let innerHTMLSet = 0
      const innerHTMLDesc = Object.getOwnPropertyDescriptor(elProto, 'innerHTML')
      if (innerHTMLDesc && innerHTMLDesc.set) {
        Object.defineProperty(elProto, 'innerHTML', {
          get() {
            return innerHTMLDesc.get!.call(this)
          },
          set(v: string) {
            innerHTMLSet++
            innerHTMLDesc.set!.call(this, v)
          },
          configurable: true,
        })
      }

      let nodeValueSet = 0
      const nvDesc = Object.getOwnPropertyDescriptor(nodeProto, 'nodeValue')
      if (nvDesc && nvDesc.set) {
        Object.defineProperty(nodeProto, 'nodeValue', {
          get() {
            return nvDesc.get!.call(this)
          },
          set(v: string) {
            nodeValueSet++
            nvDesc.set!.call(this, v)
          },
          configurable: true,
        })
      }

      interface ProfileResult {
        proxyGet: number
        proxySet: number
        dom: number
        domDetail: Record<string, number>
        total: number
      }

      const results: Record<string, ProfileResult> = {}

      function reset() {
        proxyGetCalls = proxySetCalls = 0
        getByIdCalls = cnGet = cnSet = tcSet = 0
        insertBeforeCalls = childrenGet = 0
        appendChildCalls = removeCalls = cloneNodeCalls = 0
        idSet = innerHTMLSet = nodeValueSet = 0
      }

      function capture(label: string): ProfileResult {
        const domDetail: Record<string, number> = {}
        if (getByIdCalls) domDetail.getElementById = getByIdCalls
        if (cnGet) domDetail['className.get'] = cnGet
        if (cnSet) domDetail['className.set'] = cnSet
        if (tcSet) domDetail['textContent.set'] = tcSet
        if (nodeValueSet) domDetail['nodeValue.set'] = nodeValueSet
        if (insertBeforeCalls) domDetail.insertBefore = insertBeforeCalls
        if (childrenGet) domDetail['children.get'] = childrenGet
        if (appendChildCalls) domDetail.appendChild = appendChildCalls
        if (removeCalls) domDetail['remove()'] = removeCalls
        if (cloneNodeCalls) domDetail.cloneNode = cloneNodeCalls
        if (idSet) domDetail['id.set'] = idSet
        if (innerHTMLSet) domDetail['innerHTML.set'] = innerHTMLSet
        const domTotal = Object.values(domDetail).reduce((s, v) => s + v, 0)
        const total = proxyGetCalls + proxySetCalls + domTotal
        const r: ProfileResult = {
          proxyGet: proxyGetCalls,
          proxySet: proxySetCalls,
          dom: domTotal,
          domDetail,
          total,
        }
        results[label] = r
        return r
      }

      function reportAll() {
        console.log('\n╔═══════════════════════╤════════╤════════╤════════╤════════╗')
        console.log('║ Operation             │ proxy  │ proxy  │  DOM   │ TOTAL  ║')
        console.log('║                       │  .get  │  .set  │        │        ║')
        console.log('╠═══════════════════════╪════════╪════════╪════════╪════════╣')
        for (const [label, r] of Object.entries(results)) {
          console.log(
            `║ ${label.padEnd(21)} │ ${String(r.proxyGet).padStart(6)} │ ${String(r.proxySet).padStart(6)} │ ${String(r.dom).padStart(6)} │ ${String(r.total).padStart(6)} ║`,
          )
        }
        console.log('╚═══════════════════════╧════════╧════════╧════════╧════════╝')
        for (const [label, r] of Object.entries(results)) {
          if (!Object.keys(r.domDetail).length) continue
          console.log(`\n--- ${label} ---`)
          console.log(
            '  DOM:',
            Object.entries(r.domDetail)
              .map(([n, c]) => `${n}:${c}`)
              .join(', '),
          )
        }
      }

      // === 1. SELECT ROW ===
      reset()
      store.selected = 5
      await flush()
      capture('SELECT')

      // === 2. SWAP ROWS ===
      reset()
      const d = store.data
      const tmp = d[1]
      d[1] = d[998]
      d[998] = tmp
      await flush()
      capture('SWAP')

      // === 3. PARTIAL UPDATE (every 10th of 1000) ===
      reset()
      for (let i = 0; i < store.data.length; i += 10) {
        store.data[i].label += ' !!!'
      }
      await flush()
      capture('PARTIAL UPDATE')

      // === 4. REMOVE ROW ===
      reset()
      store.data.splice(500, 1)
      await flush()
      capture('REMOVE')

      // === 5. CLEAR ===
      store.data = buildRows(1000)
      await flush()
      store.selected = 1
      await flush()
      reset()
      store.data = []
      await flush()
      capture('CLEAR')

      // === 6. CREATE 1000 (from empty) ===
      reset()
      store.data = buildRows(1000)
      await flush()
      capture('CREATE 1000')

      // === 7. REPLACE 1000 ===
      reset()
      store.data = buildRows(1000, 2000)
      await flush()
      capture('REPLACE 1000')

      // === 8. APPEND 1000 ===
      store.data = buildRows(1000)
      await flush()
      reset()
      store.data.push(...buildRows(1000, 2000))
      await flush()
      capture('APPEND 1000')

      reportAll()

      // Restore all interceptors
      handler.get = origHandlerGet
      handler.set = origHandlerSet
      document.getElementById = origGetById
      Object.defineProperty(elProto, 'className', cnDesc)
      if (tcDesc) Object.defineProperty(nodeProto, 'textContent', tcDesc)
      nodeProto.insertBefore = origInsertBefore
      if (childrenDesc) {
        const target = Object.getOwnPropertyDescriptor((window as any).HTMLElement.prototype, 'children')
          ? (window as any).HTMLElement.prototype
          : elProto
        Object.defineProperty(target, 'children', childrenDesc)
      }
      nodeProto.appendChild = origAppendChild
      if (origRemove) elProto.remove = origRemove
      nodeProto.cloneNode = origCloneNode
      if (idDesc) Object.defineProperty(elProto, 'id', idDesc)
      if (innerHTMLDesc) Object.defineProperty(elProto, 'innerHTML', innerHTMLDesc)
      if (nvDesc) Object.defineProperty(nodeProto, 'nodeValue', nvDesc)
    } finally {
      await cleanupDelay()
      restoreDom()
    }
  })

  test('05 swap rows', async () => {
    const restoreDom = installDom()
    try {
      const vanilla = new VanillaBench(document.createElement('tbody'))
      document.body.appendChild(vanilla.tbody)
      vanilla.populate(1000)
      const { store } = await setupGea(`sim-swap-${Date.now()}`)
      store.data = buildRows(1000)
      await flush()

      const vTimes: number[] = []
      const eTimes: number[] = []

      for (let run = 0; run < WARMUP + RUNS; run++) {
        const v0 = performance.now()
        vanilla.swap()
        const v1 = performance.now()

        const e0 = performance.now()
        const tmp = store.data[1]
        store.data[1] = store.data[998]
        store.data[998] = tmp
        await flush()
        const e1 = performance.now()

        if (run >= WARMUP) {
          vTimes.push(v1 - v0)
          eTimes.push(e1 - e0)
        }
      }

      const r: SimResult = { vanilla: median(vTimes), gea: median(eTimes), slowdown: median(eTimes) / median(vTimes) }
      report('swap rows', r)
    } finally {
      await cleanupDelay()
      restoreDom()
    }
  })

  test('07 remove row', async () => {
    const restoreDom = installDom()
    try {
      const vanilla = new VanillaBench(document.createElement('tbody'))
      document.body.appendChild(vanilla.tbody)
      const { store } = await setupGea(`sim-remove-${Date.now()}`)

      const vTimes: number[] = []
      const eTimes: number[] = []

      for (let run = 0; run < WARMUP + RUNS; run++) {
        vanilla.populate(1000)
        store.data = buildRows(1000)
        await flush()

        const v0 = performance.now()
        vanilla.removeRow(500)
        const v1 = performance.now()

        const e0 = performance.now()
        store.data.splice(500, 1)
        await flush()
        const e1 = performance.now()

        if (run >= WARMUP) {
          vTimes.push(v1 - v0)
          eTimes.push(e1 - e0)
        }
      }

      const r: SimResult = { vanilla: median(vTimes), gea: median(eTimes), slowdown: median(eTimes) / median(vTimes) }
      report('remove row', r)
    } finally {
      await cleanupDelay()
      restoreDom()
    }
  })

  test('08 append rows (1k to 1k)', async () => {
    const restoreDom = installDom()
    try {
      const vanilla = new VanillaBench(document.createElement('tbody'))
      document.body.appendChild(vanilla.tbody)
      const { store } = await setupGea(`sim-append-${Date.now()}`)

      const vTimes: number[] = []
      const eTimes: number[] = []

      for (let run = 0; run < WARMUP + RUNS; run++) {
        vanilla.populate(1000)
        store.data = buildRows(1000)
        await flush()

        const startId = 1001 + run * 1000
        const v0 = performance.now()
        vanilla.append(1000, startId)
        const v1 = performance.now()

        const e0 = performance.now()
        const rawOld = store.data[GEA_PROXY_GET_TARGET] || store.data
        store.data = rawOld.concat(buildRows(1000, startId + 1000))
        await flush()
        const e1 = performance.now()

        if (run >= WARMUP) {
          vTimes.push(v1 - v0)
          eTimes.push(e1 - e0)
        }
      }

      const r: SimResult = { vanilla: median(vTimes), gea: median(eTimes), slowdown: median(eTimes) / median(vTimes) }
      report('append rows', r)
    } finally {
      await cleanupDelay()
      restoreDom()
    }
  })

  test('09 clear rows (1k)', async () => {
    const restoreDom = installDom()
    try {
      const vanilla = new VanillaBench(document.createElement('tbody'))
      document.body.appendChild(vanilla.tbody)
      const { store } = await setupGea(`sim-clear-${Date.now()}`)

      const vTimes: number[] = []
      const eTimes: number[] = []

      for (let run = 0; run < WARMUP + RUNS; run++) {
        vanilla.populate(1000)
        store.data = buildRows(1000)
        await flush()

        const v0 = performance.now()
        vanilla.clear()
        const v1 = performance.now()

        const e0 = performance.now()
        store.data = []
        const p1 = performance.now()
        await flush()
        const e1 = performance.now()

        if (run >= WARMUP) {
          console.log(`run ${run}: set: ${(p1 - e0).toFixed(2)}ms, flush: ${(e1 - p1).toFixed(2)}ms`)
        }

        if (run >= WARMUP) {
          vTimes.push(v1 - v0)
          eTimes.push(e1 - e0)
        }
      }

      const r: SimResult = { vanilla: median(vTimes), gea: median(eTimes), slowdown: median(eTimes) / median(vTimes) }
      report('clear rows', r)
    } finally {
      await cleanupDelay()
      restoreDom()
    }
  })

  test('10 unresolved prop map active-class toggle', async () => {
    const restoreDom = installDom()
    try {
      const vanilla = new VanillaClassToggleBench(document.createElement('div'))
      document.body.appendChild(vanilla.tbody)
      const items = buildStringItems(1000)
      const { store, view } = await setupUnresolvedPropMapGea(`sim-unresolved-props-${Date.now()}`, items)
      vanilla.populate(items)

      await flush()

      const vTimes: number[] = []
      const eTimes: number[] = []

      for (let run = 0; run < WARMUP + RUNS; run++) {
        const activeIndex = run % items.length

        const v0 = performance.now()
        vanilla.setActive(activeIndex)
        const v1 = performance.now()

        const e0 = performance.now()
        store.activeId = items[activeIndex]
        ;(store as any).flushSync()
        const e1 = performance.now()

        if (run >= WARMUP) {
          vTimes.push(v1 - v0)
          eTimes.push(e1 - e0)
        }
      }

      const r: SimResult = { vanilla: median(vTimes), gea: median(eTimes), slowdown: median(eTimes) / median(vTimes) }
      report('unresolved prop toggle', r)
      assert.equal(view.el.querySelectorAll('.body > .card').length, 1000)
      assert.match((view.el.querySelector('.body > .card.active') as HTMLElement | null)?.textContent || '', /^\d+$/)
    } finally {
      await cleanupDelay()
      restoreDom()
    }
  })

  test('11 helper-derived filter toggle', async () => {
    const restoreDom = installDom()
    try {
      const rows = buildFilterToggleRows(1000)
      const vanilla = new VanillaDerivedFilterBench(document.createElement('tbody'))
      document.body.appendChild(vanilla.tbody)
      const { store, root } = await setupHelperDerivedFilterMapGea(`sim-derived-filter-${Date.now()}`, rows)
      vanilla.populate(rows)

      const vTimes: number[] = []
      const eTimes: number[] = []

      for (let run = 0; run < WARMUP + RUNS; run++) {
        const v0 = performance.now()
        vanilla.setActive(1, true)
        const v1 = performance.now()
        vanilla.setActive(1, false)

        const e0 = performance.now()
        store.items[1].active = true
        await flush()
        const e1 = performance.now()
        store.items[1].active = false
        await flush()

        if (run >= WARMUP) {
          vTimes.push(v1 - v0)
          eTimes.push(e1 - e0)
        }
      }

      const r: SimResult = { vanilla: median(vTimes), gea: median(eTimes), slowdown: median(eTimes) / median(vTimes) }
      report('helper-derived filter', r)
      assert.equal(root.querySelectorAll('tbody > tr').length, 500)
    } finally {
      await cleanupDelay()
      restoreDom()
    }
  })

  test('12 clone optimization: static-only vs child-instance component (1k mounts)', async () => {
    const seed = `bench-clone-${Date.now()}-${Math.random()}`
    const restoreDom = installDom()

    try {
      const [{ default: Component }] = await loadRuntimeModules(seed)

      // ── Baseline: static-only component (no child instances) ──
      const staticSource = `
        import { Component } from '@geajs/core'
        export default class StaticComp extends Component {
          template() {
            return (
              <div class="static">
                <h1>Title</h1>
                <p>paragraph</p>
                <span>footer</span>
              </div>
            )
          }
        }
      `
      const StaticComp = await compileJsxComponent(staticSource, '/virtual/StaticComp.jsx', 'StaticComp', { Component })

      // ── Subject: component with child instance (uses replaceChild slot) ──
      const childSource = `
        import { Component } from '@geajs/core'
        export default class ChildComp extends Component {
          template() { return <div class="child">child content</div> }
        }
      `
      const ChildComp = await compileJsxComponent(childSource, '/virtual/ChildComp.jsx', 'ChildComp', { Component })

      const parentSource = `
        import { Component } from '@geajs/core'
        import ChildComp from './ChildComp'
        export default class ParentComp extends Component {
          template() {
            return (
              <div class="parent">
                <ChildComp />
                <p>static content</p>
              </div>
            )
          }
        }
      `
      const ParentComp = await compileJsxComponent(parentSource, '/virtual/ParentComp.jsx', 'ParentComp', { Component, ChildComp })

      const COUNT = 1000
      const TRIALS = 5
      const root = document.createElement('div')
      document.body.appendChild(root)

      function measureMounts(Cls: new () => { render: (el: HTMLElement) => void; dispose: () => void }, count: number): number {
        const apps: Array<{ dispose(): void }> = []
        const t0 = performance.now()
        for (let i = 0; i < count; i++) {
          const app = new Cls()
          app.render(root)
          apps.push(app)
        }
        const elapsed = performance.now() - t0
        for (const app of apps) app.dispose()
        return elapsed
      }

      // Warm-up
      for (let i = 0; i < 3; i++) {
        measureMounts(StaticComp as any, 10)
        measureMounts(ParentComp as any, 10)
      }
      await flush()

      // Trials
      const staticTimes: number[] = []
      const parentTimes: number[] = []
      for (let t = 0; t < TRIALS; t++) {
        staticTimes.push(measureMounts(StaticComp as any, COUNT))
        await flush()
        parentTimes.push(measureMounts(ParentComp as any, COUNT))
        await flush()
      }

      root.remove()

      const staticMed = staticTimes.sort((a, b) => a - b)[Math.floor(TRIALS / 2)]
      const parentMed = parentTimes.sort((a, b) => a - b)[Math.floor(TRIALS / 2)]
      const overheadPct = ((parentMed - staticMed) / staticMed) * 100
      const overhead = overheadPct.toFixed(1)

      console.log(
        `  static (${COUNT} mounts): ${staticMed.toFixed(1)}ms = ${(staticMed / COUNT).toFixed(3)}ms/mount\n` +
          `  with child (${COUNT} mounts): ${parentMed.toFixed(1)}ms = ${(parentMed / COUNT).toFixed(3)}ms/mount\n` +
          `  overhead vs static-only: +${overhead}%  (child slot replaceChild cost)`,
      )

      assert.ok(staticMed > 0, 'static mount time should be positive')
      assert.ok(parentMed > 0, 'parent+child mount time should be positive')
      assert.ok(overheadPct < 50, `child instance overhead should be < 50% (got ${overhead}%)`)

      report('12 clone (child instances)', { vanilla: staticMed / COUNT, gea: parentMed / COUNT, slowdown: parentMed / staticMed })
    } finally {
      await cleanupDelay()
      restoreDom()
    }
  })
})
