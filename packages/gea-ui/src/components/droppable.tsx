import { Component } from '@geajs/core'
import { dndManager } from './dnd-manager'

export default class Droppable extends Component {
  private _registered = false

  _registerWithManager() {
    const el = this.el?.querySelector('[data-droppable-id]') as HTMLElement
    if (el && !this._registered) {
      dndManager.registerDroppable(this.props.droppableId as string, el)
      this._registered = true
    }
  }

  created() {
    queueMicrotask(() => this._registerWithManager())
  }

  onAfterRender() {
    this._registerWithManager()
  }

  dispose() {
    if (this._registered) {
      dndManager.unregisterDroppable(this.props.droppableId as string)
      this._registered = false
    }
    super.dispose()
  }

  template(props: any) {
    return (
      <div class={`gea-droppable ${props.class || ''}`} data-droppable-id={props.droppableId}>
        {props.children}
      </div>
    )
  }
}
