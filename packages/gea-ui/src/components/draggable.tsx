import { Component } from '@geajs/core'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { dndManager } from './dnd-manager'

export default class Draggable extends Component {
  _didDrag = false

  _onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const el = (e.currentTarget as HTMLElement).closest('.gea-draggable') as HTMLElement
    if (!el) return
    this._didDrag = false
    dndManager.startTracking(e.nativeEvent, this.props.draggableId as string, el)
  }

  template(props: any) {
    return (
      <div
        class={`gea-draggable ${props.class || ''}`}
        data-draggable-id={props.draggableId}
        data-index={props.index}
        pointerdown={(e: ReactPointerEvent<HTMLDivElement>) => this._onPointerDown(e)}
        click={(e: ReactMouseEvent<HTMLDivElement>) => {
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
