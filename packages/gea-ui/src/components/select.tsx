import * as select from '@zag-js/select'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class Select extends ZagComponent {
  declare open: boolean
  declare value: string[]
  declare valueAsString: string

  createMachine(_props: any): any {
    return select.machine
  }

  getMachineProps(props: any) {
    const items = props.items || []
    const col =
      props.collection ||
      select.collection({
        items,
        itemToValue: (item: any) => item.value,
        itemToString: (item: any) => item.label || item.value,
      })

    return {
      id: this.id,
      collection: col,
      value: props.value,
      defaultValue: props.defaultValue,
      open: props.open,
      defaultOpen: props.defaultOpen,
      multiple: props.multiple,
      disabled: props.disabled,
      invalid: props.invalid,
      readOnly: props.readOnly,
      required: props.required,
      name: props.name,
      form: props.form,
      closeOnSelect: props.closeOnSelect ?? true,
      positioning: props.positioning,
      loopFocus: props.loopFocus ?? false,
      onValueChange: (details: select.ValueChangeDetails) => {
        this.value = details.value
        this.valueAsString = details.items.map((i: any) => i.label || i.value).join(', ')
        props.onValueChange?.(details)
      },
      onOpenChange: (details: select.OpenChangeDetails) => {
        this.open = details.open
        props.onOpenChange?.(details)
      },
    }
  }

  connectApi(service: any) {
    return select.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="label"]': 'getLabelProps',
      '[data-part="control"]': 'getControlProps',
      '[data-part="trigger"]': 'getTriggerProps',
      '[data-part="indicator"]': 'getIndicatorProps',
      '[data-part="clear-trigger"]': 'getClearTriggerProps',
      '[data-part="value-text"]': 'getValueTextProps',
      '[data-part="positioner"]': 'getPositionerProps',
      '[data-part="content"]': 'getContentProps',
      '[data-part="list"]': 'getListProps',
      '[data-part="item"]': (api, el) => {
        const value = (el as HTMLElement).dataset.value
        const label = (el as HTMLElement).dataset.label || value
        return api.getItemProps({ item: { value, label } })
      },
      '[data-part="item-text"]': (api, el) => {
        const value = (el as HTMLElement).dataset.value
        const label = (el as HTMLElement).dataset.label || value
        return api.getItemTextProps({ item: { value, label } })
      },
      '[data-part="item-indicator"]': (api, el) => {
        const value = (el as HTMLElement).dataset.value
        const label = (el as HTMLElement).dataset.label || value
        return api.getItemIndicatorProps({ item: { value, label } })
      },
    }
  }

  syncState(api: any) {
    this.open = api.open
    this.value = api.value
    this.valueAsString = api.valueAsString
  }

  template(props: any) {
    const items = props.items || []
    return (
      <div data-part="root" class={props.class || ''}>
        {props.label && (
          <label data-part="label" class="select-label text-sm font-medium mb-1 block">
            {props.label}
          </label>
        )}
        <div data-part="control" class="select-control">
          <button
            data-part="trigger"
            class="select-trigger flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span data-part="value-text" class="select-value-text">
              {this.valueAsString || props.placeholder || 'Select...'}
            </span>
            <span data-part="indicator" class="select-indicator">
              &#x25BC;
            </span>
          </button>
        </div>
        <div data-part="positioner" class="select-positioner">
          <div
            data-part="content"
            class="select-content z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          >
            <div data-part="list">
              {items.map((item: any) => (
                <div
                  key={item.value}
                  data-part="item"
                  data-value={item.value}
                  data-label={item.label}
                  class="select-item relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                >
                  <span data-part="item-text" data-value={item.value} data-label={item.label}>
                    {item.label}
                  </span>
                  <span
                    data-part="item-indicator"
                    data-value={item.value}
                    data-label={item.label}
                    class="select-item-indicator ml-auto"
                  >
                    &#x2713;
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }
}
