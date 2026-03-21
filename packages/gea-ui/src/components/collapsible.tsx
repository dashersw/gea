import * as collapsible from '@zag-js/collapsible'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class Collapsible extends ZagComponent {
  declare open: boolean

  createMachine(_props: any): any {
    return collapsible.machine
  }

  getMachineProps(props: any) {
    return {
      id: this.id,
      open: props.open,
      defaultOpen: props.defaultOpen,
      disabled: props.disabled,
      onOpenChange: (details: collapsible.OpenChangeDetails) => {
        this.open = details.open
        props.onOpenChange?.(details)
      },
    }
  }

  connectApi(service: any) {
    return collapsible.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="trigger"]': 'getTriggerProps',
      '[data-part="content"]': 'getContentProps',
    }
  }

  syncState(api: any) {
    this.open = api.open
  }

  template(props: any) {
    return (
      <div data-part="root" class={props.class || ''}>
        <button data-part="trigger" class="collapsible-trigger flex w-full items-center justify-between py-2 text-sm font-medium">
          {props.label || 'Toggle'}
        </button>
        <div data-part="content" class="collapsible-content overflow-hidden">
          <div class="pb-4">{props.children}</div>
        </div>
      </div>
    )
  }
}
