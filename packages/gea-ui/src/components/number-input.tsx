import * as numberInput from '@zag-js/number-input'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class NumberInput extends ZagComponent {
  declare value: string
  declare valueAsNumber: number

  createMachine(_props: any): any {
    return numberInput.machine
  }

  getMachineProps(props: any) {
    return {
      id: this.id,
      value: props.value,
      defaultValue: props.defaultValue,
      min: props.min,
      max: props.max,
      step: props.step ?? 1,
      disabled: props.disabled,
      readOnly: props.readOnly,
      invalid: props.invalid,
      required: props.required,
      name: props.name,
      form: props.form,
      allowMouseWheel: props.allowMouseWheel,
      clampValueOnBlur: props.clampValueOnBlur ?? true,
      formatOptions: props.formatOptions,
      locale: props.locale,
      onValueChange: (details: numberInput.ValueChangeDetails) => {
        this.value = details.value
        this.valueAsNumber = details.valueAsNumber
        props.onValueChange?.(details)
      },
    }
  }

  connectApi(service: any) {
    return numberInput.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="label"]': 'getLabelProps',
      '[data-part="control"]': 'getControlProps',
      '[data-part="input"]': 'getInputProps',
      '[data-part="increment-trigger"]': 'getIncrementTriggerProps',
      '[data-part="decrement-trigger"]': 'getDecrementTriggerProps',
      '[data-part="scrubber"]': 'getScrubberProps',
    }
  }

  syncState(api: any) {
    this.value = api.value
    this.valueAsNumber = api.valueAsNumber
  }

  template(props: any) {
    return (
      <div data-part="root" class={props.class || ''}>
        {props.label && (
          <label data-part="label" class="number-input-label text-sm font-medium mb-1 block">
            {props.label}
          </label>
        )}
        <div data-part="control" class="number-input-control flex">
          <button
            data-part="decrement-trigger"
            class="number-input-decrement inline-flex h-9 items-center justify-center rounded-l-md border border-r-0 border-input px-2 hover:bg-accent"
          >
            &#x2212;
          </button>
          <input
            data-part="input"
            class="number-input-input h-9 w-full border border-input bg-transparent px-3 text-center text-sm focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          />
          <button
            data-part="increment-trigger"
            class="number-input-increment inline-flex h-9 items-center justify-center rounded-r-md border border-l-0 border-input px-2 hover:bg-accent"
          >
            &#x2B;
          </button>
        </div>
      </div>
    )
  }
}
