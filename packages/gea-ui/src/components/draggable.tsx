import { Component } from '@geajs/core'
import { dndManager } from './dnd-manager'

export default class Draggable extends Component {
  _didDrag = false

  _onPointerDown(e: PointerEvent) {
    const el = (e.currentTarget as HTMLElement).closest('.gea-draggable') as HTMLElement
    if (!el) return
    this._didDrag = false
    dndManager.startTracking(e, this.props.draggableId as string, el)
  }

  template(props: any) {
    return (
      <div
        class={`gea-draggable ${props.class || ''}`}
        data-draggable-id={props.draggableId}
        data-index={props.index}
        pointerdown={(e: PointerEvent) => this._onPointerDown(e)}
        click={(e: MouseEvent) => {
          if (dndManager.isDragging) {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
      >
        {props.children}
      </div>
    )
  }
}
