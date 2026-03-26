import * as tooltip from '@zag-js/tooltip'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class Tooltip extends ZagComponent {
  declare open: boolean

  createMachine(_props: any): any {
    return tooltip.machine
  }

  getMachineProps(props: any) {
    return {
      id: this.id,
      open: props.open,
      defaultOpen: props.defaultOpen,
      openDelay: props.openDelay ?? 400,
      closeDelay: props.closeDelay ?? 150,
      closeOnPointerDown: props.closeOnPointerDown ?? true,
      closeOnEscape: props.closeOnEscape ?? true,
      closeOnScroll: props.closeOnScroll ?? true,
      interactive: props.interactive ?? false,
      disabled: props.disabled,
      positioning: props.positioning,
      'aria-label': props['aria-label'],
      onOpenChange: (details: tooltip.OpenChangeDetails) => {
        this.open = details.open
        props.onOpenChange?.(details)
      },
    }
  }

  connectApi(service: any) {
    return tooltip.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="trigger"]': 'getTriggerProps',
      '[data-part="positioner"]': 'getPositionerProps',
      '[data-part="content"]': 'getContentProps',
      '[data-part="arrow"]': 'getArrowProps',
      '[data-part="arrow-tip"]': 'getArrowTipProps',
    }
  }

  syncState(api: any) {
    this.open = api.open
  }

  template(props: any) {
    return (
      <div class={props.class || ''} style={{ display: 'inline-block' }}>
        <div data-part="trigger" class="tooltip-trigger" style={{ display: 'inline-block' }}>
          {props.children}
        </div>
        <div data-part="positioner" class="tooltip-positioner">
          <div
            data-part="content"
            class="tooltip-content z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-md"
          >
            {props.content}
          </div>
        </div>
      </div>
    )
  }
}
