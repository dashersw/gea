import assert from 'node:assert/strict'
import { afterEach, describe, it, beforeEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import {
  buildEvalPrelude,
  loadRuntimeModules,
  mergeEvalBindings,
  transformGeaSourceToEvalBody,
} from '../helpers/compile'
import { GEA_OBSERVE_DIRECT } from '../../../gea/src/runtime/internal-symbols'
import { GEA_DOM_ITEM } from '../../../gea/src/runtime/keyed-list-symbols'
import { GEA_PROXY_RAW } from '../../../gea/src/runtime/symbols'

type Row = { id: number; label: string }

type BenchmarkStoreInstance = {
  data: Row[]
  selected: number
  run: () => void
  runLots: () => void
  add: () => void
  update: () => void
  clear: () => void
  swapRows: () => void
  select: (id: number) => void
  remove: (index: number) => void
  _resetScriptCounts: () => void
  _getScriptCounts: () => ScriptCounts
}

const BENCHMARK_SOURCE = `
  import { Component } from "@geajs/core";
  import store from "./store.ts";

  export default class Benchmark extends Component {
    template() {
      return (
        <div class="container">
          <div class="jumbotron">
            <div class="row">
              <div class="col-md-6">
                <h1>Gea-fast-paths-keyed</h1>
              </div>
              <div class="col-md-6">
                <div class="row">
                  <div class="col-sm-6 smallpad">
                    <button type="button" class="btn btn-primary btn-block" id="run" click={() => store.run()}>
                      Create 1,000 rows
                    </button>
                  </div>
                  <div class="col-sm-6 smallpad">
                    <button type="button" class="btn btn-primary btn-block" id="runlots" click={() => store.runLots()}>
                      Create 10,000 rows
                    </button>
                  </div>
                  <div class="col-sm-6 smallpad">
                    <button type="button" class="btn btn-primary btn-block" id="add" click={() => store.add()}>
                      Append 1,000 rows
                    </button>
                  </div>
                  <div class="col-sm-6 smallpad">
                    <button type="button" class="btn btn-primary btn-block" id="update" click={() => store.update()}>
                      Update every 10th row
                    </button>
                  </div>
                  <div class="col-sm-6 smallpad">
                    <button type="button" class="btn btn-primary btn-block" id="clear" click={() => store.clear()}>
                      Clear
                    </button>
                  </div>
                  <div class="col-sm-6 smallpad">
                    <button type="button" class="btn btn-primary btn-block" id="swaprows" click={() => store.swapRows()}>
                      Swap Rows
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <table class="table table-hover table-striped test-data">
            <tbody>
              {store.data.map((item, index) => (
                <tr key={item.id} class={store.selected === item.id ? "danger" : ""}>
                  <td class="col-md-1">{item.id}</td>
                  <td class="col-md-4">
                    <a click={() => store.select(item.id)}>{item.label}</a>
                  </td>
                  <td class="col-md-1">
                    <a click={() => store.remove(index)}>
                      <span class="glyphicon glyphicon-remove" aria-hidden="true"></span>
                    </a>
                  </td>
                  <td class="col-md-6"></td>
                </tr>
              ))}
            </tbody>
          </table>
          <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
        </div>
      );
    }
  }
`

const LIST_ONLY_CLICK_SOURCE = `
  import { Component } from "@geajs/core";
  import store from "./store.ts";

  export default class ListOnly extends Component {
    template() {
      return (
        <tbody>
          {store.data.map((item, index) => (
            <tr key={item.id}>
              <td>
                <a click={() => store.remove(index)}>{item.label}</a>
              </td>
            </tr>
          ))}
        </tbody>
      );
    }
  }
`

const A = [
  'pretty',
  'large',
  'big',
  'small',
  'tall',
  'short',
  'long',
  'handsome',
  'plain',
  'quaint',
  'clean',
  'elegant',
  'easy',
  'angry',
  'crazy',
  'helpful',
  'mushy',
  'odd',
  'unsightly',
  'adorable',
  'important',
  'inexpensive',
  'cheap',
  'expensive',
  'fancy',
]
const C = ['red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'brown', 'white', 'black', 'orange']
const N = [
  'table',
  'chair',
  'house',
  'bbq',
  'desk',
  'car',
  'pony',
  'cookie',
  'sandwich',
  'burger',
  'pizza',
  'mouse',
  'keyboard',
]

const WARMUP_COUNT = 5
const PARTIAL_UPDATE_WARMUPS = 3
const ROWS_TO_SKIP = 4
const BENCHMARK_SOURCE_URL = '/virtual/js-framework-benchmark/benchmark.tsx'

const OP_KEYS = [
  'appendChild',
  'insertBefore',
  'removeChild',
  'replaceChild',
  'replaceChildren',
  'cloneNode',
  'createElement',
  'createElementNS',
  'createTextNode',
  'createComment',
  'createDocumentFragment',
  'setAttribute',
  'removeAttribute',
  'textContentWrites',
  'textDataWrites',
  'classNameWrites',
] as const

type OpKey = (typeof OP_KEYS)[number]
type OpCounts = Record<OpKey, number>

const SCRIPT_KEYS = [
  'benchmarkMethodCalls',
  'buildRowIterations',
  'randomCalls',
  'updateLoopIterations',
  'swapBranchChecks',
  'swapBranchTaken',
  'removeCalls',
] as const

type ScriptKey = (typeof SCRIPT_KEYS)[number]
type ScriptCounts = Record<ScriptKey, number>

const RUNTIME_KEYS = [
  'reconcile',
  'dirtyPatchPass',
  'dirtyRows',
  'arraySwapFastPath',
  'appendFastPath',
  'removeFastPath',
  'removeSingleFastPath',
  'removeBatchFastPath',
  'freshCreateFastPath',
  'bulkClearFastPath',
  'clearRemoveLoopPath',
  'swapFastPath',
  'disjointReplaceFastPath',
  'generalLisPath',
  'removeEntry',
] as const

const COMPILER_KEYS = [
  'createEntry',
  'patchEntry',
  'initText',
  'patchText',
  'initAttr',
  'patchAttr',
  'initValue',
  'patchValue',
] as const

const STORE_KEYS = [
  'queue',
  'queueUpdate',
  'queueAppend',
  'queueRemove',
  'queueReorder',
  'queueDelete',
  'queueAdd',
  'queueAipu',
  'flushes',
  'observerCallbacks',
  'arrayMutations',
  'arrayPush',
  'arraySplice',
  'arrayPop',
  'arrayShift',
  'arrayUnshift',
  'arraySort',
  'arrayReverse',
  'arrayIndexWrites',
  'nestedObjectSets',
  'dirtyPropSets',
  'rootSets',
  'directObserverNotifications',
] as const

type RuntimeKey = (typeof RUNTIME_KEYS)[number]
type CompilerKey = (typeof COMPILER_KEYS)[number]
type StoreKey = (typeof STORE_KEYS)[number]

type RuntimeCounts = Record<RuntimeKey, number>
type CompilerCounts = Record<CompilerKey, number>
type StoreCounts = Record<StoreKey, number>

type BenchmarkCounters = {
  runtime: RuntimeCounts
  compiler: CompilerCounts
  store: StoreCounts
}

const BENCHMARK_STORE_MARKER = '__geaJsFrameworkBenchmarkStore'
let activeBenchmarkCounters: BenchmarkCounters | null = null
let activeCompilerPhase: 'create' | 'patch' | null = null
let activeRuntimePatchMode: 'dirty' | null = null

type MutationCounts = {
  addedRows: number
  removedRows: number
  addedNodes: number
  removedNodes: number
}

type ScenarioReport = {
  id: string
  label: string
  counts: OpCounts
  mutations: MutationCounts
  script: ScriptCounts
  counters: BenchmarkCounters
  heapDeltaBytes: number | null
  factor: number
  counterFactor: number
}

type LimitKey = OpKey | keyof MutationCounts | 'textWrites'
type OperationLimits = Partial<Record<LimitKey, number>>
type CounterLimitKey = ScriptKey | `runtime.${RuntimeKey}` | `compiler.${CompilerKey}` | `store.${StoreKey}`
type CounterLimits = Partial<Record<CounterLimitKey, number>>

type Harness = {
  root: HTMLDivElement
  app: { dispose: () => void }
  store: BenchmarkStoreInstance
  notes: Map<string, unknown>
  restoreInstrumentation: () => void
}

type Scenario = {
  id: string
  label: string
  description: string
  limits: OperationLimits
  counterLimits: CounterLimits
  init: (h: Harness) => Promise<void>
  run: (h: Harness) => Promise<void>
  verify: (h: Harness, report: ScenarioReport) => void
}

function zeroOpCounts(): OpCounts {
  return Object.fromEntries(OP_KEYS.map((key) => [key, 0])) as OpCounts
}

function zeroScriptCounts(): ScriptCounts {
  return Object.fromEntries(SCRIPT_KEYS.map((key) => [key, 0])) as ScriptCounts
}

function zeroBenchmarkCounters(): BenchmarkCounters {
  return {
    runtime: Object.fromEntries(RUNTIME_KEYS.map((key) => [key, 0])) as RuntimeCounts,
    compiler: Object.fromEntries(COMPILER_KEYS.map((key) => [key, 0])) as CompilerCounts,
    store: Object.fromEntries(STORE_KEYS.map((key) => [key, 0])) as StoreCounts,
  }
}

function createBenchmarkStore(Store: new (...args: any[]) => any): BenchmarkStoreInstance {
  let scriptCounts = zeroScriptCounts()

  class BenchmarkStore extends Store {
    data: Row[] = []
    selected = 0
    _nextId = 1
    _seed = 0x12345678

    _resetScriptCounts(): void {
      scriptCounts = zeroScriptCounts()
    }

    _getScriptCounts(): ScriptCounts {
      return { ...scriptCounts }
    }

    _random(max: number): number {
      scriptCounts.randomCalls++
      this._seed = (1664525 * this._seed + 1013904223) >>> 0
      return Math.round((this._seed / 0x100000000) * 1000) % max
    }

    _buildData(count: number): Row[] {
      scriptCounts.buildRowIterations += count
      return Array.from({ length: count }, () => ({
        id: this._nextId++,
        label: `${A[this._random(A.length)]} ${C[this._random(C.length)]} ${N[this._random(N.length)]}`,
      }))
    }

    run(): void {
      scriptCounts.benchmarkMethodCalls++
      this.data = this._buildData(1000)
      this.selected = 0
    }

    runLots(): void {
      scriptCounts.benchmarkMethodCalls++
      this.data = this._buildData(10000)
      this.selected = 0
    }

    add(): void {
      scriptCounts.benchmarkMethodCalls++
      this.data.push(...this._buildData(1000))
    }

    update(): void {
      scriptCounts.benchmarkMethodCalls++
      const d = this.data
      for (let i = 0; i < d.length; i += 10) {
        scriptCounts.updateLoopIterations++
        d[i].label += ' !!!'
      }
    }

    clear(): void {
      scriptCounts.benchmarkMethodCalls++
      this.data = []
      this.selected = 0
    }

    swapRows(): void {
      scriptCounts.benchmarkMethodCalls++
      const d = this.data
      scriptCounts.swapBranchChecks++
      if (d.length > 998) {
        scriptCounts.swapBranchTaken++
        const tmp = d[1]
        d[1] = d[998]
        d[998] = tmp
      }
    }

    select(id: number): void {
      scriptCounts.benchmarkMethodCalls++
      this.selected = id
    }

    remove(index: number): void {
      scriptCounts.benchmarkMethodCalls++
      scriptCounts.removeCalls++
      this.data.splice(index, 1)
    }
  }

  const store = new BenchmarkStore() as BenchmarkStoreInstance
  ;(store as any)[BENCHMARK_STORE_MARKER] = true
  return store
}

function bumpCompilerCounter(key: CompilerKey): void {
  const counters = activeBenchmarkCounters
  if (counters) counters.compiler[key]++
}

function bumpRuntimeCounter(key: RuntimeKey, amount = 1): void {
  const counters = activeBenchmarkCounters
  if (counters) counters.runtime[key] += amount
}

function bumpStoreCounter(key: StoreKey, amount = 1): void {
  const counters = activeBenchmarkCounters
  if (counters) counters.store[key] += amount
}

function countStoreChanges(changes?: Array<Record<string, any>>): void {
  if (!activeBenchmarkCounters || !changes || changes.length === 0) return
  bumpStoreCounter('queue', changes.length)

  let aipuCount = 0
  let appendCount = 0
  let removeCount = 0
  let reorderCount = 0
  let deleteCount = 0
  let addCount = 0
  let plainUpdateCount = 0

  for (const change of changes) {
    if (change.aipu) aipuCount++
    else if (change.type === 'append') appendCount++
    else if (change.type === 'remove') removeCount++
    else if (change.type === 'reorder') reorderCount++
    else if (change.type === 'delete') deleteCount++
    else if (change.type === 'add') addCount++
    else plainUpdateCount++
  }

  if (aipuCount > 0) {
    bumpStoreCounter('queueAipu', aipuCount)
    bumpStoreCounter('arrayIndexWrites', aipuCount)
  }
  if (appendCount > 0) {
    bumpStoreCounter('queueAppend', appendCount)
    bumpStoreCounter('arrayMutations')
    bumpStoreCounter('arrayPush')
  }
  if (removeCount > 0) {
    bumpStoreCounter('queueRemove', removeCount)
    bumpStoreCounter('arrayMutations')
    bumpStoreCounter('arraySplice')
  }
  if (reorderCount > 0) bumpStoreCounter('queueReorder', reorderCount)
  if (deleteCount > 0) bumpStoreCounter('queueDelete', deleteCount)
  if (addCount > 0) bumpStoreCounter('queueAdd', addCount)
  if (plainUpdateCount > 0) bumpStoreCounter('queueUpdate', plainUpdateCount)
  if (plainUpdateCount > 1) {
    bumpStoreCounter('nestedObjectSets', plainUpdateCount)
    bumpStoreCounter('dirtyPropSets', plainUpdateCount)
  }
}

function installStoreInstrumentation(
  Store: new (...args: any[]) => any,
  getBrowserRootProxyHandler: () => ProxyHandler<any>,
  getRootProxyHandlerFactory: () => (() => ProxyHandler<any>) | null,
  setRootProxyHandlerFactory: (factory: (() => ProxyHandler<any>) | null) => void,
): () => void {
  const storeClass = Store as any
  const previousFactory = getRootProxyHandlerFactory()
  const previousObserve = storeClass.prototype.observe
  const previousObserveDirect = storeClass.prototype[GEA_OBSERVE_DIRECT]

  setRootProxyHandlerFactory(() => {
    const base = previousFactory ? previousFactory() : getBrowserRootProxyHandler()
    return {
      ...base,
      set(target: any, prop: string | symbol, value: unknown, receiver: unknown) {
        if (
          activeBenchmarkCounters &&
          target[BENCHMARK_STORE_MARKER] === true &&
          (prop === 'data' || prop === 'selected') &&
          typeof value !== 'function' &&
          (!(prop in target) || target[prop] !== value)
        ) {
          bumpStoreCounter('rootSets')
        }
        return base.set ? base.set(target, prop, value, receiver) : Reflect.set(target, prop, value, receiver)
      },
      defineProperty(target: any, prop: string | symbol, descriptor: PropertyDescriptor) {
        if (
          activeBenchmarkCounters &&
          target[BENCHMARK_STORE_MARKER] === true &&
          (prop === 'data' || prop === 'selected') &&
          'value' in descriptor &&
          typeof descriptor.value !== 'function' &&
          (!(prop in target) || target[prop] !== descriptor.value)
        ) {
          bumpStoreCounter('rootSets')
        }
        return base.defineProperty
          ? base.defineProperty(target, prop, descriptor)
          : Reflect.defineProperty(target, prop, descriptor)
      },
    }
  })

  storeClass.prototype.observe = function benchmarkObserve(
    pathOrProp: string | readonly string[],
    handler: (value: unknown, changes?: Array<Record<string, any>>) => void,
  ) {
    return previousObserve.call(this, pathOrProp, (value: unknown, changes?: Array<Record<string, any>>) => {
      if (activeBenchmarkCounters) {
        bumpStoreCounter('flushes')
        bumpStoreCounter('observerCallbacks')
        countStoreChanges(changes)
      }
      return handler(value, changes)
    })
  }

  if (typeof previousObserveDirect === 'function') {
    storeClass.prototype[GEA_OBSERVE_DIRECT] = function benchmarkObserveDirect(
      prop: string,
      handler: (value: unknown) => void,
    ) {
      return previousObserveDirect.call(this, prop, (value: unknown) => {
        bumpStoreCounter('directObserverNotifications')
        return handler(value)
      })
    }
  }

  return () => {
    setRootProxyHandlerFactory(previousFactory)
    storeClass.prototype.observe = previousObserve
    if (typeof previousObserveDirect === 'function') storeClass.prototype[GEA_OBSERVE_DIRECT] = previousObserveDirect
  }
}

function resolveListLength(root: any, cfg: { path?: readonly string[] | (() => any[]); prop?: string }): number {
  const arr =
    typeof cfg.path === 'function'
      ? cfg.path()
      : cfg.path
        ? cfg.path.reduce((value, key) => value?.[key], root)
        : root?.[cfg.prop as string]
  return Array.isArray(arr) ? arr.length : 0
}

function countRuntimeListChange(
  previousLength: number,
  nextLength: number,
  changes?: Array<Record<string, any>>,
): void {
  if (!activeBenchmarkCounters) return
  const listChanges = changes ?? []
  activeRuntimePatchMode = null
  bumpRuntimeCounter('reconcile')

  if (listChanges.length === 2 && listChanges.every((change) => change.aipu)) {
    bumpRuntimeCounter('arraySwapFastPath')
    return
  }

  if (listChanges.length > 0 && listChanges.every((change) => change.type === 'append')) {
    bumpRuntimeCounter('appendFastPath')
    return
  }

  if (listChanges.length > 0 && listChanges.every((change) => change.type === 'remove')) {
    bumpRuntimeCounter('removeFastPath')
    if (listChanges.length === 1 && listChanges[0].count === 1) bumpRuntimeCounter('removeSingleFastPath')
    else bumpRuntimeCounter('removeBatchFastPath')
    bumpRuntimeCounter('removeEntry', Math.max(0, previousLength - nextLength))
    return
  }

  if (
    previousLength > 0 &&
    nextLength > 0 &&
    listChanges.length === 1 &&
    (Array.isArray(listChanges[0].previousValue) || Array.isArray(listChanges[0].newValue))
  ) {
    bumpRuntimeCounter('disjointReplaceFastPath')
    return
  }

  if (previousLength === nextLength && listChanges.length > 1) {
    activeRuntimePatchMode = 'dirty'
    bumpRuntimeCounter('dirtyPatchPass')
    return
  }

  if (
    previousLength === nextLength &&
    listChanges.length > 0 &&
    listChanges.every((change) => !change.aipu && (change.type === undefined || change.type === 'update'))
  ) {
    activeRuntimePatchMode = 'dirty'
    bumpRuntimeCounter('dirtyPatchPass')
    return
  }

  if (previousLength === 0 && nextLength > 0) {
    bumpRuntimeCounter('freshCreateFastPath')
    return
  }

  if (nextLength === 0) {
    bumpRuntimeCounter('bulkClearFastPath')
    return
  }

  if (previousLength > 0 && nextLength > 0) {
    bumpRuntimeCounter('disjointReplaceFastPath')
    return
  }

  bumpRuntimeCounter('generalLisPath')
}

function createInstrumentedKeyedList(baseKeyedList: (cfg: any) => void): (cfg: any) => void {
  return (cfg: any) => {
    let currentLength = resolveListLength(cfg.root, cfg)
    const root =
      cfg.root && typeof cfg.root === 'object'
        ? new Proxy(cfg.root, {
            get(target, prop, receiver) {
              if (prop === 'observe') {
                return (path: string | readonly string[], handler: (value: unknown, changes?: any[]) => void) =>
                  target.observe(path, (value: unknown, changes?: Array<Record<string, any>>) => {
                    const nextLength = Array.isArray(value) ? value.length : resolveListLength(target, cfg)
                    countRuntimeListChange(currentLength, nextLength, changes)
                    currentLength = nextLength
                    return handler(value, changes)
                  })
              }
              return Reflect.get(target, prop, receiver)
            },
          })
        : cfg.root

    return baseKeyedList({
      ...cfg,
      root,
      createEntry(item: unknown, idx: number) {
        bumpCompilerCounter('createEntry')
        const previous = activeCompilerPhase
        activeCompilerPhase = 'create'
        try {
          return cfg.createEntry(item, idx)
        } finally {
          activeCompilerPhase = previous
        }
      },
      patchEntry(entry: unknown, item: unknown, idx: number) {
        bumpCompilerCounter('patchEntry')
        if (activeRuntimePatchMode === 'dirty') bumpRuntimeCounter('dirtyRows')
        const previous = activeCompilerPhase
        activeCompilerPhase = 'patch'
        try {
          return cfg.patchEntry(entry, item, idx)
        } finally {
          activeCompilerPhase = previous
        }
      },
    })
  }
}

async function createHarness(scenarioId: string): Promise<Harness> {
  const seed = `js-framework-benchmark-${scenarioId}-${Date.now()}-${Math.random()}`
  const [componentModule, storeModule] = await loadRuntimeModules(seed)
  const { default: Component } = componentModule as { default: new (...args: any[]) => any }
  const { Store, _getBrowserRootProxyHandler, getRootProxyHandlerFactoryForSSR, setRootProxyHandlerFactoryForSSR } =
    storeModule as {
      Store: new (...args: any[]) => any
      _getBrowserRootProxyHandler: () => ProxyHandler<any>
      getRootProxyHandlerFactoryForSSR: () => (() => ProxyHandler<any>) | null
      setRootProxyHandlerFactoryForSSR: (factory: (() => ProxyHandler<any>) | null) => void
    }
  const restoreInstrumentation = installStoreInstrumentation(
    Store,
    _getBrowserRootProxyHandler,
    getRootProxyHandlerFactoryForSSR,
    setRootProxyHandlerFactoryForSSR,
  )
  const store = createBenchmarkStore(Store)
  const App = (await compileBenchmarkComponent({ Component, store })) as {
    new (): { render: (n: Node) => void; dispose: () => void }
  }

  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = new App()
  app.render(root)
  await flushMicrotasks()
  return { root, app, store, notes: new Map(), restoreInstrumentation }
}

async function compileBenchmarkComponent(bindings: Record<string, unknown>): Promise<unknown> {
  const allBindings = mergeEvalBindings(bindings)
  const runtime = allBindings.__geaRt as Record<string, unknown>
  allBindings.__geaRt = {
    ...runtime,
    keyedList: createInstrumentedKeyedList(runtime.keyedList as (cfg: any) => void),
    keyedListSimple: createInstrumentedKeyedList(runtime.keyedListSimple as (cfg: any) => void),
    keyedListProp: createInstrumentedKeyedList(runtime.keyedListProp as (cfg: any) => void),
  }
  const transformed = await transformGeaSourceToEvalBody(BENCHMARK_SOURCE, BENCHMARK_SOURCE_URL)
  assert.match(transformed, /\b__kl_reconcile\s*=/, 'benchmark-shaped keyed lists should inline the prop kernel')
  assert.doesNotMatch(
    transformed,
    /__kl_reconcile\(__kl_resolve\(\), changes\)/,
    'list observers should pass the observed array value instead of re-resolving and copying it',
  )
  assert.match(
    transformed,
    /let __kl_reconcile = \(arr, changes\) => \{\s*if \(!Array\.isArray\(arr\)\) arr = \[\];\s*if \(arr\.length === 0\)/,
    'empty benchmark lists should keep the compact kernel cold until rows exist',
  )
  assert.match(
    transformed,
    /const __kl_init = \(firstArr, firstChanges\) =>/,
    'compact benchmark list setup should be lazily initialized',
  )
  assert.match(
    transformed,
    /const __kl_raw = \(v\) => v && v\[GEA_PROXY_RAW\] \|\| v;/,
    'benchmark-shaped row creation should read from the raw backing array',
  )
  assert.match(
    transformed,
    /const raw = __kl_raw\(arr\);[\s\S]*const item = raw\[i\];/,
    'benchmark-shaped row creation should avoid per-row array proxy reads',
  )
  assert.doesNotMatch(
    transformed,
    /__kl_create\(arr\[i\]/,
    'benchmark-shaped row creation should pass raw row objects to row factories',
  )
  assert.doesNotMatch(
    transformed,
    /\bkeyedListProp\s*\(/,
    'benchmark-shaped keyed lists should avoid the prop runtime helper',
  )
  assert.doesNotMatch(
    transformed,
    /\bkeyedListSimple\s*\(/,
    'single-prop benchmark-shaped keyed lists should avoid the path kernel',
  )
  assert.doesNotMatch(transformed, /[^\w$]keyedList\s*\(/, 'benchmark-shaped keyed lists should avoid the full kernel')
  assert.doesNotMatch(
    transformed,
    /new Set\(/,
    'compact benchmark-shaped keyed lists should not carry the general reorder fallback',
  )
  assert.match(
    transformed,
    /class Benchmark extends CompiledStaticComponent/,
    'stateless benchmark root should use the static lean base',
  )
  assert.match(
    transformed,
    /const __hm_\d+ = \(e\) => \{[\s\S]*store\.select\(item\.id\);[\s\S]*\};/,
    'benchmark row select handlers should be hoisted into one shared dispatcher',
  )
  assert.match(
    transformed,
    /const __hm_\d+ = \(e\) => \{[\s\S]*store\.remove\(index\);[\s\S]*\};/,
    'benchmark row remove handlers should be hoisted into one shared dispatcher',
  )
  assert.match(
    transformed,
    /evt\d+\.__gc = __hm_\d+;\s*evt\d+\.__gc = __hm_\d+;/,
    'benchmark rows should store shared handler references, not per-row closures',
  )
  assert.match(
    transformed,
    /\bdelegateClick\(root, \[/,
    'benchmark root buttons should install the shared document click delegate',
  )
  assert.doesNotMatch(
    transformed,
    /\bdelegateClick\(parent\d+, \[\]\)/,
    'benchmark rows should reuse the root click delegate instead of emitting an empty list installer',
  )
  assert.doesNotMatch(
    transformed,
    /const h\d+ = \(\) => store\.select\(item\.id\);/,
    'benchmark rows should not allocate a select closure per row',
  )
  assert.doesNotMatch(
    transformed,
    /const h\d+ = \(\) => store\.remove\(index\);/,
    'benchmark rows should not allocate a remove closure per row',
  )
  const body = buildEvalPrelude() + transformed
  const compiledSource = `${body}
return Benchmark;
//# sourceURL=${BENCHMARK_SOURCE_URL}`
  return new Function(...Object.keys(allBindings), compiledSource)(...Object.values(allBindings))
}

function ownRows(root: ParentNode): HTMLTableRowElement[] {
  const tbody = root.querySelector('.test-data tbody') as HTMLTableSectionElement | null
  assert.ok(tbody, 'benchmark tbody should exist')
  return Array.from(tbody.children) as HTMLTableRowElement[]
}

function rowAt(root: ParentNode, oneBasedIndex: number): HTMLTableRowElement {
  const row = ownRows(root)[oneBasedIndex - 1]
  assert.ok(row, `row ${oneBasedIndex} should exist`)
  return row
}

function rowCount(root: ParentNode): number {
  return ownRows(root).length
}

function uniqueRowClickHandlerCount(root: ParentNode): number {
  const anchors = Array.from(root.querySelectorAll('.test-data tbody a')) as Array<
    HTMLAnchorElement & { __gc?: unknown }
  >
  assert.equal(anchors.length, rowCount(root) * 2)
  return new Set(anchors.map((anchor) => anchor.__gc)).size
}

function rowId(root: ParentNode, oneBasedIndex: number): number {
  return Number(rowAt(root, oneBasedIndex).children[0]?.textContent)
}

function rowLabel(root: ParentNode, oneBasedIndex: number): string {
  return rowAt(root, oneBasedIndex).children[1]?.textContent ?? ''
}

function assertRowUsesRawItem(h: Harness, oneBasedIndex: number): void {
  const rawData = ((h.store.data as any)[GEA_PROXY_RAW] || h.store.data) as Row[]
  assert.equal((rowAt(h.root, oneBasedIndex) as any)[GEA_DOM_ITEM], rawData[oneBasedIndex - 1])
}

function click(root: ParentNode, selector: string): void {
  const el = root.querySelector(selector) as HTMLElement | null
  assert.ok(el, `click target ${selector} should exist`)
  el.click()
}

function clickRowLabel(root: ParentNode, oneBasedIndex: number): void {
  const el = rowAt(root, oneBasedIndex).children[1]?.querySelector('a') as HTMLElement | null
  assert.ok(el, `row ${oneBasedIndex} label link should exist`)
  el.click()
}

function clickRowRemoveIcon(root: ParentNode, oneBasedIndex: number): void {
  const el = rowAt(root, oneBasedIndex).children[2]?.querySelector('span') as HTMLElement | null
  assert.ok(el, `row ${oneBasedIndex} remove icon should exist`)
  el.click()
}

async function clickAndFlush(root: ParentNode, selector: string): Promise<void> {
  click(root, selector)
  await flushMicrotasks()
}

async function clickRowLabelAndFlush(root: ParentNode, oneBasedIndex: number): Promise<void> {
  clickRowLabel(root, oneBasedIndex)
  await flushMicrotasks()
}

async function clickRowRemoveAndFlush(root: ParentNode, oneBasedIndex: number): Promise<void> {
  clickRowRemoveIcon(root, oneBasedIndex)
  await flushMicrotasks()
}

async function runAndClearWarmups(h: Harness): Promise<void> {
  for (let i = 0; i < WARMUP_COUNT; i++) {
    await clickAndFlush(h.root, '#run')
    assert.equal(rowId(h.root, 1), i * 1000 + 1)
    await clickAndFlush(h.root, '#clear')
    assert.equal(rowCount(h.root), 0)
  }
}

function installOperationCounter(): {
  snapshot: () => OpCounts
  restore: () => void
} {
  const counts = zeroOpCounts()
  const restores: Array<() => void> = []
  const win = window as any

  const patchMethod = (proto: object | undefined, method: string, key: OpKey): void => {
    if (!proto) return
    const descriptor = Object.getOwnPropertyDescriptor(proto, method)
    if (!descriptor || typeof descriptor.value !== 'function') return
    const original = descriptor.value
    Object.defineProperty(proto, method, {
      ...descriptor,
      value(this: unknown, ...args: unknown[]) {
        counts[key]++
        return original.apply(this, args)
      },
    })
    restores.push(() => Object.defineProperty(proto, method, descriptor))
  }

  const patchAccessor = (proto: object | undefined, prop: string, key: OpKey): void => {
    if (!proto) return
    const descriptor = Object.getOwnPropertyDescriptor(proto, prop)
    if (!descriptor?.set) return
    Object.defineProperty(proto, prop, {
      ...descriptor,
      set(this: unknown, value: unknown) {
        counts[key]++
        if (key === 'textContentWrites' || key === 'textDataWrites') {
          if (activeCompilerPhase === 'create') bumpCompilerCounter('initText')
          else if (activeCompilerPhase === 'patch') bumpCompilerCounter('patchText')
        }
        return descriptor.set!.call(this, value)
      },
    })
    restores.push(() => Object.defineProperty(proto, prop, descriptor))
  }

  patchMethod(win.Node?.prototype, 'appendChild', 'appendChild')
  patchMethod(win.Node?.prototype, 'insertBefore', 'insertBefore')
  patchMethod(win.Node?.prototype, 'removeChild', 'removeChild')
  patchMethod(win.Node?.prototype, 'replaceChild', 'replaceChild')
  patchMethod(win.Element?.prototype, 'replaceChildren', 'replaceChildren')
  patchMethod(win.Node?.prototype, 'cloneNode', 'cloneNode')
  patchMethod(win.Document?.prototype, 'createElement', 'createElement')
  patchMethod(win.Document?.prototype, 'createElementNS', 'createElementNS')
  patchMethod(win.Document?.prototype, 'createTextNode', 'createTextNode')
  patchMethod(win.Document?.prototype, 'createComment', 'createComment')
  patchMethod(win.Document?.prototype, 'createDocumentFragment', 'createDocumentFragment')
  patchMethod(win.Element?.prototype, 'setAttribute', 'setAttribute')
  patchMethod(win.Element?.prototype, 'removeAttribute', 'removeAttribute')
  patchAccessor(win.Node?.prototype, 'textContent', 'textContentWrites')
  patchAccessor(win.Node?.prototype, 'nodeValue', 'textDataWrites')
  patchAccessor(win.CharacterData?.prototype, 'data', 'textDataWrites')
  patchAccessor(win.CharacterData?.prototype, 'nodeValue', 'textDataWrites')
  patchAccessor(win.Element?.prototype, 'className', 'classNameWrites')
  patchAccessor(win.HTMLElement?.prototype, 'className', 'classNameWrites')

  return {
    snapshot: () => ({ ...counts }),
    restore: () => {
      for (let i = restores.length - 1; i >= 0; i--) restores[i]()
    },
  }
}

function observeRows(root: ParentNode): {
  snapshot: () => MutationCounts
  disconnect: () => MutationCounts
} {
  const tbody = root.querySelector('.test-data tbody') as HTMLTableSectionElement | null
  assert.ok(tbody, 'benchmark tbody should exist before measuring')
  const counts: MutationCounts = { addedRows: 0, removedRows: 0, addedNodes: 0, removedNodes: 0 }
  const consume = (records: MutationRecord[]): void => {
    for (const record of records) {
      counts.addedNodes += record.addedNodes.length
      counts.removedNodes += record.removedNodes.length
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'TR') counts.addedRows++
      }
      for (const node of record.removedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'TR') counts.removedRows++
      }
    }
  }
  const observer = new MutationObserver(consume)
  observer.observe(tbody, { childList: true })
  return {
    snapshot: () => {
      consume(observer.takeRecords())
      return { ...counts }
    },
    disconnect: () => {
      consume(observer.takeRecords())
      observer.disconnect()
      return { ...counts }
    },
  }
}

function installBenchmarkCounters(): {
  snapshot: () => BenchmarkCounters
  restore: () => void
} {
  const previousCounters = activeBenchmarkCounters
  const previousPhase = activeCompilerPhase
  const previousPatchMode = activeRuntimePatchMode
  const counters = zeroBenchmarkCounters()
  activeBenchmarkCounters = counters
  activeCompilerPhase = null
  activeRuntimePatchMode = null
  return {
    snapshot: () => ({
      runtime: { ...counters.runtime },
      compiler: { ...counters.compiler },
      store: { ...counters.store },
    }),
    restore: () => {
      activeBenchmarkCounters = previousCounters
      activeCompilerPhase = previousPhase
      activeRuntimePatchMode = previousPatchMode
    },
  }
}

function heapUsed(): number | null {
  return typeof process.memoryUsage === 'function' ? process.memoryUsage().heapUsed : null
}

function actualForLimit(report: ScenarioReport, key: LimitKey): number {
  if (key === 'textWrites') return report.counts.textContentWrites + report.counts.textDataWrites
  if (key in report.counts) return report.counts[key as OpKey]
  return report.mutations[key as keyof MutationCounts]
}

function assertWithinLimits(report: ScenarioReport, limits: OperationLimits): number {
  const ratios: number[] = []
  for (const [key, limit] of Object.entries(limits) as Array<[LimitKey, number]>) {
    const actual = actualForLimit(report, key)
    if (limit === 0) {
      assert.equal(actual, 0, `${report.label}: expected ${key} to stay at 0`)
      ratios.push(0.001)
    } else {
      assert.ok(actual <= limit, `${report.label}: expected ${key} <= ${limit}, got ${actual}`)
      ratios.push(Math.max(actual / limit, 0.001))
    }
  }
  return ratios.length === 0 ? 0.001 : Math.exp(ratios.reduce((sum, ratio) => sum + Math.log(ratio), 0) / ratios.length)
}

function actualForCounterLimit(report: ScenarioReport, key: CounterLimitKey): number {
  if (key.startsWith('runtime.')) return report.counters.runtime[key.slice('runtime.'.length) as RuntimeKey]
  if (key.startsWith('compiler.')) return report.counters.compiler[key.slice('compiler.'.length) as CompilerKey]
  if (key.startsWith('store.')) return report.counters.store[key.slice('store.'.length) as StoreKey]
  return report.script[key as ScriptKey]
}

function assertWithinCounterLimits(report: ScenarioReport, limits: CounterLimits): number {
  const ratios: number[] = []
  for (const [key, limit] of Object.entries(limits) as Array<[CounterLimitKey, number]>) {
    const actual = actualForCounterLimit(report, key)
    if (limit === 0) {
      assert.equal(actual, 0, `${report.label}: expected ${key} to stay at 0`)
      ratios.push(0.001)
    } else {
      assert.equal(actual, limit, `${report.label}: expected ${key} to equal ${limit}`)
      ratios.push(Math.max(actual / limit, 0.001))
    }
  }
  return ratios.length === 0 ? 0.001 : Math.exp(ratios.reduce((sum, ratio) => sum + Math.log(ratio), 0) / ratios.length)
}

async function runScenario(scenario: Scenario): Promise<ScenarioReport> {
  const h = await createHarness(scenario.id)
  let counter: ReturnType<typeof installOperationCounter> | null = null
  let mutations: ReturnType<typeof observeRows> | null = null
  let benchmarkCounters: ReturnType<typeof installBenchmarkCounters> | null = null
  try {
    await scenario.init(h)
    h.store._resetScriptCounts()
    counter = installOperationCounter()
    mutations = observeRows(h.root)
    benchmarkCounters = installBenchmarkCounters()
    const heapBefore = heapUsed()
    await scenario.run(h)
    await flushMicrotasks()
    const heapAfter = heapUsed()
    const report: ScenarioReport = {
      id: scenario.id,
      label: scenario.label,
      counts: counter.snapshot(),
      mutations: mutations.disconnect(),
      script: h.store._getScriptCounts(),
      counters: benchmarkCounters.snapshot(),
      heapDeltaBytes: heapBefore == null || heapAfter == null ? null : heapAfter - heapBefore,
      factor: 0,
      counterFactor: 0,
    }
    report.factor = assertWithinLimits(report, scenario.limits)
    report.counterFactor = assertWithinCounterLimits(report, scenario.counterLimits)
    scenario.verify(h, report)
    return report
  } finally {
    benchmarkCounters?.restore()
    mutations?.disconnect()
    counter?.restore()
    h.app.dispose()
    h.root.remove()
    h.restoreInstrumentation()
    await flushMicrotasks()
  }
}

const scenarios: Scenario[] = [
  {
    id: '01_run1k',
    label: 'create rows',
    description: 'creating 1,000 rows',
    limits: {
      addedRows: 1000,
      removedRows: 0,
      cloneNode: 1020,
      appendChild: 1025,
      insertBefore: 2,
      removeChild: 0,
      replaceChildren: 0,
      textWrites: 2200,
    },
    counterLimits: {
      benchmarkMethodCalls: 1,
      buildRowIterations: 1000,
      randomCalls: 3000,
      updateLoopIterations: 0,
      swapBranchChecks: 0,
      swapBranchTaken: 0,
      removeCalls: 0,
      'store.rootSets': 1,
      'store.queue': 1,
      'store.queueUpdate': 1,
    },
    init: runAndClearWarmups,
    run: async (h) => clickAndFlush(h.root, '#run'),
    verify: (h) => {
      assert.equal(rowCount(h.root), 1000)
      assert.equal(rowId(h.root, 1), WARMUP_COUNT * 1000 + 1)
      assertRowUsesRawItem(h, 1)
    },
  },
  {
    id: '02_replace1k',
    label: 'replace all rows',
    description: 'updating all 1,000 rows',
    limits: {
      addedRows: 1000,
      removedRows: 1000,
      cloneNode: 1020,
      appendChild: 25,
      insertBefore: 2,
      removeChild: 0,
      replaceChildren: 1,
      textWrites: 2200,
    },
    counterLimits: {
      benchmarkMethodCalls: 1,
      buildRowIterations: 1000,
      randomCalls: 3000,
      updateLoopIterations: 0,
      swapBranchChecks: 0,
      swapBranchTaken: 0,
      removeCalls: 0,
      'store.rootSets': 1,
      'store.queue': 1,
      'store.queueUpdate': 1,
    },
    init: async (h) => {
      for (let i = 0; i < WARMUP_COUNT; i++) {
        await clickAndFlush(h.root, '#run')
        assert.equal(rowId(h.root, 1), i * 1000 + 1)
      }
      h.notes.set('firstRowBeforeReplace', rowAt(h.root, 1))
    },
    run: async (h) => clickAndFlush(h.root, '#run'),
    verify: (h) => {
      assert.equal(rowCount(h.root), 1000)
      assert.equal(rowId(h.root, 1), WARMUP_COUNT * 1000 + 1)
      assert.notEqual(rowAt(h.root, 1), h.notes.get('firstRowBeforeReplace'))
    },
  },
  {
    id: '03_update10th1k_x16',
    label: 'partial update',
    description: 'updating every 10th row for 1,000 rows',
    limits: {
      addedRows: 0,
      removedRows: 0,
      cloneNode: 0,
      appendChild: 0,
      insertBefore: 0,
      removeChild: 0,
      replaceChildren: 0,
      textWrites: 130,
      classNameWrites: 0,
    },
    counterLimits: {
      benchmarkMethodCalls: 1,
      buildRowIterations: 0,
      randomCalls: 0,
      updateLoopIterations: 100,
      swapBranchChecks: 0,
      swapBranchTaken: 0,
      removeCalls: 0,
      'store.queue': 1,
      'store.queueUpdate': 1,
      'store.flushes': 1,
      'store.observerCallbacks': 1,
    },
    init: async (h) => {
      await clickAndFlush(h.root, '#run')
      assert.equal(rowCount(h.root), 1000)
      for (let i = 0; i < PARTIAL_UPDATE_WARMUPS; i++) {
        await clickAndFlush(h.root, '#update')
        assert.ok(rowLabel(h.root, 991).endsWith(' !!!'.repeat(i + 1)))
      }
      h.notes.set('row991BeforeUpdate', rowAt(h.root, 991))
    },
    run: async (h) => clickAndFlush(h.root, '#update'),
    verify: (h) => {
      assert.equal(rowCount(h.root), 1000)
      assert.equal(rowAt(h.root, 991), h.notes.get('row991BeforeUpdate'))
      assert.ok(rowLabel(h.root, 991).endsWith(' !!!'.repeat(PARTIAL_UPDATE_WARMUPS + 1)))
      assert.ok(!rowLabel(h.root, 992).endsWith(' !!!'))
    },
  },
  {
    id: '04_select1k',
    label: 'select row',
    description: 'highlighting a selected row',
    limits: {
      addedRows: 0,
      removedRows: 0,
      cloneNode: 0,
      appendChild: 0,
      insertBefore: 0,
      removeChild: 0,
      replaceChildren: 0,
      textWrites: 0,
      classNameWrites: 2,
      setAttribute: 0,
      removeAttribute: 0,
    },
    counterLimits: {
      benchmarkMethodCalls: 1,
      buildRowIterations: 0,
      randomCalls: 0,
      updateLoopIterations: 0,
      swapBranchChecks: 0,
      swapBranchTaken: 0,
      removeCalls: 0,
      'runtime.reconcile': 0,
      'store.rootSets': 1,
      'store.queue': 0,
      'store.directObserverNotifications': 1,
    },
    init: async (h) => {
      await clickAndFlush(h.root, '#run')
      assert.equal(rowCount(h.root), 1000)
      h.notes.set('rowsBeforeSelect', ownRows(h.root))
    },
    run: async (h) => clickRowLabelAndFlush(h.root, 2),
    verify: (h) => {
      assert.equal(rowAt(h.root, 2).className, 'danger')
      assert.equal(rowAt(h.root, 1).className, '')
      assert.deepEqual(ownRows(h.root), h.notes.get('rowsBeforeSelect'))
    },
  },
  {
    id: '05_swap1k',
    label: 'swap rows',
    description: 'swap 2 rows for table with 1,000 rows',
    limits: {
      addedRows: 2,
      removedRows: 2,
      cloneNode: 0,
      appendChild: 1,
      insertBefore: 2,
      removeChild: 0,
      replaceChildren: 0,
      textWrites: 0,
      classNameWrites: 0,
    },
    counterLimits: {
      benchmarkMethodCalls: 1,
      buildRowIterations: 0,
      randomCalls: 0,
      updateLoopIterations: 0,
      swapBranchChecks: 1,
      swapBranchTaken: 1,
      removeCalls: 0,
      'store.queue': 2,
      'store.queueAipu': 2,
      'store.arrayIndexWrites': 2,
      'store.flushes': 1,
      'store.observerCallbacks': 1,
    },
    init: async (h) => {
      await clickAndFlush(h.root, '#run')
      for (let i = 0; i <= WARMUP_COUNT; i++) {
        await clickAndFlush(h.root, '#swaprows')
        assert.equal(rowId(h.root, 999), i % 2 === 0 ? 2 : 999)
      }
      h.notes.set('row2BeforeSwap', rowAt(h.root, 2))
      h.notes.set('row999BeforeSwap', rowAt(h.root, 999))
    },
    run: async (h) => clickAndFlush(h.root, '#swaprows'),
    verify: (h) => {
      assert.equal(rowId(h.root, 999), WARMUP_COUNT % 2 === 0 ? 999 : 2)
      assert.equal(rowId(h.root, 2), WARMUP_COUNT % 2 === 0 ? 2 : 999)
      assert.equal(rowAt(h.root, 2), h.notes.get('row999BeforeSwap'))
      assert.equal(rowAt(h.root, 999), h.notes.get('row2BeforeSwap'))
    },
  },
  {
    id: '06_remove-one-1k',
    label: 'remove row',
    description: 'removing one row',
    limits: {
      addedRows: 0,
      removedRows: 1,
      cloneNode: 0,
      appendChild: 0,
      insertBefore: 0,
      removeChild: 1,
      replaceChildren: 0,
      textWrites: 0,
      classNameWrites: 0,
    },
    counterLimits: {
      benchmarkMethodCalls: 1,
      buildRowIterations: 0,
      randomCalls: 0,
      updateLoopIterations: 0,
      swapBranchChecks: 0,
      swapBranchTaken: 0,
      removeCalls: 1,
      'store.arrayMutations': 1,
      'store.arraySplice': 1,
      'store.queue': 1,
      'store.queueRemove': 1,
      'store.flushes': 1,
      'store.observerCallbacks': 1,
    },
    init: async (h) => {
      await clickAndFlush(h.root, '#run')
      for (let i = 0; i < WARMUP_COUNT; i++) {
        const rowToClick = WARMUP_COUNT - i + ROWS_TO_SKIP
        assert.equal(rowId(h.root, rowToClick), rowToClick)
        await clickRowRemoveAndFlush(h.root, rowToClick)
        assert.equal(rowId(h.root, rowToClick), ROWS_TO_SKIP + WARMUP_COUNT + 1)
      }
      assert.equal(rowId(h.root, ROWS_TO_SKIP + 1), ROWS_TO_SKIP + WARMUP_COUNT + 1)
      assert.equal(rowId(h.root, ROWS_TO_SKIP), ROWS_TO_SKIP)
      await clickRowRemoveAndFlush(h.root, ROWS_TO_SKIP + 2)
      assert.equal(rowId(h.root, ROWS_TO_SKIP + 2), ROWS_TO_SKIP + WARMUP_COUNT + 3)
    },
    run: async (h) => clickRowRemoveAndFlush(h.root, ROWS_TO_SKIP),
    verify: (h) => {
      assert.equal(rowCount(h.root), 1000 - WARMUP_COUNT - 2)
      assert.equal(rowId(h.root, ROWS_TO_SKIP), ROWS_TO_SKIP + WARMUP_COUNT + 1)
    },
  },
  {
    id: '07_create10k',
    label: 'create many rows',
    description: 'creating 10,000 rows',
    limits: {
      addedRows: 10000,
      removedRows: 0,
      cloneNode: 10020,
      appendChild: 10025,
      insertBefore: 2,
      removeChild: 0,
      replaceChildren: 0,
      textWrites: 20200,
    },
    counterLimits: {
      benchmarkMethodCalls: 1,
      buildRowIterations: 10000,
      randomCalls: 30000,
      updateLoopIterations: 0,
      swapBranchChecks: 0,
      swapBranchTaken: 0,
      removeCalls: 0,
      'store.rootSets': 1,
      'store.queue': 1,
      'store.queueUpdate': 1,
    },
    init: runAndClearWarmups,
    run: async (h) => clickAndFlush(h.root, '#runlots'),
    verify: (h) => {
      assert.equal(rowCount(h.root), 10000)
      assert.equal(uniqueRowClickHandlerCount(h.root), 2)
      assert.equal(rowId(h.root, 1), WARMUP_COUNT * 1000 + 1)
      assert.equal(rowId(h.root, 10000), WARMUP_COUNT * 1000 + 10000)
      assertRowUsesRawItem(h, 1)
    },
  },
  {
    id: '08_create1k-after1k_x2',
    label: 'append rows to large table',
    description: 'appending 1,000 rows to a table of 1,000 rows',
    limits: {
      addedRows: 1000,
      removedRows: 0,
      cloneNode: 1020,
      appendChild: 1025,
      insertBefore: 2,
      removeChild: 0,
      replaceChildren: 0,
      textWrites: 2200,
      classNameWrites: 0,
    },
    counterLimits: {
      benchmarkMethodCalls: 1,
      buildRowIterations: 1000,
      randomCalls: 3000,
      updateLoopIterations: 0,
      swapBranchChecks: 0,
      swapBranchTaken: 0,
      removeCalls: 0,
      'store.arrayMutations': 1,
      'store.arrayPush': 1,
      'store.rootSets': 0,
      'store.queue': 1,
      'store.queueAppend': 1,
      'store.flushes': 1,
      'store.observerCallbacks': 1,
    },
    init: async (h) => {
      await runAndClearWarmups(h)
      await clickAndFlush(h.root, '#run')
      assert.equal(rowCount(h.root), 1000)
      h.notes.set('firstRowBeforeAppend', rowAt(h.root, 1))
      h.notes.set('lastRowBeforeAppend', rowAt(h.root, 1000))
    },
    run: async (h) => clickAndFlush(h.root, '#add'),
    verify: (h) => {
      assert.equal(rowCount(h.root), 2000)
      assert.equal(rowAt(h.root, 1), h.notes.get('firstRowBeforeAppend'))
      assert.equal(rowAt(h.root, 1000), h.notes.get('lastRowBeforeAppend'))
      assert.equal(rowId(h.root, 1001), WARMUP_COUNT * 1000 + 1001)
      assert.equal(rowId(h.root, 2000), WARMUP_COUNT * 1000 + 2000)
    },
  },
  {
    id: '09_clear1k_x8',
    label: 'clear rows',
    description: 'clearing a table with 1,000 rows',
    limits: {
      addedRows: 0,
      removedRows: 1000,
      cloneNode: 0,
      appendChild: 1,
      insertBefore: 0,
      removeChild: 0,
      replaceChildren: 0,
      textWrites: 1,
      classNameWrites: 0,
    },
    counterLimits: {
      benchmarkMethodCalls: 1,
      buildRowIterations: 0,
      randomCalls: 0,
      updateLoopIterations: 0,
      swapBranchChecks: 0,
      swapBranchTaken: 0,
      removeCalls: 0,
      'store.rootSets': 1,
      'store.queue': 1,
      'store.queueUpdate': 1,
    },
    init: async (h) => {
      await runAndClearWarmups(h)
      await clickAndFlush(h.root, '#run')
      assert.equal(rowCount(h.root), 1000)
    },
    run: async (h) => clickAndFlush(h.root, '#clear'),
    verify: (h) => {
      assert.equal(rowCount(h.root), 0)
    },
  },
]

function runtimePathLabel(report: ScenarioReport): string {
  const rt = report.counters.runtime
  if (rt.freshCreateFastPath) return 'fresh'
  if (rt.disjointReplaceFastPath) return 'replace'
  if (rt.dirtyPatchPass) return `dirty:${rt.dirtyRows}`
  if (rt.arraySwapFastPath) return 'aipu-swap'
  if (rt.removeSingleFastPath) return 'remove1'
  if (rt.removeBatchFastPath) return 'removeN'
  if (rt.appendFastPath) return 'append'
  if (rt.bulkClearFastPath) return 'clear'
  if (rt.clearRemoveLoopPath) return 'clear-loop'
  if (rt.swapFastPath) return 'swap'
  if (rt.generalLisPath) return 'lis'
  return '-'
}

function formatBenchmarkReport(reports: ScenarioReport[]): string {
  const columns: Array<[string, (report: ScenarioReport) => string]> = [
    ['id', (r) => r.id],
    ['label', (r) => r.label],
    ['rows', (r) => `+${r.mutations.addedRows}/-${r.mutations.removedRows}`],
    ['clone', (r) => String(r.counts.cloneNode)],
    [
      'move',
      (r) => String(r.counts.appendChild + r.counts.insertBefore + r.counts.removeChild + r.counts.replaceChildren),
    ],
    ['text', (r) => String(r.counts.textContentWrites + r.counts.textDataWrites)],
    ['path', runtimePathLabel],
    ['appLoops', (r) => String(r.script.buildRowIterations + r.script.updateLoopIterations)],
    ['appBr', (r) => String(r.script.swapBranchChecks)],
    ['cEnt', (r) => String(r.counters.compiler.createEntry)],
    ['pEnt', (r) => String(r.counters.compiler.patchEntry)],
    ['iTxt', (r) => String(r.counters.compiler.initText)],
    ['pTxt', (r) => String(r.counters.compiler.patchText)],
    ['q', (r) => String(r.counters.store.queue)],
    ['qAipu', (r) => String(r.counters.store.queueAipu)],
    ['qApp', (r) => String(r.counters.store.queueAppend)],
    ['qRem', (r) => String(r.counters.store.queueRemove)],
    ['root', (r) => String(r.counters.store.rootSets)],
    ['direct', (r) => String(r.counters.store.directObserverNotifications)],
    ['domF', (r) => r.factor.toFixed(3)],
    ['ctrF', (r) => r.counterFactor.toFixed(3)],
  ]
  const rows = reports.map((report) => columns.map(([, getter]) => getter(report)))
  const widths = columns.map(([label], index) => Math.max(label.length, ...rows.map((row) => row[index].length)))
  const renderRow = (cells: string[]): string => cells.map((cell, i) => cell.padEnd(widths[i])).join('  ')
  const domMean = geometricMean(reports.map((report) => report.factor))
  const counterMean = geometricMean(reports.map((report) => report.counterFactor))
  return [
    '',
    'js-framework-benchmark deterministic report',
    'path/compiler/store counters are deterministic test-only counters; no V8 or OS profiler is required.',
    renderRow(columns.map(([label]) => label)),
    renderRow(widths.map((width) => '-'.repeat(width))),
    ...rows.map(renderRow),
    `geomean dom=${domMean.toFixed(3)} counters=${counterMean.toFixed(3)}`,
  ].join('\n')
}

function geometricMean(values: number[]): number {
  if (values.length === 0) return 0
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length)
}

describe('js-framework-benchmark operation contracts', { concurrency: false }, () => {
  let restoreDom: () => void
  const reports: ScenarioReport[] = []

  beforeEach(() => {
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  for (const scenario of scenarios) {
    it(`${scenario.label}: ${scenario.description}`, { timeout: 60_000 }, async () => {
      reports.push(await runScenario(scenario))
    })
  }

  it('weighted geometric mean of operation factors stays within budget', () => {
    if (reports.length > 0) console.log(formatBenchmarkReport(reports))
    assert.equal(reports.length, scenarios.length)
    const domMean = geometricMean(reports.map((report) => report.factor))
    const counterMean = geometricMean(reports.map((report) => report.counterFactor))
    assert.ok(domMean <= 1, `expected DOM geometric mean <= 1, got ${domMean}`)
    assert.ok(counterMean <= 1, `expected counter geometric mean <= 1, got ${counterMean}`)
  })

  it('list-only click rows still install a document click delegate', async () => {
    const transformed = await transformGeaSourceToEvalBody(LIST_ONLY_CLICK_SOURCE, '/virtual/list-only-click.tsx')
    assert.match(
      transformed,
      /\bensureClickDelegate\(parent\d+\)/,
      'list-scoped fast click handlers need an install call when no root click delegate is pending',
    )
  })
})
