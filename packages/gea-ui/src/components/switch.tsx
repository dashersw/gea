import * as switchMachine from '@zag-js/switch'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class Switch extends ZagComponent {
  checked = false

  createMachine(_props: any): any {
    return switchMachine.machine
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
      onCheckedChange: (details: switchMachine.CheckedChangeDetails) => {
        this.checked = details.checked
        props.onCheckedChange?.(details)
      },
    }
  }

  connectApi(service: any) {
    return switchMachine.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="label"]': 'getLabelProps',
      '[data-part="control"]': 'getControlProps',
      '[data-part="thumb"]': 'getThumbProps',
      '[data-part="hidden-input"]': 'getHiddenInputProps',
    }
  }

  syncState(api: any) {
    this.checked = api.checked
  }

  template(props: any) {
    return (
      <label data-part="root" class={`switch-root inline-flex items-center gap-2 cursor-pointer ${props.class || ''}`}>
        <input data-part="hidden-input" type="checkbox" />
        <span data-part="control" class="switch-control inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors data-[state=checked]:bg-primary data-[state=unchecked]:bg-input">
          <span data-part="thumb" class="switch-thumb pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"></span>
        </span>
        {props.label && <span data-part="label" class="switch-label text-sm font-medium">{props.label}</span>}
      </label>
    )
  }
}
