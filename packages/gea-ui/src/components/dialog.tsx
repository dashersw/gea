import * as dialog from '@zag-js/dialog'
import type { OpenChangeDetails } from '@zag-js/dialog'
import { normalizeProps } from '@zag-js/vanilla'
import type { ReactNode } from 'react'
import ZagComponent from '../primitives/zag-component'

export interface DialogProps {
  class?: string
  children?: ReactNode
  triggerLabel?: string
  title?: string
  description?: string
  open?: boolean
  defaultOpen?: boolean
  modal?: boolean
  closeOnInteractOutside?: boolean
  closeOnEscape?: boolean
  trapFocus?: boolean
  preventScroll?: boolean
  role?: string
  'aria-label'?: string
  onOpenChange?: (details: OpenChangeDetails) => void
}

export default class Dialog extends ZagComponent<DialogProps> {
  declare open: boolean

  createMachine(_props: DialogProps): any {
    return dialog.machine
  }

  getMachineProps(props: DialogProps) {
    return {
      id: this.id,
      open: props.open,
      defaultOpen: props.defaultOpen,
      modal: props.modal ?? true,
      closeOnInteractOutside: props.closeOnInteractOutside ?? true,
      closeOnEscape: props.closeOnEscape ?? true,
      trapFocus: props.trapFocus ?? true,
      preventScroll: props.preventScroll ?? true,
      role: props.role ?? 'dialog',
      'aria-label': props['aria-label'],
      onOpenChange: (details: OpenChangeDetails) => {
        this.open = details.open
        props.onOpenChange?.(details)
      },
    }
  }

  connectApi(service: any) {
    return dialog.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="backdrop"]': 'getBackdropProps',
      '[data-part="positioner"]': (api: any) => ({
        ...api.getPositionerProps(),
        hidden: !api.open,
      }),
      '[data-part="content"]': 'getContentProps',
      '[data-part="title"]': 'getTitleProps',
      '[data-part="description"]': 'getDescriptionProps',
      '[data-part="close-trigger"]': (api: any) => {
        const { id: _, ...props } = api.getCloseTriggerProps()
        return {
          ...props,
          // normalizeProps lowercases onClick → onclick; must match to override
          // Zag's default handler which calls stopPropagation()
          onclick: (e: MouseEvent) => {
            if (e.defaultPrevented) return
            api.setOpen(false)
          },
        }
      },
      '[data-part="trigger"]': (api: any) => {
        const props = api.getTriggerProps()
        const origOnClick = props.onclick
        const preventTriggerFocus = (e: MouseEvent | PointerEvent) => {
          if ('button' in e && e.button !== 0) return
          e.preventDefault()
        }
        return {
          ...props,
          onpointerdown: preventTriggerFocus,
          onmousedown: preventTriggerFocus,
          onclick: (e: MouseEvent) => {
            ;(e.currentTarget as HTMLElement)?.blur()
            origOnClick?.(e)
          },
        }
      },
    }
  }

  syncState(api: any) {
    this.open = api.open
  }

  template(props: DialogProps) {
    return (
      <div class={props.class || ''}>
        {props.triggerLabel && (
          <button data-part="trigger" class="dialog-trigger">
            {props.triggerLabel}
          </button>
        )}
        <div data-part="backdrop" class="dialog-backdrop fixed inset-0 bg-black/50 z-50" hidden></div>
        <div
          data-part="positioner"
          class="dialog-positioner fixed inset-0 flex items-center justify-center z-50"
          hidden
        >
          <div data-part="content" class="dialog-content bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            {props.title && (
              <h2 data-part="title" class="dialog-title text-lg font-semibold mb-2">
                {props.title}
              </h2>
            )}
            {props.description && (
              <p data-part="description" class="dialog-description text-sm text-gray-500 mb-4">
                {props.description}
              </p>
            )}
            <div class="dialog-body">{props.children}</div>
            <button
              data-part="close-trigger"
              class="dialog-close-trigger absolute top-3 right-3 text-gray-400 hover:text-gray-600"
            >
              &#x2715;
            </button>
          </div>
        </div>
      </div>
    )
  }
}
