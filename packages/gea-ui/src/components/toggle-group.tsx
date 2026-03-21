import * as toggleGroup from '@zag-js/toggle-group'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class ToggleGroup extends ZagComponent {
  declare value: string[]

  createMachine(_props: any): any {
    return toggleGroup.machine
  }

  getMachineProps(props: any) {
    return {
      id: this.id,
      value: props.value,
      defaultValue: props.defaultValue,
      multiple: props.multiple ?? false,
      disabled: props.disabled,
      orientation: props.orientation ?? 'horizontal',
      loopFocus: props.loopFocus ?? true,
      rovingFocus: props.rovingFocus ?? true,
      onValueChange: (details: toggleGroup.ValueChangeDetails) => {
        this.value = details.value
        props.onValueChange?.(details)
      },
    }
  }

  connectApi(service: any) {
    return toggleGroup.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="item"]': (api, el) => api.getItemProps({ value: (el as HTMLElement).dataset.value }),
    }
  }

  syncState(api: any) {
    this.value = api.value
  }

  template(props: any) {
    const items = props.items || []
    return (
      <div data-part="root" class={`toggle-group-root inline-flex rounded-md border ${props.class || ''}`}>
        {items.map((item: any) => (
          <button
            key={item.value}
            data-part="item"
            data-value={item.value}
            class="toggle-group-item inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted hover:text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
          >
            {item.label}
          </button>
        ))}
      </div>
    )
  }
}
