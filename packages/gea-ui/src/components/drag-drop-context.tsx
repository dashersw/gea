import { Component } from '@geajs/core'
import { dndManager } from './dnd-manager'
import type { DragResult } from './dnd-manager'

export default class DragDropContext extends Component {
  created() {
    dndManager.onDragEnd = (result: DragResult) => {
      ;(this.props as any).onDragEnd?.(result)
    }
  }

  dispose() {
    dndManager.destroy()
    super.dispose()
  }

  template(props: any) {
    return <div class={`gea-dnd-context ${props.class || ''}`}>{props.children}</div>
  }
}
