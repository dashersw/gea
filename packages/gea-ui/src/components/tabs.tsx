import * as tabs from '@zag-js/tabs'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class Tabs extends ZagComponent {
  declare value: string | null

  createMachine(_props: any): any {
    return tabs.machine
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
    if (this._machine && this.rendered_) {
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
