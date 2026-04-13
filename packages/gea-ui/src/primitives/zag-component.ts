import { Component, GEA_ON_PROP_CHANGE } from '@geajs/core'
import { VanillaMachine, normalizeProps, spreadProps } from '@zag-js/vanilla'

/**
 * Under the closure-compiled runtime there is no `[GEA_MAPS]` registry on the
 * component. Zag integration now uses `registerListState(listId, state)` /
 * `onItemSync(listId, idx)` hooks that the compiled `keyedList` call invokes.
 * We keep a local Map of list states keyed by the compiler's listId string.
 */
interface ListStateRecord {
  container: Element
  containerProp?: string
  getContainer?: () => Element
}

type SpreadCleanup = () => void
type PropsGetter = string | ((api: any, el: Element) => Record<string, any>)

export interface SpreadMap {
  [selector: string]: PropsGetter
}

export default class ZagComponent<P = Record<string, unknown>> extends Component<P> {
  declare _machine: VanillaMachine<any> | null
  declare _api: any
  // Initialize fields eagerly — under the closure-compiled runtime, `created()`
  // may be called AFTER `[GEA_CREATE_TEMPLATE]`, which references these caches.
  _spreadCleanups: Map<string, SpreadCleanup> = new Map()
  _spreadScheduled: boolean = false
  _zagIdMap: Map<string, Element> = new Map()
  _elementCache: Map<string, Element[]> = new Map()

  createMachine(_props: any): any {
    return null
  }

  getMachineProps(_props: any): any {
    return {}
  }

  connectApi(_service: any): any {
    return null
  }

  getSpreadMap() {
    return {}
  }

  syncState(_api: any): void {}

  created(props: P) {
    if (!this._spreadCleanups) this._spreadCleanups = new Map()
    if (this._spreadScheduled === undefined) this._spreadScheduled = false
    if (!this._zagIdMap) this._zagIdMap = new Map()
    if (!this._elementCache) this._elementCache = new Map()

    const machineDef = this.createMachine(props)
    if (!machineDef) return

    const machineProps = this.getMachineProps(props)
    this._machine = new VanillaMachine(machineDef, machineProps)

    // Patch scope.getById: Zag uses IDs like "tags-input:xyz:..." for DOM
    // lookups, but _applyAllSpreads restores compiler binding IDs on elements.
    // The mapping lets Zag find elements by their expected Zag IDs.
    const zagIdMap = this._zagIdMap
    const origGetById = this._machine.scope.getById
    this._machine.scope.getById = ((id: string) => {
      return origGetById(id) || zagIdMap.get(id) || null
    }) as typeof origGetById

    this._machine.start()

    this._api = this.connectApi(this._machine.service)
    this.syncState(this._api)

    this._machine.subscribe(() => {
      if (!this._machine) return
      this._api = this.connectApi(this._machine.service)
      this._scheduleSpreadApplication()
    })
  }

  _syncMachineProps() {
    const machine = this._machine as any
    if (!machine?.userPropsRef) return
    const next = this.getMachineProps(this.props)
    machine.userPropsRef.current = next
    this._api = this.connectApi(this._machine!.service)
    this._scheduleSpreadApplication()
  }

  [GEA_ON_PROP_CHANGE](_key: string, _next: unknown) {
    this._syncMachineProps()
  }

  _scheduleSpreadApplication() {
    if (this._spreadScheduled) return
    this._spreadScheduled = true
    queueMicrotask(() => {
      this._spreadScheduled = false
      this._applyAllSpreads()
    })
  }

  _resolveProps(getter: PropsGetter, el: Element): Record<string, any> | null {
    if (typeof getter === 'function') {
      return getter(this._api, el)
    }
    const method = this._api[getter]
    if (typeof method !== 'function') return null
    return method.call(this._api)
  }

  _queryAllIncludingSelf(selector: string): Element[] {
    const results = this.$$(selector)
    const root = this.el
    if (root && root.matches(selector) && !results.includes(root)) {
      results.unshift(root)
    }
    // Exclude elements that live inside ANOTHER component's subtree. Every
    // mounted Gea component tags its root element with `GEA_DOM_COMPONENT`
    // (Symbol.for('gea.dom.component')). Walking up from each match toward
    // `root`, if we cross a tagged element whose component !== this, that
    // match belongs to a nested component — skip it. Prevents a parent
    // ZagComponent (e.g. Dialog) from clobbering child-Zag parts like
    // `[data-part="trigger"]` shared by Select/Menu/Tabs, which live inside
    // a slot (`props.children`) and aren't tracked in `this._cc`.
    const COMP = Symbol.for('gea.dom.component')
    if (!root) return results
    const filtered: Element[] = []
    for (const el of results) {
      let cur: Element | null = el
      let foreign = false
      while (cur && cur !== root) {
        const owner = (cur as any)[COMP]
        if (owner && owner !== this) {
          foreign = true
          break
        }
        cur = cur.parentElement
      }
      if (!foreign) filtered.push(el)
    }
    return filtered
  }

  _applyAllSpreads() {
    if (!this.rendered || !this._api) return
    const map = this.getSpreadMap()

    for (const selector in map) {
      const getter = map[selector]

      let elements = this._elementCache.get(selector)
      if (!elements) {
        elements = this._queryAllIncludingSelf(selector)
        this._elementCache.set(selector, elements)
      }

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i]
        const key = selector + ':' + i
        const nextProps = this._resolveProps(getter, el)
        if (!nextProps) continue

        // Preserve compiled binding IDs: Zag's spreadProps overrides element
        // IDs, but the compiler's observers rely on getElementById with binding
        // IDs. We restore the binding ID and store the Zag ID in _zagIdMap so
        // scope.getById (patched in created()) can still find elements.
        // Note: we never clear _zagIdMap here because spreadProps caches
        // previous attrs and skips unchanged values — on subsequent calls the
        // ID won't be re-set, so we'd lose the mapping.
        const bindingId = el.id
        const cleanup = spreadProps(el, nextProps)
        if (bindingId && el.id !== bindingId) {
          this._zagIdMap.set(el.id, el)
          el.id = bindingId
        }
        this._spreadCleanups.set(key, cleanup)
      }
    }
  }

  /** Compiled keyedList calls this on the owner after each reconciliation. */
  onItemSync(_listId: string, _idx: number) {
    this._elementCache.clear()
    this._scheduleSpreadApplication()
  }

  /** Compiled keyedList calls this once per list at construction. */
  registerListState(listId: string, state: ListStateRecord) {
    if (!this._listStates) this._listStates = new Map()
    this._listStates.set(listId, state)
  }

  unregisterListState(listId: string) {
    this._listStates?.delete(listId)
  }

  declare _listStates: Map<string, ListStateRecord>

  onAfterRender() {
    this._cacheArrayContainers()
    this._elementCache.clear()
    // If the machine was stopped (parent conditional removed this component's
    // subtree) and the subtree is now re-shown, re-create the Zag machine
    // so spread props + event handlers work again.
    if ((this as any)._machineStopped && !this._machine) {
      ;(this as any)._machineStopped = false
      try {
        this.created(this.props)
      } catch {
        /* isolated */
      }
    }
    this._applyAllSpreads()
  }

  _cacheArrayContainers() {
    if (!this._listStates) return
    for (const state of this._listStates.values()) {
      if (state.getContainer) state.container = state.getContainer()
      if (state.container && state.containerProp) (this as any)[state.containerProp] = state.container
    }
  }

  /** Stop the Zag machine + spread cleanups without fully disposing the
   *  component. Invoked when a parent conditional slot removes this
   *  component's DOM subtree so side effects on `<html>` (pointer-events,
   *  aria-hidden, scroll lock) are restored. The component instance stays
   *  alive so it can re-render if the conditional becomes truthy again. */
  _stopMachine() {
    for (const cleanup of this._spreadCleanups.values()) {
      try {
        cleanup()
      } catch {
        /* isolated */
      }
    }
    this._spreadCleanups.clear()
    if (this._machine) {
      try {
        this._machine.stop()
      } catch {
        /* isolated */
      }
      this._machine = null
    }
    this._api = null
    this._zagIdMap?.clear()
    this._elementCache?.clear()
  }

  dispose() {
    this._stopMachine()
    super.dispose()
  }

  static normalizeProps = normalizeProps
}
