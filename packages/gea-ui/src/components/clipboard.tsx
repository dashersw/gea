import * as clipboard from '@zag-js/clipboard'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class Clipboard extends ZagComponent {
  copied = false

  createMachine(_props: any): any {
    return clipboard.machine
  }

  getMachineProps(props: any) {
    return {
      id: this.id,
      value: props.value,
      defaultValue: props.defaultValue,
      timeout: props.timeout ?? 2000,
      onStatusChange: (details: clipboard.CopyStatusDetails) => {
        this.copied = details.copied
        props.onStatusChange?.(details)
      },
    }
  }

  connectApi(service: any) {
    return clipboard.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="label"]': 'getLabelProps',
      '[data-part="control"]': 'getControlProps',
      '[data-part="trigger"]': 'getTriggerProps',
      '[data-part="input"]': 'getInputProps',
      '[data-part="indicator-copied"]': (api) =>
        api.getIndicatorProps({ copied: true }),
      '[data-part="indicator-not-copied"]': (api) =>
        api.getIndicatorProps({ copied: false }),
    }
  }

  syncState(api: any) {
    this.copied = api.copied
  }

  template(props: any) {
    return (
      <div data-part="root" class={props.class || ''}>
        {props.label && <label data-part="label" class="clipboard-label text-sm font-medium mb-1 block">{props.label}</label>}
        <div data-part="control" class="clipboard-control flex gap-2">
          <input data-part="input" class="clipboard-input flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" />
          <button data-part="trigger" class="clipboard-trigger inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm shadow-sm hover:bg-accent">
            {this.copied
              ? <span data-part="indicator-copied">&#x2713; Copied</span>
              : <span data-part="indicator-not-copied">Copy</span>
            }
          </button>
        </div>
      </div>
    )
  }
}
