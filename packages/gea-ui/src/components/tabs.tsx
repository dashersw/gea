import * as tabs from '@zag-js/tabs'
import { normalizeProps } from '@zag-js/vanilla'
import { GEA_ON_PROP_CHANGE } from '@geajs/core'
import ZagComponent from '../primitives/zag-component'

export default class Tabs extends ZagComponent {
  declare value: string | null

  _isNodeLike(value: unknown): value is Node {
    return !!value && typeof (value as Node).nodeType === 'number'
  }

  _setPanelContent(panel: HTMLElement, value: unknown) {
    if (typeof value === 'string') {
      if (panel.innerHTML !== value) panel.innerHTML = value
      return
    }
    if (value == null || value === false || value === true) {
      panel.replaceChildren()
      return
    }

    const nodes: Node[] = []
    const pushNode = (item: unknown) => {
      if (item == null || item === false || item === true) return
      if (Array.isArray(item)) {
        item.forEach(pushNode)
        return
      }
      if (this._isNodeLike(item)) {
        nodes.push(item)
        return
      }
      nodes.push(panel.ownerDocument.createTextNode(String(item)))
    }

    pushNode(value)
    panel.replaceChildren(...nodes)
  }

  _syncPanelContents(nextProps: Record<string, any> | undefined) {
    const items: any[] = Array.isArray(nextProps?.items) ? nextProps.items : []
    if (items.length === 0) return
    const root = this.el
    if (!root) return
    const panels = root.querySelectorAll('[data-part="content"]')
    for (let i = 0; i < panels.length && i < items.length; i++) {
      this._setPanelContent(panels[i] as HTMLElement, items[i]?.content)
    }
  }

  createMachine(_props: any): any {
    return tabs.machine
  }

  [GEA_ON_PROP_CHANGE](key: string, next: unknown) {
    super[GEA_ON_PROP_CHANGE]?.(key, next)
    this._syncPanelContents(this.props)
  }

  getMachineProps(props: any) {
    return {
      id: this.id,
      value: props.value,
      defaultValue: props.defaultValue,
      orientation: props.orientation ?? 'horizontal',
      activationMode: props.activationMode ?? 'automatic',
      loopFocus: props.loopFocus ?? true,
      onValueChange: (details: tabs.ValueChangeDetails) => {
        this.value = details.value
        props.onValueChange?.(details)
      },
      onFocusChange: props.onFocusChange,
    }
  }

  connectApi(service: any) {
    return tabs.connect(service, normalizeProps)
  }

  _syncMachineProps() {
    super._syncMachineProps()
    if (this._machine && this.rendered) {
      this._machine.service.send({ type: 'SET_INDICATOR_RECT' })
    }
  }

  getSpreadMap() {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="list"]': 'getListProps',
      '[data-part="indicator"]': (api) => {
        const props = api.getIndicatorProps()
        props.style = (props.style || '') + 'bottom:0;width:var(--width);height:2px;'
        return props
      },
      '[data-part="trigger"]': (api, el) => api.getTriggerProps({ value: (el as HTMLElement).dataset.value }),
      '[data-part="content"]': (api, el) => api.getContentProps({ value: (el as HTMLElement).dataset.value }),
    }
  }

  syncState(api: any) {
    this.value = api.value
  }

  onAfterRender() {
    super.onAfterRender()
    this._syncPanelContents(this.props)
    if (this._api?.value && this._machine) {
      this._machine.service.send({ type: 'SET_INDICATOR_RECT' })
    }
  }

  template(props: any) {
    const items = props.items || []
    return (
      <div data-part="root" class={props.class || ''}>
        <div data-part="list" class="tabs-list relative flex border-b border-gray-200 dark:border-gray-700">
          {items.map((item: any) => (
            <button
              key={item.value}
              data-part="trigger"
              data-value={item.value}
              class="tabs-trigger px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 data-[selected]:text-blue-600 dark:text-gray-400 dark:hover:text-gray-100 dark:data-[selected]:text-blue-400"
            >
              {item.label}
            </button>
          ))}
          <div data-part="indicator" class="tabs-indicator bg-blue-600 dark:bg-blue-400"></div>
        </div>
        {items.map((item: any) => (
          <div key={item.value} data-part="content" data-value={item.value} class="tabs-content p-4">
            {item.content}
          </div>
        ))}
      </div>
    )
  }
}
