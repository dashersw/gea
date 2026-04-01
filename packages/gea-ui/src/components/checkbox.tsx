import * as checkbox from '@zag-js/checkbox'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class Checkbox extends ZagComponent {
  checked: boolean | 'indeterminate' = false

  createMachine(_props: any): any {
    return checkbox.machine
  }

  getMachineProps(props: any) {
    return {
      id: this.id,
      checked: props.checked,
      defaultChecked: props.defaultChecked,
      disabled: props.disabled,
      invalid: props.invalid,
      required: props.required,
      readOnly: props.readOnly,
      name: props.name,
      form: props.form,
      value: props.value ?? 'on',
      onCheckedChange: (details: checkbox.CheckedChangeDetails) => {
        this.checked = details.checked
        props.onCheckedChange?.(details)
      },
    }
  }

  connectApi(service: any) {
    return checkbox.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="label"]': 'getLabelProps',
      '[data-part="control"]': 'getControlProps',
      '[data-part="indicator"]': 'getIndicatorProps',
      '[data-part="hidden-input"]': 'getHiddenInputProps',
    }
  }

  syncState(api: any) {
    this.checked = api.checkedState
  }

  template(props: any) {
    return (
      <label
        data-part="root"
        class={`checkbox-root inline-flex items-center gap-2 cursor-pointer ${props.class || ''}`}
      >
        <input data-part="hidden-input" type="checkbox" class="sr-only" />
        <div
          data-part="control"
          class="checkbox-control h-4 w-4 shrink-0 rounded-xs border border-primary shadow transition-colors data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
        >
          <span
            data-part="indicator"
            class="checkbox-indicator flex items-center justify-center text-current h-full w-full"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-3 w-3"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </span>
        </div>
        {props.label && (
          <span data-part="label" class="checkbox-label text-sm font-medium leading-none">
            {props.label}
          </span>
        )}
      </label>
    )
  }
}
