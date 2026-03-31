/**
 * Gea Benchmark Profiler
 *
 * Instruments the gea runtime internals to measure where time is spent
 * during each benchmark operation. Uses window.__geaStore and
 * window.__geaComponent exposed by main-profile.js.
 *
 * Measured categories:
 *   - Proxy traps (set/get overhead via _emitChanges, _createProxy)
 *   - Change batching (_normalizeBatch, _deliverArrayItemPropBatch)
 *   - Observer routing (_collectMatchingObserverNodes, _notifyHandlers)
 *   - DOM operations (createDataItem, rebuildList, applyPropChanges, etc.)
 *   - Component observer handlers (__observe_store_data, __observe_store_selected)
 *
 * Each benchmark op is profiled twice: direct store.* (minimal JS path) and DOM
 * .click() on the same control (toolbar or row link) so totals can be compared.
 */
;(function () {
  'use strict'

  // ── Timing infrastructure ──────────────────────────────────────────

  const timings = {}

  let _rootGetByProp = null

  function resetTimings() {
    for (const key in timings) delete timings[key]
    if (_rootGetByProp) {
      for (const key in _rootGetByProp) delete _rootGetByProp[key]
    }
  }

  function startTiming(category) {
    if (!timings[category]) timings[category] = { total: 0, calls: 0 }
    timings[category]._start = performance.now()
    timings[category].calls++
  }

  function endTiming(category) {
    const entry = timings[category]
    if (entry && entry._start !== undefined) {
      entry.total += performance.now() - entry._start
      delete entry._start
    }
  }

  function getTimings() {
    const result = {}
    for (const key in timings) {
      result[key] = { total: +timings[key].total.toFixed(4), calls: timings[key].calls }
    }
    return result
  }

  // ── Method wrapping ────────────────────────────────────────────────

  function wrapMethod(obj, methodName, timingKey) {
    const orig = obj[methodName]
    if (!orig || typeof orig !== 'function' || orig.__instrumented) return
    obj[methodName] = function (...args) {
      startTiming(timingKey)
      try {
        return orig.apply(this, args)
      } finally {
        endTiming(timingKey)
      }
    }
    obj[methodName].__instrumented = true
    obj[methodName].__original = orig
  }

  function wrapBoundFn(obj, propName, timingKey) {
    const orig = obj[propName]
    if (!orig || typeof orig !== 'function' || orig.__instrumented) return
    obj[propName] = function () {
      startTiming(timingKey)
      try {
        return orig.call(this)
      } finally {
        endTiming(timingKey)
      }
    }
    obj[propName].__instrumented = true
  }

  // ── Instrumentation ────────────────────────────────────────────────

  function instrument() {
    const store = window.__geaStore
    const component = window.__geaComponent
    const realStore = window.__geaRealStore

    if (!store || !component || !realStore) {
      console.error('[Profiler] Missing globals. Ensure main-profile.js is loaded first.')
      return false
    }

    // ── Root proxy get/set traps ──

    const StoreClass = Object.getPrototypeOf(Object.getPrototypeOf(realStore)).constructor
    const rootHandler = StoreClass._browserRootProxyHandler

    const rawStore = store.__raw || realStore
    const rootGetByProp = {}
    _rootGetByProp = rootGetByProp

    if (rootHandler) {
      const origGet = rootHandler.get
      rootHandler.get = function (t, prop, receiver) {
        if (typeof prop !== 'symbol') {
          const isStore = t === rawStore
          const key = isStore ? 'proxy.storeGet' : 'proxy.componentGet'
          startTiming(key)
          if (!rootGetByProp[prop]) rootGetByProp[prop] = { store: 0, component: 0 }
          if (isStore) rootGetByProp[prop].store++
          else rootGetByProp[prop].component++
          try {
            return origGet.call(this, t, prop, receiver)
          } finally {
            endTiming(key)
          }
        }
        return origGet.call(this, t, prop, receiver)
      }

      const origSet = rootHandler.set
      rootHandler.set = function (t, prop, value) {
        if (typeof prop !== 'symbol') {
          const key = t === rawStore ? 'proxy.storeSet' : 'proxy.componentSet'
          startTiming(key)
          try {
            return origSet.call(this, t, prop, value)
          } finally {
            endTiming(key)
          }
        }
        return origSet.call(this, t, prop, value)
      }
    }

    // ── DOM write instrumentation ──

    const textContentDesc = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')
    if (textContentDesc && textContentDesc.set) {
      const origSet = textContentDesc.set
      Object.defineProperty(Node.prototype, 'textContent', {
        ...textContentDesc,
        set(val) {
          startTiming('dom.textContent')
          try {
            origSet.call(this, val)
          } finally {
            endTiming('dom.textContent')
          }
        },
      })
    }

    const classNameDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'className')
    if (classNameDesc && classNameDesc.set) {
      const origSet = classNameDesc.set
      Object.defineProperty(Element.prototype, 'className', {
        ...classNameDesc,
        set(val) {
          startTiming('dom.className')
          try {
            origSet.call(this, val)
          } finally {
            endTiming('dom.className')
          }
        },
      })
    }

    const origSetAttr = Element.prototype.setAttribute
    Element.prototype.setAttribute = function (name, value) {
      startTiming('dom.setAttribute')
      try {
        return origSetAttr.call(this, name, value)
      } finally {
        endTiming('dom.setAttribute')
      }
    }

    const origRemoveAttr = Element.prototype.removeAttribute
    Element.prototype.removeAttribute = function (name) {
      startTiming('dom.removeAttribute')
      try {
        return origRemoveAttr.call(this, name)
      } finally {
        endTiming('dom.removeAttribute')
      }
    }

    const nodeValueDesc = Object.getOwnPropertyDescriptor(Node.prototype, 'nodeValue')
    if (nodeValueDesc && nodeValueDesc.set) {
      const origSet = nodeValueDesc.set
      Object.defineProperty(Node.prototype, 'nodeValue', {
        ...nodeValueDesc,
        set(val) {
          startTiming('dom.nodeValue')
          try {
            origSet.call(this, val)
          } finally {
            endTiming('dom.nodeValue')
          }
        },
      })
    }

    const innerHTMLDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')
    if (innerHTMLDesc && innerHTMLDesc.set) {
      const origSet = innerHTMLDesc.set
      Object.defineProperty(Element.prototype, 'innerHTML', {
        ...innerHTMLDesc,
        set(val) {
          startTiming('dom.innerHTML')
          try {
            origSet.call(this, val)
          } finally {
            endTiming('dom.innerHTML')
          }
        },
      })
    }

    // ── Store internals (on realStore instance and prototype chain) ──

    // _flushChanges is a bound arrow fn on the instance
    wrapBoundFn(realStore, '_flushChanges', 'store._flushChanges')

    // Static methods
    wrapMethod(StoreClass, 'flushAll', 'Store.flushAll')

    // Prototype methods (Store.prototype)
    const storeProto = Object.getPrototypeOf(Object.getPrototypeOf(realStore))
    wrapMethod(storeProto, '_normalizeBatch', 'store._normalizeBatch')
    wrapMethod(storeProto, '_deliverArrayItemPropBatch', 'store._deliverArrayItemPropBatch')
    wrapMethod(storeProto, '_collectMatchingObserverNodes', 'store._collectMatchingObserverNodes')
    wrapMethod(storeProto, '_collectMatchingObserverNodesFromNode', 'store._collectMatchingObserverNodesFromNode')
    wrapMethod(storeProto, '_notifyHandlers', 'store._notifyHandlers')
    wrapMethod(storeProto, '_emitChanges', 'store._emitChanges')
    wrapMethod(storeProto, '_createProxy', 'store._createProxy')
    wrapMethod(storeProto, '_interceptArrayMethod', 'store._interceptArrayMethod')
    wrapMethod(storeProto, '_queueDirectArrayItemPrimitiveChange', 'store._queueDirectArrayItemPrimitiveChange')

    // BenchmarkStore methods
    const bsProto = Object.getPrototypeOf(realStore)
    wrapMethod(bsProto, 'run', 'benchmarkStore.run')
    wrapMethod(bsProto, 'runLots', 'benchmarkStore.runLots')
    wrapMethod(bsProto, 'add', 'benchmarkStore.add')
    wrapMethod(bsProto, 'update', 'benchmarkStore.update')
    wrapMethod(bsProto, 'clear', 'benchmarkStore.clear')
    wrapMethod(bsProto, 'swapRows', 'benchmarkStore.swapRows')
    wrapMethod(bsProto, 'select', 'benchmarkStore.select')
    wrapMethod(bsProto, 'remove', 'benchmarkStore.remove')

    // ── Component methods ──

    const compInstanceProto = Object.getPrototypeOf(component) // Benchmark.prototype
    wrapMethod(compInstanceProto, '__observe_store_data', 'component.__observe_store_data')
    wrapMethod(compInstanceProto, '__observe_store_selected', 'component.__observe_store_selected')
    wrapMethod(compInstanceProto, '__applyListChanges', 'component.__applyListChanges')
    wrapMethod(compInstanceProto, 'createDataItem', 'component.createDataItem')
    wrapMethod(compInstanceProto, 'patchDataItem', 'component.patchDataItem')
    wrapMethod(compInstanceProto, 'renderDataItem', 'component.renderDataItem')
    wrapMethod(compInstanceProto, '__ensureArrayConfigs', 'component.__ensureArrayConfigs')
    wrapMethod(compInstanceProto, '__getMapItemFromEvent_store_data', 'component.__getMapItemFromEvent')

    // Component.prototype (parent class)
    const compProto = Object.getPrototypeOf(compInstanceProto)
    wrapMethod(compProto, '__geaSyncItems', 'component.__geaSyncItems')
    wrapMethod(compProto, '__geaSyncMap', 'component.__geaSyncMap')
    wrapMethod(compProto, '__geaCloneItem', 'component.__geaCloneItem')
    wrapMethod(compProto, 'render', 'component.render')

    console.log('[Profiler] Instrumentation complete.')
    return true
  }

  // ── Async helpers ──────────────────────────────────────────────────

  let _postFlushTime = 0

  function waitForFlush() {
    // Store uses queueMicrotask, so we need to wait for microtasks + a frame.
    // Capture the time after microtasks drain (post-flush) to separate
    // framework work from browser layout/reflow + scheduling overhead.
    return new Promise((resolve) => {
      queueMicrotask(() => {
        queueMicrotask(() => {
          _postFlushTime = performance.now()
          requestAnimationFrame(() => {
            setTimeout(resolve, 0)
          })
        })
      })
    })
  }

  /** IDs match benchmark/src/benchmark.js toolbar buttons */
  function getToolbarButtons() {
    return {
      run: document.getElementById('run'),
      runlots: document.getElementById('runlots'),
      add: document.getElementById('add'),
      update: document.getElementById('update'),
      clear: document.getElementById('clear'),
      swaprows: document.getElementById('swaprows'),
    }
  }

  function clickEl(el) {
    if (el && typeof el.click === 'function') el.click()
  }

  // Keys: [directResultKey, clickResultKey] — used by formatResults / exportComparisonPairs
  const DIRECT_VS_CLICK_PAIRS = [
    ['create1k', 'create1kClick'],
    ['replaceAll', 'replaceAllClick'],
    ['partialUpdate', 'partialUpdateClick'],
    ['selectRow', 'selectRowClick'],
    ['swapRows', 'swapRowsClick'],
    ['removeRow', 'removeRowClick'],
    ['create10k', 'create10kClick'],
    ['append1k', 'append1kClick'],
    ['clearRows', 'clearRowsClick'],
  ]

  // ── Benchmark operations ───────────────────────────────────────────

  async function profileOperation(name, setup, action, iterations = 5) {
    const store = window.__geaStore
    const results = []

    for (let i = 0; i < iterations; i++) {
      if (setup) {
        setup(store)
        await waitForFlush()
      }

      resetTimings()
      const t0 = performance.now()
      action(store, i)
      const tSync = performance.now()
      await waitForFlush()
      const tEnd = performance.now()

      const rootGetSnapshot = _rootGetByProp ? { ..._rootGetByProp } : {}
      results.push({
        totalTime: +(tEnd - t0).toFixed(3),
        syncTime: +(tSync - t0).toFixed(3),
        flushTime: +(_postFlushTime - tSync).toFixed(3),
        layoutTime: +(tEnd - _postFlushTime).toFixed(3),
        breakdown: getTimings(),
        rootGetByProp: rootGetSnapshot,
      })
    }

    return { name, results }
  }

  async function runAllProfiles() {
    const store = window.__geaStore
    const results = {}
    const toolbar = getToolbarButtons()
    const tbody = document.getElementById('tbody')

    // 1. Create 1,000 rows
    // Warmup
    for (let i = 0; i < 5; i++) {
      store.run()
      await waitForFlush()
    }
    results.create1k = await profileOperation(
      'create 1,000 rows (direct)',
      (s) => {
        s.clear()
      },
      (s) => {
        s.run()
      },
      10,
    )
    results.create1kClick = await profileOperation(
      'create 1,000 rows (click)',
      (s) => {
        s.clear()
      },
      () => {
        clickEl(toolbar.run)
      },
      10,
    )

    // 2. Replace all rows
    for (let i = 0; i < 5; i++) {
      store.run()
      await waitForFlush()
    }
    results.replaceAll = await profileOperation(
      'replace all 1,000 rows (direct)',
      (s) => {
        s.run()
      },
      (s) => {
        s.run()
      },
      10,
    )
    results.replaceAllClick = await profileOperation(
      'replace all 1,000 rows (click)',
      (s) => {
        s.run()
      },
      () => {
        clickEl(toolbar.run)
      },
      10,
    )

    // 3. Partial update (every 10th row)
    for (let i = 0; i < 3; i++) {
      store.run()
      store.update()
      await waitForFlush()
    }
    results.partialUpdate = await profileOperation(
      'partial update (every 10th row) (direct)',
      (s) => {
        s.run()
      },
      (s) => {
        s.update()
      },
      10,
    )
    results.partialUpdateClick = await profileOperation(
      'partial update (every 10th row) (click)',
      (s) => {
        s.run()
      },
      () => {
        clickEl(toolbar.update)
      },
      10,
    )

    // 4. Select row
    for (let i = 0; i < 5; i++) {
      store.run()
      store.select(i + 1)
      await waitForFlush()
    }
    let selectCounter = 1
    results.selectRow = await profileOperation(
      'select row (direct)',
      (s) => {
        if (selectCounter === 1) {
          s.run()
        }
      },
      (s) => {
        s.select(selectCounter++)
      },
      20,
    )

    let selectClickCounter = 0
    results.selectRowClick = await profileOperation(
      'select row (click)',
      (s) => {
        if (selectClickCounter === 0) {
          s.run()
        }
      },
      () => {
        const row = tbody.children[selectClickCounter++]
        if (!row) return
        const link = row.children[1]?.querySelector('a')
        if (link) link.click()
      },
      20,
    )

    // 5. Swap rows
    for (let i = 0; i < 5; i++) {
      store.run()
      store.swapRows()
      await waitForFlush()
    }
    results.swapRows = await profileOperation(
      'swap rows (direct)',
      (s) => {
        s.run()
      },
      (s) => {
        s.swapRows()
      },
      10,
    )
    results.swapRowsClick = await profileOperation(
      'swap rows (click)',
      (s) => {
        s.run()
      },
      () => {
        clickEl(toolbar.swaprows)
      },
      10,
    )

    // 6. Remove row
    results.removeRow = await profileOperation(
      'remove row (direct)',
      (s) => {
        s.run()
      },
      (s) => {
        s.remove(500)
      },
      10,
    )
    results.removeRowClick = await profileOperation(
      'remove row (click)',
      (s) => {
        s.run()
      },
      () => {
        const row = tbody.children[500]
        if (!row) return
        const removeLink = row.children[2]?.querySelector('a')
        if (removeLink) removeLink.click()
      },
      10,
    )

    // 7. Create 10,000 rows
    for (let i = 0; i < 3; i++) {
      store.runLots()
      await waitForFlush()
    }
    results.create10k = await profileOperation(
      'create 10,000 rows (direct)',
      (s) => {
        s.clear()
      },
      (s) => {
        s.runLots()
      },
      5,
    )
    results.create10kClick = await profileOperation(
      'create 10,000 rows (click)',
      (s) => {
        s.clear()
      },
      () => {
        clickEl(toolbar.runlots)
      },
      5,
    )

    // 8. Append 1,000 rows
    results.append1k = await profileOperation(
      'append 1,000 rows (direct)',
      (s) => {
        s.run()
      },
      (s) => {
        s.add()
      },
      10,
    )
    results.append1kClick = await profileOperation(
      'append 1,000 rows (click)',
      (s) => {
        s.run()
      },
      () => {
        clickEl(toolbar.add)
      },
      10,
    )

    // 9. Clear rows
    results.clearRows = await profileOperation(
      'clear rows (direct)',
      (s) => {
        s.run()
      },
      (s) => {
        s.clear()
      },
      10,
    )
    results.clearRowsClick = await profileOperation(
      'clear rows (click)',
      (s) => {
        s.run()
      },
      () => {
        clickEl(toolbar.clear)
      },
      10,
    )

    return results
  }

  // ── Results formatting ─────────────────────────────────────────────

  // Define which categories are "leaf" (actual work) vs "parent" (contain children)
  const HIERARCHY = {
    'store._flushChanges': [
      'store._normalizeBatch',
      'store._deliverArrayItemPropBatch',
      'store._collectMatchingObserverNodes',
      'store._collectMatchingObserverNodesFromNode',
      'store._notifyHandlers',
    ],
    'store._notifyHandlers': ['component.__observe_store_data', 'component.__observe_store_selected'],
    'component.__observe_store_data': ['component.__applyListChanges'],
    'component.__applyListChanges': ['component.createDataItem'],
    'component.createDataItem': ['component.renderDataItem'],
  }

  function getLeafCategories(allCats) {
    const parents = new Set()
    for (const [parent, children] of Object.entries(HIERARCHY)) {
      if (children.some((c) => allCats.includes(c)) && allCats.includes(parent)) {
        parents.add(parent)
      }
    }
    return allCats.filter((c) => !parents.has(c))
  }

  /** Stable order: each pair is direct then click; any extra keys last */
  function orderedResultKeys(allResults) {
    const seen = new Set()
    const keys = []
    for (const [a, b] of DIRECT_VS_CLICK_PAIRS) {
      if (allResults[a] && !seen.has(a)) {
        keys.push(a)
        seen.add(a)
      }
      if (allResults[b] && !seen.has(b)) {
        keys.push(b)
        seen.add(b)
      }
    }
    for (const k of Object.keys(allResults)) {
      if (!seen.has(k)) keys.push(k)
    }
    return keys
  }

  function avgPhase(data, field) {
    const n = data.results.length
    return data.results.reduce((s, r) => s + r[field], 0) / n
  }

  function exportComparisonPairs(allResults) {
    const pairs = []
    for (const [directKey, clickKey] of DIRECT_VS_CLICK_PAIRS) {
      const d = allResults[directKey]
      const c = allResults[clickKey]
      if (!d || !c) continue
      const label = d.name.replace(/\s*\(direct\)\s*$/i, '').trim()
      pairs.push({
        name: label,
        directKey,
        clickKey,
        avgTotalMsDirect: +avgPhase(d, 'totalTime').toFixed(3),
        avgTotalMsClick: +avgPhase(c, 'totalTime').toFixed(3),
        deltaTotalMs: +(avgPhase(c, 'totalTime') - avgPhase(d, 'totalTime')).toFixed(3),
        avgSyncMsDirect: +avgPhase(d, 'syncTime').toFixed(3),
        avgSyncMsClick: +avgPhase(c, 'syncTime').toFixed(3),
        deltaSyncMs: +(avgPhase(c, 'syncTime') - avgPhase(d, 'syncTime')).toFixed(3),
        avgFlushMsDirect: +avgPhase(d, 'flushTime').toFixed(3),
        avgFlushMsClick: +avgPhase(c, 'flushTime').toFixed(3),
        deltaFlushMs: +(avgPhase(c, 'flushTime') - avgPhase(d, 'flushTime')).toFixed(3),
        avgLayoutMsDirect: +avgPhase(d, 'layoutTime').toFixed(3),
        avgLayoutMsClick: +avgPhase(c, 'layoutTime').toFixed(3),
        deltaLayoutMs: +(avgPhase(c, 'layoutTime') - avgPhase(d, 'layoutTime')).toFixed(3),
      })
    }
    return pairs
  }

  function formatResults(allResults) {
    const lines = []
    lines.push('═'.repeat(100))
    lines.push('  GEA BENCHMARK PROFILING RESULTS')
    lines.push('═'.repeat(100))

    for (const key of orderedResultKeys(allResults)) {
      const data = allResults[key]
      lines.push('')
      lines.push(`  ── ${data.name} ${'─'.repeat(Math.max(0, 85 - data.name.length))}`)

      const n = data.results.length
      const avgTotal = data.results.reduce((s, r) => s + r.totalTime, 0) / n
      const stddev = Math.sqrt(data.results.reduce((s, r) => s + (r.totalTime - avgTotal) ** 2, 0) / n)
      const avgSync = data.results.reduce((s, r) => s + r.syncTime, 0) / n
      const avgFlush = data.results.reduce((s, r) => s + r.flushTime, 0) / n
      const avgLayout = data.results.reduce((s, r) => s + r.layoutTime, 0) / n
      lines.push(`  Total: ${avgTotal.toFixed(2)}ms ±${stddev.toFixed(2)}ms (${n} runs)`)
      lines.push(
        `  Phases: sync ${avgSync.toFixed(2)}ms │ flush ${avgFlush.toFixed(2)}ms │ layout/paint ${avgLayout.toFixed(2)}ms`,
      )
      lines.push('')

      // Aggregate breakdown
      const aggregated = {}
      for (const run of data.results) {
        for (const [cat, info] of Object.entries(run.breakdown)) {
          if (!aggregated[cat]) aggregated[cat] = { total: 0, calls: 0, count: 0 }
          aggregated[cat].total += info.total
          aggregated[cat].calls += info.calls
          aggregated[cat].count++
        }
      }

      const sorted = Object.entries(aggregated).sort((a, b) => b[1].total - a[1].total)
      const allCats = sorted.map(([k]) => k)
      const leafCats = new Set(getLeafCategories(allCats))

      lines.push(`  ${'Category'.padEnd(50)} ${'Avg ms'.padStart(10)} ${'Calls'.padStart(8)} ${'%total'.padStart(8)}`)
      lines.push(`  ${'─'.repeat(50)} ${'─'.repeat(10)} ${'─'.repeat(8)} ${'─'.repeat(8)}`)

      let totalCalls = 0
      for (const [cat, info] of sorted) {
        const avgTime = info.total / info.count
        const avgCalls = Math.round(info.calls / info.count)
        const pct = avgTotal > 0 ? (avgTime / avgTotal) * 100 : 0
        const isLeaf = leafCats.has(cat)
        totalCalls += avgCalls

        if (avgTime >= 0.005 || avgCalls > 0) {
          const marker = isLeaf ? '  ' : '▸ '
          lines.push(
            `  ${marker}${cat.padEnd(48)} ${avgTime.toFixed(3).padStart(10)} ${String(avgCalls).padStart(8)} ${(pct.toFixed(1) + '%').padStart(8)}`,
          )
        }
      }
      lines.push(`  ${'─'.repeat(50)} ${'─'.repeat(10)} ${'─'.repeat(8)} ${'─'.repeat(8)}`)
      lines.push(`  ${'TOTAL INSTRUMENTED CALLS'.padEnd(50)} ${''.padStart(10)} ${String(totalCalls).padStart(8)}`)

      // Break down unaccounted time using phase measurements
      const storeMethodKeys = ['run', 'runLots', 'add', 'update', 'clear', 'swapRows', 'select', 'remove']
      let instrumentedAction = 0
      for (const m of storeMethodKeys) {
        const entry = aggregated['benchmarkStore.' + m]
        if (entry) {
          instrumentedAction = entry.total / entry.count
          break
        }
      }
      const proxyOverhead = Math.max(0, avgSync - instrumentedAction)

      // DOM overhead = flush phase time minus instrumented flush internals
      const instrumentedFlush = aggregated['store._flushChanges']
        ? aggregated['store._flushChanges'].total / aggregated['store._flushChanges'].count
        : 0
      const domOverhead = Math.max(0, avgFlush - instrumentedFlush)

      if (proxyOverhead > 0.01) {
        lines.push(
          `  * ${'proxy/mutation overhead (sync − instrumented)'.padEnd(48)} ${proxyOverhead.toFixed(3).padStart(10)} ${''.padStart(8)} ${((proxyOverhead / avgTotal) * 100).toFixed(1).padStart(7)}%`,
        )
      }
      if (domOverhead > 0.01) {
        lines.push(
          `  * ${'DOM overhead (flush − instrumented)'.padEnd(48)} ${domOverhead.toFixed(3).padStart(10)} ${''.padStart(8)} ${((domOverhead / avgTotal) * 100).toFixed(1).padStart(7)}%`,
        )
      }
      if (avgLayout > 0.01) {
        lines.push(
          `  * ${'browser layout/paint + scheduling'.padEnd(48)} ${avgLayout.toFixed(3).padStart(10)} ${''.padStart(8)} ${((avgLayout / avgTotal) * 100).toFixed(1).padStart(7)}%`,
        )
      }
    }

    lines.push('')
    lines.push('═'.repeat(100))
    lines.push('  DIRECT vs CLICK — same work; click adds native DOM dispatch + Gea handler path')
    lines.push('═'.repeat(100))
    lines.push(
      `  ${'Operation'.padEnd(44)} ${'direct ms'.padStart(10)} ${'click ms'.padStart(10)} ${'Δ total'.padStart(10)} ${'Δ sync'.padStart(10)}`,
    )
    lines.push(`  ${'─'.repeat(44)} ${'─'.repeat(10)} ${'─'.repeat(10)} ${'─'.repeat(10)} ${'─'.repeat(10)}`)
    for (const row of exportComparisonPairs(allResults)) {
      const name = row.name.length > 44 ? row.name.slice(0, 41) + '…' : row.name
      lines.push(
        `  ${name.padEnd(44)} ${String(row.avgTotalMsDirect).padStart(10)} ${String(row.avgTotalMsClick).padStart(10)} ${String(row.deltaTotalMs).padStart(10)} ${String(row.deltaSyncMs).padStart(10)}`,
      )
    }
    lines.push(`  ${'─'.repeat(44)} ${'─'.repeat(10)} ${'─'.repeat(10)} ${'─'.repeat(10)} ${'─'.repeat(10)}`)
    lines.push('  Δ total = click − direct (overall). Δ sync ≈ extra before microtask flush (event path + store work).')
    lines.push('')

    lines.push('═'.repeat(100))
    lines.push('')
    lines.push('Legend:')
    lines.push('  ▸  = parent category (time includes child categories)')
    lines.push('     = leaf category (actual self-time)')
    lines.push('  *  = unaccounted time, split by phase:')
    lines.push('       proxy/mutation  = sync action time not covered by instrumented store methods')
    lines.push('       DOM overhead    = flush phase time not covered by instrumented _flushChanges')
    lines.push('       layout/paint    = browser reflow + rAF/setTimeout scheduling after flush')
    lines.push('')
    lines.push('  Phases: sync = action() call │ flush = microtask drain │ layout/paint = post-flush')
    lines.push('  Direct runs call store methods only; click runs use .click() on the same UI as the benchmark app.')
    lines.push('')
    return lines.join('\n')
  }

  // ── JSON export for programmatic analysis ──────────────────────────

  function exportJSON(allResults) {
    const exported = {}
    for (const [key, data] of Object.entries(allResults)) {
      const n = data.results.length
      const avgTotal = data.results.reduce((s, r) => s + r.totalTime, 0) / n

      const aggregated = {}
      for (const run of data.results) {
        for (const [cat, info] of Object.entries(run.breakdown)) {
          if (!aggregated[cat]) aggregated[cat] = { total: 0, calls: 0, count: 0 }
          aggregated[cat].total += info.total
          aggregated[cat].calls += info.calls
          aggregated[cat].count++
        }
      }

      const breakdown = {}
      for (const [cat, info] of Object.entries(aggregated)) {
        breakdown[cat] = {
          avgMs: +(info.total / info.count).toFixed(4),
          avgCalls: Math.round(info.calls / info.count),
          pctOfTotal: +((info.total / info.count / avgTotal) * 100).toFixed(2),
        }
      }

      const avgSync = data.results.reduce((s, r) => s + r.syncTime, 0) / n
      const avgFlush = data.results.reduce((s, r) => s + r.flushTime, 0) / n
      const avgLayout = data.results.reduce((s, r) => s + r.layoutTime, 0) / n

      const rootGetAgg = {}
      for (const run of data.results) {
        if (run.rootGetByProp) {
          for (const [prop, counts] of Object.entries(run.rootGetByProp)) {
            if (!rootGetAgg[prop]) rootGetAgg[prop] = { store: 0, component: 0 }
            rootGetAgg[prop].store += counts.store || 0
            rootGetAgg[prop].component += counts.component || 0
          }
        }
      }
      const rootGetByProp = {}
      for (const [prop, totals] of Object.entries(rootGetAgg)) {
        rootGetByProp[prop] = {
          store: Math.round(totals.store / n),
          component: Math.round(totals.component / n),
        }
      }

      exported[key] = {
        name: data.name,
        avgTotalMs: +avgTotal.toFixed(3),
        avgSyncMs: +avgSync.toFixed(3),
        avgFlushMs: +avgFlush.toFixed(3),
        avgLayoutMs: +avgLayout.toFixed(3),
        runs: n,
        breakdown,
        rootGetByProp,
      }
    }
    return exported
  }

  // ── Public API ─────────────────────────────────────────────────────

  window.__geaProfiler = {
    instrument,
    runAllProfiles,
    formatResults,
    exportJSON,
    exportComparisonPairs,
    resetTimings,
    getTimings,
    profileOperation,
    waitForFlush,
  }
})()
