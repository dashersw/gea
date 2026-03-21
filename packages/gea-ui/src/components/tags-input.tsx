import * as tagsInput from '@zag-js/tags-input'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class TagsInput extends ZagComponent {
  declare value: string[]

  createMachine(_props: any): any {
    return tagsInput.machine
  }

  getMachineProps(props: any) {
    return {
      id: this.id,
      value: props.value,
      defaultValue: props.defaultValue,
      max: props.max,
      maxLength: props.maxLength,
      disabled: props.disabled,
      readOnly: props.readOnly,
      invalid: props.invalid,
      addOnPaste: props.addOnPaste ?? false,
      editable: props.editable ?? true,
      allowDuplicates: props.allowDuplicates ?? false,
      name: props.name,
      form: props.form,
      placeholder: props.placeholder,
      blurBehavior: props.blurBehavior,
      delimiter: props.delimiter,
      onValueChange: (details: tagsInput.ValueChangeDetails) => {
        this.value = details.value
        props.onValueChange?.(details)
      },
    }
  }

  connectApi(service: any) {
    return tagsInput.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="label"]': 'getLabelProps',
      '[data-part="control"]': 'getControlProps',
      '[data-part="input"]': 'getInputProps',
      '[data-part="hidden-input"]': 'getHiddenInputProps',
      '[data-part="clear-trigger"]': 'getClearTriggerProps',
      '[data-part="item"]': (api, el) => {
        const ds = (el as HTMLElement).dataset
        return api.getItemProps({ index: ds.index!, value: ds.value! })
      },
      '[data-part="item-preview"]': (api, el) => {
        const ds = (el as HTMLElement).dataset
        return api.getItemPreviewProps({ index: ds.index!, value: ds.value! })
      },
      '[data-part="item-text"]': (api, el) => {
        const ds = (el as HTMLElement).dataset
        return api.getItemTextProps({ index: ds.index!, value: ds.value! })
      },
      '[data-part="item-delete-trigger"]': (api, el) => {
        const ds = (el as HTMLElement).dataset
        return api.getItemDeleteTriggerProps({ index: ds.index!, value: ds.value! })
      },
    }
  }

  syncState(api: any) {
    this.value = api.value
  }

  template(props: any) {
    return (
      <div data-part="root" class={props.class || ''}>
        {props.label && (
          <label data-part="label" class="tags-input-label text-sm font-medium mb-1 block">
            {props.label}
          </label>
        )}
        <div
          data-part="control"
          class="tags-input-control flex flex-wrap gap-1.5 rounded-md border border-input bg-transparent px-3 py-2 shadow-sm focus-within:ring-1 focus-within:ring-ring"
        >
          {(this.value || []).map((tag: string, i: number) => (
            <span
              key={`${tag}-${i}`}
              data-part="item"
              data-index={String(i)}
              data-value={tag}
              class="tags-input-item inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium"
            >
              <span
                data-part="item-preview"
                data-index={String(i)}
                data-value={tag}
                class="inline-flex items-center gap-1 data-[highlighted]:ring-2 data-[highlighted]:ring-ring data-[highlighted]:rounded-sm"
              >
                <span data-part="item-text" data-index={String(i)} data-value={tag}>
                  {tag}
                </span>
              </span>
              <button
                data-part="item-delete-trigger"
                data-index={String(i)}
                data-value={tag}
                class="tags-input-item-delete text-muted-foreground hover:text-foreground"
              >
                &#x2715;
              </button>
            </span>
          ))}
          <input
            data-part="input"
            class="tags-input-input flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-[60px]"
          />
        </div>
        <input data-part="hidden-input" type="hidden" />
      </div>
    )
  }
}
