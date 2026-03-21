import * as accordion from '@zag-js/accordion'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class Accordion extends ZagComponent {
  declare value: string[]

  createMachine(_props: any): any {
    return accordion.machine
  }

  getMachineProps(props: any) {
    return {
      id: this.id,
      value: props.value,
      defaultValue: props.defaultValue,
      multiple: props.multiple ?? false,
      collapsible: props.collapsible ?? false,
      disabled: props.disabled,
      orientation: props.orientation ?? 'vertical',
      onValueChange: (details: accordion.ValueChangeDetails) => {
        this.value = details.value
        props.onValueChange?.(details)
      },
    }
  }

  connectApi(service: any) {
    return accordion.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="item"]': (api, el) => api.getItemProps({ value: (el as HTMLElement).dataset.value }),
      '[data-part="item-trigger"]': (api, el) => api.getItemTriggerProps({ value: (el as HTMLElement).dataset.value }),
      '[data-part="item-content"]': (api, el) => api.getItemContentProps({ value: (el as HTMLElement).dataset.value }),
      '[data-part="item-indicator"]': (api, el) =>
        api.getItemIndicatorProps({ value: (el as HTMLElement).dataset.value }),
    }
  }

  syncState(api: any) {
    this.value = api.value
  }

  template(props: any) {
    const items = props.items || []
    return (
      <div data-part="root" class={props.class || ''}>
        {items.map((item: any) => (
          <div key={item.value} data-part="item" data-value={item.value} class="accordion-item border-b">
            <h3>
              <button
                data-part="item-trigger"
                data-value={item.value}
                class="accordion-trigger flex w-full items-center justify-between py-4 text-sm font-medium transition-all"
              >
                {item.label}
                <span
                  data-part="item-indicator"
                  data-value={item.value}
                  class="accordion-indicator h-4 w-4 shrink-0 transition-transform duration-200"
                >
                  &#x25B6;
                </span>
              </button>
            </h3>
            <div data-part="item-content" data-value={item.value} class="accordion-content overflow-hidden text-sm">
              <div class="pb-4 pt-0">{item.content}</div>
            </div>
          </div>
        ))}
      </div>
    )
  }
}
