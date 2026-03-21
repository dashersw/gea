import * as combobox from '@zag-js/combobox'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class Combobox extends ZagComponent {
  declare open: boolean
  declare value: string[]
  declare inputValue: string
  declare filteredItems: any[]
  declare _allItems: any[]

  created(props: any) {
    this._allItems = props.items || []
    this.filteredItems = [...this._allItems]
    super.created(props)
  }

  createMachine(_props: any): any {
    return combobox.machine
  }

  _buildCollection(items: any[]) {
    return combobox.collection({
      items,
      itemToValue: (item: any) => item.value,
      itemToString: (item: any) => item.label || item.value,
    })
  }

  _filterItems(query: string) {
    const q = query.toLowerCase()
    const filtered = q
      ? this._allItems.filter((item: any) => (item.label || item.value).toLowerCase().includes(q))
      : [...this._allItems]
    this.filteredItems = filtered
    this._machine?.updateProps({ collection: this._buildCollection(filtered) })
  }

  getMachineProps(props: any) {
    const col = props.collection || this._buildCollection(this._allItems)

    return {
      id: this.id,
      collection: col,
      value: props.value,
      defaultValue: props.defaultValue,
      inputValue: props.inputValue,
      defaultInputValue: props.defaultInputValue,
      open: props.open,
      defaultOpen: props.defaultOpen,
      multiple: props.multiple,
      disabled: props.disabled,
      readOnly: props.readOnly,
      invalid: props.invalid,
      required: props.required,
      placeholder: props.placeholder,
      inputBehavior: props.inputBehavior ?? 'none',
      selectionBehavior: props.selectionBehavior ?? 'replace',
      closeOnSelect: props.closeOnSelect ?? true,
      allowCustomValue: props.allowCustomValue,
      loopFocus: props.loopFocus ?? true,
      openOnClick: props.openOnClick ?? false,
      name: props.name,
      form: props.form,
      positioning: props.positioning,
      onValueChange: (details: combobox.ValueChangeDetails) => {
        this.value = details.value
        props.onValueChange?.(details)
      },
      onInputValueChange: (details: combobox.InputValueChangeDetails) => {
        this.inputValue = details.inputValue
        this._filterItems(details.inputValue)
        props.onInputValueChange?.(details)
      },
      onOpenChange: (details: combobox.OpenChangeDetails) => {
        this.open = details.open
        props.onOpenChange?.(details)
      },
    }
  }

  connectApi(service: any) {
    return combobox.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="label"]': 'getLabelProps',
      '[data-part="control"]': 'getControlProps',
      '[data-part="input"]': 'getInputProps',
      '[data-part="trigger"]': 'getTriggerProps',
      '[data-part="clear-trigger"]': 'getClearTriggerProps',
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
    this.inputValue = api.inputValue
  }

  template(props: any) {
    return (
      <div data-part="root" class={props.class || ''}>
        {props.label && (
          <label data-part="label" class="combobox-label text-sm font-medium mb-1 block">
            {props.label}
          </label>
        )}
        <div data-part="control" class="combobox-control flex">
          <input
            data-part="input"
            class="combobox-input flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <button
            data-part="trigger"
            class="combobox-trigger inline-flex h-9 items-center justify-center rounded-r-md border border-l-0 border-input px-2"
          >
            &#x25BC;
          </button>
        </div>
        <div data-part="positioner" class="combobox-positioner">
          <div
            data-part="content"
            class="combobox-content z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          >
            <div data-part="list">
              {this.filteredItems.map((item: any) => (
                <div
                  key={item.value}
                  data-part="item"
                  data-value={item.value}
                  data-label={item.label}
                  class="combobox-item relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                >
                  <span data-part="item-text" data-value={item.value} data-label={item.label}>
                    {item.label}
                  </span>
                  <span
                    data-part="item-indicator"
                    data-value={item.value}
                    data-label={item.label}
                    class="combobox-item-indicator ml-auto"
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
