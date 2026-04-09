import * as toast from '@zag-js/toast'
import { VanillaMachine, normalizeProps, spreadProps } from '@zag-js/vanilla'
import { Component } from '@geajs/core'

function stripStyle(props: Record<string, any>): Record<string, any> {
  const { style: _style, ...rest } = props
  return rest
}

let _store: toast.Store | null = null

function getStore(props?: toast.StoreProps) {
  if (!_store) {
    _store = toast.createStore({
      placement: 'bottom-end',
      duration: 5000,
      removeDelay: 200,
      max: 5,
      ...props,
    })
  }
  return _store
}

export class ToastStore {
  static getStore = getStore

  static create(options: toast.Options) {
    return getStore().create(options)
  }

  static success(options: Omit<toast.Options, 'type'>) {
    return getStore().create({ ...options, type: 'success' })
  }

  static error(options: Omit<toast.Options, 'type'>) {
    return getStore().create({ ...options, type: 'error' })
  }

  static info(options: Omit<toast.Options, 'type'>) {
    return getStore().create({ ...options, type: 'info' })
  }

  static loading(options: Omit<toast.Options, 'type'>) {
    return getStore().create({ ...options, type: 'loading' })
  }

  static dismiss(id?: string) {
    if (id) getStore().dismiss(id)
    else getStore().dismiss()
  }
}

export class Toaster extends Component {
  declare _machine: VanillaMachine<any> | null
  declare _api: any
  declare _toastMachines: Map<string, VanillaMachine<any>>
  declare _spreadCleanups: Map<string, Array<() => void>>
  declare _currentToasts: toast.Options[]

  created(props: any) {
    this._toastMachines = new Map()
    this._spreadCleanups = new Map()
    this._currentToasts = []

    const store = getStore(props.storeProps)

    this._machine = new VanillaMachine(toast.group.machine, { store })
    this._machine.start()

    this._api = toast.group.connect(this._machine.service, normalizeProps)

    this._machine.subscribe(() => {
      if (!this._machine) return
      this._api = toast.group.connect(this._machine.service, normalizeProps)
      const nextToasts = this._api.getToasts()
      this._syncToastDOM(nextToasts)
      this._currentToasts = nextToasts
      this._syncToastMachines()
      queueMicrotask(() => this._applyGroupSpreads())
    })
  }

  _createToastElement(t: any): HTMLElement {
    const div = document.createElement('div')
    div.setAttribute('data-part', 'toast-root')
    div.setAttribute('data-toast-id', t.id)
    div.className =
      'toast-root group pointer-events-auto relative flex w-full items-center justify-between space-x-2 overflow-hidden rounded-md border p-4 shadow-lg transition-all bg-background text-foreground'

    let inner = '<div class="grid gap-1">'
    if (t.title) inner += `<div data-part="title" class="toast-title text-sm font-semibold">${t.title}</div>`
    if (t.description)
      inner += `<div data-part="description" class="toast-description text-sm opacity-90">${t.description}</div>`
    inner += '</div>'
    inner +=
      '<button data-part="close-trigger" class="toast-close-trigger text-foreground/50 hover:text-foreground">&#x2715;</button>'
    div.innerHTML = inner
    return div
  }

  _syncToastDOM(nextToasts: any[]) {
    const container = this.el
    if (!container) return

    const currentIds = new Set(this._currentToasts.map((t: any) => t.id))
    const nextIds = new Set(nextToasts.map((t: any) => t.id))

    for (const id of currentIds) {
      if (!nextIds.has(id)) {
        const el = container.querySelector(`[data-toast-id="${id}"]`)
        if (el) {
          const cleanups = this._spreadCleanups.get(id)
          if (cleanups) cleanups.forEach((fn) => fn())
          this._spreadCleanups.delete(id)
          el.remove()
        }
      }
    }

    for (const t of nextToasts) {
      if (!currentIds.has((t as any).id)) {
        const el = this._createToastElement(t as any)
        container.appendChild(el)
      }
    }
  }

  _syncToastMachines() {
    if (!this._machine) return
    const currentIds = new Set(this._currentToasts.map((t: any) => t.id))

    for (const [id, machine] of this._toastMachines) {
      if (!currentIds.has(id)) {
        machine.stop()
        this._toastMachines.delete(id)
      }
    }

    for (let i = 0; i < this._currentToasts.length; i++) {
      const t = this._currentToasts[i] as any
      if (!this._toastMachines.has(t.id)) {
        const toastMachine = new VanillaMachine(toast.machine, {
          ...t,
          parent: this._machine.service,
          index: i,
          stacked: true,
          removeDelay: t.removeDelay ?? 200,
        })
        toastMachine.start()
        this._toastMachines.set(t.id, toastMachine)

        toastMachine.subscribe(() => {
          queueMicrotask(() => this._applyGroupSpreads())
        })
      }
    }
  }

  _applyGroupSpreads() {
    if (!this.rendered || !this._api) return

    const groupEl = this.el
    if (groupEl) {
      spreadProps(groupEl, stripStyle(this._api.getGroupProps()))
    }

    const toastEls = this.$$('[data-toast-id]')
    for (const el of toastEls) {
      const toastId = (el as HTMLElement).dataset.toastId
      if (!toastId) continue

      const toastMachine = this._toastMachines.get(toastId)
      if (!toastMachine) continue

      const api = toast.connect(toastMachine.service, normalizeProps)

      const prevCleanups = this._spreadCleanups.get(toastId)
      if (prevCleanups) prevCleanups.forEach((fn) => fn())

      const cleanups: Array<() => void> = []
      const rootProps = stripStyle(api.getRootProps())
      delete rootProps['data-part']
      cleanups.push(spreadProps(el, rootProps))

      const title = el.querySelector('[data-part="title"]')
      if (title) cleanups.push(spreadProps(title, api.getTitleProps()))

      const desc = el.querySelector('[data-part="description"]')
      if (desc) cleanups.push(spreadProps(desc, api.getDescriptionProps()))

      const close = el.querySelector('[data-part="close-trigger"]')
      if (close) cleanups.push(spreadProps(close, api.getCloseTriggerProps()))

      const action = el.querySelector('[data-part="action-trigger"]')
      if (action) cleanups.push(spreadProps(action, api.getActionTriggerProps()))

      this._spreadCleanups.set(toastId, cleanups)
    }
  }

  onAfterRender() {
    this._applyGroupSpreads()
  }

  dispose() {
    for (const cleanups of this._spreadCleanups.values()) {
      cleanups.forEach((fn) => fn())
    }
    this._spreadCleanups.clear()

    for (const machine of this._toastMachines.values()) {
      machine.stop()
    }
    this._toastMachines.clear()

    if (this._machine) {
      this._machine.stop()
      this._machine = null
    }
    this._api = null

    super.dispose()
  }

  template(props: any) {
    return (
      <div
        data-part="group"
        class={`toaster fixed z-[100] flex max-h-screen flex-col-reverse gap-2 p-4 ${props.class || 'bottom-0 right-0'}`}
      />
    )
  }
}
