import { Component } from '@geajs/core'
import { IssueStatusCopy } from '../constants/issues'
import projectStore from '../stores/project-store'
import IssueCard from './IssueCard'
import { dragState } from '../utils/drag-state'

function resolveAssignees(issue: any, users: any[]): any[] {
  return (issue.userIds || []).map((uid: string) => users.find((u: any) => u.id === uid)).filter(Boolean)
}

function getDropIndex(container: HTMLElement, mouseY: number): number {
  const cards = Array.from(container.querySelectorAll('.issue-card:not(.dragging)'))
  for (let i = 0; i < cards.length; i++) {
    const rect = cards[i].getBoundingClientRect()
    if (mouseY < rect.top + rect.height / 2) return i
  }
  return cards.length
}

function ensurePlaceholder(container: HTMLElement, index: number, height: number) {
  let placeholder = container.querySelector('.dnd-placeholder') as HTMLElement | null

  if (!placeholder) {
    placeholder = document.createElement('div')
    placeholder.className = 'dnd-placeholder'
    placeholder.style.height = '0px'
    container.appendChild(placeholder)
    placeholder.offsetHeight
    placeholder.style.height = height + 'px'
  }

  const cards = Array.from(container.querySelectorAll('.issue-card:not(.dragging)'))
  const referenceNode = cards[index] || null

  if (referenceNode) {
    if (placeholder.nextElementSibling !== referenceNode) {
      container.insertBefore(placeholder, referenceNode)
    }
  } else {
    if (container.lastElementChild !== placeholder) {
      container.appendChild(placeholder)
    }
  }
}

function removePlaceholder(container: HTMLElement) {
  const placeholder = container.querySelector('.dnd-placeholder')
  if (placeholder) placeholder.remove()
}

export default class BoardColumn extends Component {
  template({ status, issues = [] }: any) {
    const project = projectStore.project
    const users = project ? project.users : []

    return (
      <div class="board-list">
        <div class="board-list-title">
          {IssueStatusCopy[status]} <span class="board-list-issues-count">{issues.length}</span>
        </div>
        <div
          class="board-list-issues"
          dragover={(e: DragEvent) => {
            e.preventDefault()
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
            if (!dragState.issueId) return

            const container = e.currentTarget as HTMLElement
            const dropIndex = getDropIndex(container, e.clientY)
            ensurePlaceholder(container, dropIndex, dragState.cardHeight)
            container.dataset.dropIndex = String(dropIndex)
          }}
          dragleave={(e: DragEvent) => {
            const el = e.currentTarget as HTMLElement
            const related = e.relatedTarget as Node | null
            if (!related || !el.contains(related)) {
              removePlaceholder(el)
              delete el.dataset.dropIndex
            }
          }}
          drop={(e: DragEvent) => {
            e.preventDefault()
            const el = e.currentTarget as HTMLElement
            const dropIndex = parseInt(el.dataset.dropIndex || '0', 10)
            removePlaceholder(el)
            delete el.dataset.dropIndex
            const id = e.dataTransfer?.getData('text/plain')
            if (id) projectStore.moveIssue(id, status, dropIndex)
          }}
        >
          {issues.map((issue: any) => (
            <IssueCard
              key={issue.id}
              issueId={issue.id}
              title={issue.title}
              type={issue.type}
              priority={issue.priority}
              assignees={resolveAssignees(issue, users)}
            />
          ))}
        </div>
      </div>
    )
  }
}
