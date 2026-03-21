import { Component } from '@geajs/core'
import { VanillaMachine, normalizeProps, spreadProps } from '@zag-js/vanilla'

type SpreadCleanup = () => void
type PropsGetter = string | ((api: any, el: Element) => Record<string, any>)

export interface SpreadMap {
  [selector: string]: PropsGetter
}

export default class ZagComponent extends Component {
  declare _machine: VanillaMachine<any> | null
  declare _api: any
  declare _spreadCleanups: Map<string, SpreadCleanup>
  declare _spreadScheduled: boolean

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

  created(props: any) {
    if (!this._spreadCleanups) this._spreadCleanups = new Map()
    if (this._spreadScheduled === undefined) this._spreadScheduled = false

    const machineDef = this.createMachine(props)
    if (!machineDef) return

    const machineProps = this.getMachineProps(props)
    this._machine = new VanillaMachine(machineDef, machineProps)
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

  __geaUpdateProps(nextProps: Record<string, any>) {
    super.__geaUpdateProps(nextProps)
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
    return results
  }

  _applyAllSpreads() {
    if (!this.rendered_ || !this._api) return
    const map = this.getSpreadMap()

    for (const selector in map) {
      const getter = map[selector]
      const elements = this._queryAllIncludingSelf(selector)

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i]
        const key = selector + ':' + i
        const nextProps = this._resolveProps(getter, el)
        if (!nextProps) continue

        const cleanup = spreadProps(el, nextProps)
        this._spreadCleanups.set(key, cleanup)
      }
    }
  }

  onAfterRender() {
    this._cacheArrayContainers()
    this._applyAllSpreads()
  }

  _cacheArrayContainers() {
    const maps = (this as any).__geaMaps
    if (!maps) return
    for (const idx in maps) {
      const map = maps[idx]
      map.container = map.getContainer()
      if (map.container) (this as any)[map.containerProp] = map.container
    }
  }

  dispose() {
    for (const cleanup of this._spreadCleanups.values()) {
      cleanup()
    }
    this._spreadCleanups.clear()

    if (this._machine) {
      this._machine.stop()
      this._machine = null
    }
    this._api = null

    super.dispose()
  }

  static normalizeProps = normalizeProps
}
