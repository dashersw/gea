import { Component } from '@geajs/core'
import { router } from '../router'
import IssueTypeIcon from './IssueTypeIcon'
import IssuePriorityIcon from './IssuePriorityIcon'
import { Avatar } from '@geajs/ui'
import { dragState, clearDragState } from '../utils/drag-state'

export default class IssueCard extends Component {
  _didDrag = false

  handleClick() {
    if (this._didDrag) return
    router.push(`/project/board/issues/${this.props.issueId}`)
  }

  onDragStart(e: DragEvent) {
    this._didDrag = true
    const el = e.currentTarget as HTMLElement
    const id = this.props.issueId as string

    dragState.issueId = id
    dragState.cardHeight = el.offsetHeight

    e.dataTransfer?.setData('text/plain', id)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'

    const rect = el.getBoundingClientRect()
    const clone = el.cloneNode(true) as HTMLElement
    Object.assign(clone.style, {
      position: 'fixed',
      top: '-10000px',
      left: '-10000px',
      width: rect.width + 'px',
      transform: 'rotate(3deg)',
      boxShadow: '5px 10px 30px 0px rgba(9, 30, 66, 0.15)',
      background: '#fff',
      borderRadius: '3px',
      opacity: '1',
    })
    document.body.appendChild(clone)
    e.dataTransfer?.setDragImage(clone, e.offsetX, e.offsetY)
    requestAnimationFrame(() => document.body.removeChild(clone))

    requestAnimationFrame(() => el.classList.add('dragging'))
  }

  onDragEnd(e: DragEvent) {
    ;(e.currentTarget as HTMLElement).classList.remove('dragging')
    clearDragState()
    queueMicrotask(() => {
      this._didDrag = false
    })
  }

  template({ issueId, title, type, priority, assignees = [] }: any) {
    return (
      <div
        class="issue-card"
        draggable={true}
        dragstart={(e: DragEvent) => this.onDragStart(e)}
        dragend={(e: DragEvent) => this.onDragEnd(e)}
        click={() => this.handleClick()}
      >
        <p class="issue-card-title">{title}</p>
        <div class="issue-card-footer">
          <div class="issue-card-footer-left">
            <IssueTypeIcon type={type} size={18} />
            <IssuePriorityIcon priority={priority} top={-1} left={4} />
          </div>
          <div class="issue-card-footer-right">
            {assignees.map((user: any) => (
              <Avatar key={user.id} src={user.avatarUrl} name={user.name} class="!h-6 !w-6" />
            ))}
          </div>
        </div>
      </div>
    )
  }
}
