import * as radioGroup from '@zag-js/radio-group'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class RadioGroup extends ZagComponent {
  declare value: string | null

  createMachine(_props: any): any {
    return radioGroup.machine
  }

  getMachineProps(props: any) {
    return {
      id: this.id,
      value: props.value,
      defaultValue: props.defaultValue,
      name: props.name,
      form: props.form,
      disabled: props.disabled,
      readOnly: props.readOnly,
      orientation: props.orientation ?? 'vertical',
      onValueChange: (details: radioGroup.ValueChangeDetails) => {
        this.value = details.value
        props.onValueChange?.(details)
      },
    }
  }

  connectApi(service: any) {
    return radioGroup.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="label"]': 'getLabelProps',
      '[data-part="indicator"]': 'getIndicatorProps',
      '[data-part="item"]': (api, el) => api.getItemProps({ value: (el as HTMLElement).dataset.value }),
      '[data-part="item-text"]': (api, el) => api.getItemTextProps({ value: (el as HTMLElement).dataset.value }),
      '[data-part="item-control"]': (api, el) => api.getItemControlProps({ value: (el as HTMLElement).dataset.value }),
      '[data-part="item-hidden-input"]': (api, el) =>
        api.getItemHiddenInputProps({ value: (el as HTMLElement).dataset.value }),
    }
  }

  syncState(api: any) {
    this.value = api.value
  }

  template(props: any) {
    const items = props.items || []
    return (
      <div data-part="root" class={props.class || ''}>
        {props.label && (
          <span data-part="label" class="radio-group-label text-sm font-medium mb-2 block">
            {props.label}
          </span>
        )}
        <div data-part="indicator" class="radio-group-indicator"></div>
        {items.map((item: any) => (
          <label
            key={item.value}
            data-part="item"
            data-value={item.value}
            class="radio-group-item flex items-center gap-2 cursor-pointer py-1"
          >
            <div
              data-part="item-control"
              data-value={item.value}
              class="radio-group-item-control h-4 w-4 rounded-full border border-primary flex items-center justify-center"
            >
              <span class="radio-dot"></span>
            </div>
            <input data-part="item-hidden-input" data-value={item.value} type="radio" class="sr-only" />
            <span data-part="item-text" data-value={item.value} class="radio-group-item-text text-sm">
              {item.label}
            </span>
          </label>
        ))}
      </div>
    )
  }
}
