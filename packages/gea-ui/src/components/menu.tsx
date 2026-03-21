import * as menu from '@zag-js/menu'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class Menu extends ZagComponent {
  declare open: boolean

  createMachine(_props: any): any {
    return menu.machine
  }

  getMachineProps(props: any) {
    return {
      id: this.id,
      open: props.open,
      defaultOpen: props.defaultOpen,
      closeOnSelect: props.closeOnSelect ?? true,
      loopFocus: props.loopFocus ?? false,
      positioning: props.positioning,
      onOpenChange: (details: menu.OpenChangeDetails) => {
        this.open = details.open
        props.onOpenChange?.(details)
      },
      onSelect: props.onSelect,
    }
  }

  connectApi(service: any) {
    return menu.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="trigger"]': 'getTriggerProps',
      '[data-part="positioner"]': 'getPositionerProps',
      '[data-part="content"]': 'getContentProps',
      '[data-part="separator"]': 'getSeparatorProps',
      '[data-part="item"]': (api, el) => api.getItemProps({ value: (el as HTMLElement).dataset.value }),
      '[data-part="item-group"]': (api, el) => api.getItemGroupProps({ id: (el as HTMLElement).dataset.groupId }),
      '[data-part="item-group-label"]': (api, el) =>
        api.getItemGroupLabelProps({ htmlFor: (el as HTMLElement).dataset.htmlFor }),
    }
  }

  syncState(api: any) {
    this.open = api.open
  }

  template(props: any) {
    const items = props.items || []
    return (
      <div class={props.class || ''}>
        <button
          data-part="trigger"
          class="menu-trigger inline-flex items-center justify-center gap-1 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
        >
          {props.triggerLabel || 'Menu'}
        </button>
        <div data-part="positioner" class="menu-positioner">
          <div
            data-part="content"
            class="menu-content z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {items.map((item: any, i: number) =>
              item.type === 'separator' ? (
                <div key={`sep-${i}`} data-part="separator" class="menu-separator -mx-1 my-1 h-px bg-muted"></div>
              ) : (
                <div
                  key={item.value}
                  data-part="item"
                  data-value={item.value}
                  class="menu-item relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                >
                  {item.label}
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    )
  }
}
