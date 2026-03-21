import * as pinInput from '@zag-js/pin-input'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class PinInput extends ZagComponent {
  declare value: string[]
  declare valueAsString: string

  createMachine(_props: any): any {
    return pinInput.machine
  }

  getMachineProps(props: any) {
    return {
      id: this.id,
      value: props.value,
      defaultValue: props.defaultValue,
      count: props.count ?? 4,
      type: props.type ?? 'numeric',
      otp: props.otp ?? false,
      mask: props.mask ?? false,
      placeholder: props.placeholder ?? '○',
      disabled: props.disabled,
      readOnly: props.readOnly,
      invalid: props.invalid,
      name: props.name,
      form: props.form,
      blurOnComplete: props.blurOnComplete ?? false,
      autoFocus: props.autoFocus,
      onValueChange: (details: pinInput.ValueChangeDetails) => {
        this.value = details.value
        this.valueAsString = details.valueAsString
        props.onValueChange?.(details)
      },
      onValueComplete: props.onValueComplete,
      onValueInvalid: props.onValueInvalid,
    }
  }

  connectApi(service: any) {
    return pinInput.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="label"]': 'getLabelProps',
      '[data-part="control"]': 'getControlProps',
      '[data-part="hidden-input"]': 'getHiddenInputProps',
      '[data-part="input"]': (api, el) => {
        const index = parseInt((el as HTMLElement).dataset.index || '0', 10)
        return api.getInputProps({ index })
      },
    }
  }

  syncState(api: any) {
    this.value = api.value
    this.valueAsString = api.valueAsString
  }

  template(props: any) {
    const count = props.count ?? 4
    const inputs = Array.from({ length: count }, (_, i) => i)
    return (
      <div data-part="root" class={props.class || ''}>
        {props.label && (
          <label data-part="label" class="pin-input-label text-sm font-medium mb-2 block">
            {props.label}
          </label>
        )}
        <div data-part="control" class="pin-input-control flex gap-2">
          {inputs.map((i: number) => (
            <input
              key={i}
              data-part="input"
              data-index={String(i)}
              class="pin-input-field h-9 w-9 rounded-md border border-input bg-transparent text-center text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          ))}
        </div>
        <input data-part="hidden-input" type="hidden" />
      </div>
    )
  }
}
