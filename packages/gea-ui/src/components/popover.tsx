import * as popover from '@zag-js/popover'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class Popover extends ZagComponent {
  declare open: boolean

  createMachine(_props: any): any {
    return popover.machine
  }

  getMachineProps(props: any) {
    return {
      id: this.id,
      open: props.open,
      defaultOpen: props.defaultOpen,
      modal: props.modal ?? false,
      portalled: props.portalled ?? true,
      autoFocus: props.autoFocus ?? true,
      closeOnInteractOutside: props.closeOnInteractOutside ?? true,
      closeOnEscape: props.closeOnEscape ?? true,
      positioning: props.positioning,
      onOpenChange: (details: popover.OpenChangeDetails) => {
        this.open = details.open
        props.onOpenChange?.(details)
      },
    }
  }

  connectApi(service: any) {
    return popover.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="trigger"]': 'getTriggerProps',
      '[data-part="positioner"]': 'getPositionerProps',
      '[data-part="content"]': 'getContentProps',
      '[data-part="title"]': 'getTitleProps',
      '[data-part="description"]': 'getDescriptionProps',
      '[data-part="close-trigger"]': 'getCloseTriggerProps',
      '[data-part="arrow"]': 'getArrowProps',
      '[data-part="arrow-tip"]': 'getArrowTipProps',
    }
  }

  syncState(api: any) {
    this.open = api.open
  }

  template(props: any) {
    return (
      <div class={props.class || ''}>
        <button data-part="trigger" class="popover-trigger">
          {props.triggerLabel || 'Open'}
        </button>
        <div data-part="positioner" class="popover-positioner">
          <div
            data-part="content"
            class="popover-content z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden"
          >
            {props.title && (
              <div data-part="title" class="popover-title font-medium leading-none mb-2">
                {props.title}
              </div>
            )}
            {props.description && (
              <p data-part="description" class="popover-description text-sm text-muted-foreground mb-3">
                {props.description}
              </p>
            )}
            <div class="popover-body">{props.children}</div>
            <button
              data-part="close-trigger"
              class="popover-close-trigger absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-sm"
            >
              &#x2715;
            </button>
          </div>
        </div>
      </div>
    )
  }
}
