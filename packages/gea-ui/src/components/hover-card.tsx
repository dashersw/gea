import * as hoverCard from '@zag-js/hover-card'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class HoverCard extends ZagComponent {
  declare open: boolean

  createMachine(_props: any): any {
    return hoverCard.machine
  }

  getMachineProps(props: any) {
    return {
      id: this.id,
      open: props.open,
      defaultOpen: props.defaultOpen,
      openDelay: props.openDelay,
      closeDelay: props.closeDelay,
      positioning: props.positioning,
      onOpenChange: (details: hoverCard.OpenChangeDetails) => {
        this.open = details.open
        props.onOpenChange?.(details)
      },
    }
  }

  connectApi(service: any) {
    return hoverCard.connect(service, normalizeProps)
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
        <a data-part="trigger" href={props.href || '#'} class="hover-card-trigger inline-block">
          {props.triggerLabel || 'Hover me'}
        </a>
        <div data-part="positioner" class="hover-card-positioner">
          <div
            data-part="content"
            class="hover-card-content z-50 w-64 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none"
          >
            {props.children}
          </div>
        </div>
      </div>
    )
  }
}
