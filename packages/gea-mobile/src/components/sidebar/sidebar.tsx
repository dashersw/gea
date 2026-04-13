import { Component } from '@geajs/core'
import { withEvents } from '../../lib/with-events'
import './sidebar.css'

interface SidebarTapEvent {
  targetEl: Element
}

class Sidebar extends withEvents(Component) {
  vm: any

  constructor() {
    super()
    this.vm = null
  }

  render(rootEl?: HTMLElement, opt_index?: number): void {
    return super.render(rootEl || document.body, opt_index)
  }

  onSidebarItemTap(e: SidebarTapEvent): void {
    const view = e.targetEl && e.targetEl.getAttribute && e.targetEl.getAttribute('data-view')
    if (!view) return

    this.vm && this.vm.toggleSidebar()

    this.emit(Sidebar.EventType.SWITCH_VIEW, {
      view: view,
    })
  }

  template() {
    return (
      <sidebar>
        <sidebar-items>{this.template_items()}</sidebar-items>
      </sidebar>
    )
  }

  template_items(): any {
    return null
  }

  get mappings() {
    return {
      ITEM: 'sidebar-item',
    }
  }

  get events() {
    return {
      tap: {
        [this.mappings.ITEM]: this.onSidebarItemTap,
      },
    }
  }

  static get EventType() {
    return {
      SWITCH_VIEW: 'switchView',
    }
  }
}

export default Sidebar
