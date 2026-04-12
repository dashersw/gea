import { Store } from '@geajs/core'

export interface Task {
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  assignee?: string
}

export interface Column {
  id: string
  title: string
  taskIds: string[]
}

function uid(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const FAKE_TASKS: Task[] = [
  {
    id: 't1',
    title: 'Design auth flow',
    description: 'Create wireframes for login and signup flows.',
    priority: 'high',
    assignee: 'Alex',
  },
  {
    id: 't2',
    title: 'API rate limiting',
    description: 'Implement rate limiting middleware for public endpoints.',
    priority: 'medium',
    assignee: 'Sam',
  },
  {
    id: 't3',
    title: 'Fix nav overflow',
    description: 'Mobile nav items overflow on small screens.',
    priority: 'low',
    assignee: 'Jordan',
  },
  {
    id: 't4',
    title: 'Database migrations',
    description: 'Add migration for new user preferences schema.',
    priority: 'medium',
    assignee: 'Alex',
  },
  {
    id: 't5',
    title: 'E2E tests for checkout',
    description: 'Cover happy path and error states.',
    priority: 'high',
    assignee: 'Sam',
  },
  { id: 't6', title: 'Document API', description: 'Generate OpenAPI spec from routes.', priority: 'low' },
  {
    id: 't7',
    title: 'Optimize bundle size',
    description: 'Analyze and tree-shake unused deps.',
    priority: 'medium',
    assignee: 'Jordan',
  },
  {
    id: 't8',
    title: 'Dark mode support',
    description: 'Add theme toggle and CSS variables.',
    priority: 'low',
    assignee: 'Alex',
  },
]

const FAKE_COLUMNS: Column[] = [
  { id: 'col-backlog', title: 'Backlog', taskIds: ['t1', 't6', 't8'] },
  { id: 'col-todo', title: 'To Do', taskIds: ['t2', 't4', 't7'] },
  { id: 'col-progress', title: 'In Progress', taskIds: ['t3', 't5'] },
  { id: 'col-done', title: 'Done', taskIds: [] },
]

const FAKE_TASKS_MAP: Record<string, Task> = Object.fromEntries(FAKE_TASKS.map((t) => [t.id, t]))

export class KanbanStore extends Store {
  columns = FAKE_COLUMNS
  tasks = FAKE_TASKS_MAP
  selectedTaskId: string | null = null
  draftTitle = ''
  addingToColumnId: string | null = null
  draggingTaskId: string | null = null
  dragOverColumnId: string | null = null

  get selectedTask(): Task | null {
    const id = this.selectedTaskId
    return id ? (this.tasks[id] ?? null) : null
  }

  openTask(id: string): void {
    this.selectedTaskId = id
  }

  closeTask(): void {
    this.selectedTaskId = null
  }

  setDraftTitle(e: Event): void {
    this.draftTitle = (e.target as HTMLInputElement).value
  }

  startAdding(columnId: string): void {
    this.addingToColumnId = columnId
  }

  cancelAdding(): void {
    this.addingToColumnId = null
    this.draftTitle = ''
  }

  addTask(columnId: string, title?: string): void {
    const t = (title ?? this.draftTitle).trim()
    if (!t) return
    const id = uid()
    this.tasks[id] = { id, title: t, description: '', priority: 'medium' }
    const col = this.columns.find((c) => c.id === columnId)
    if (col) col.taskIds.push(id)
    this.addingToColumnId = null
    this.draftTitle = ''
  }

  moveTask(taskId: string, fromColumnId: string, toColumnId: string): void {
    if (fromColumnId === toColumnId) return
    const fromCol = this.columns.find((c) => c.id === fromColumnId)
    const toCol = this.columns.find((c) => c.id === toColumnId)
    if (!fromCol || !toCol) return
    const idx = fromCol.taskIds.indexOf(taskId)
    if (idx === -1) return
    fromCol.taskIds.splice(idx, 1)
    toCol.taskIds.push(taskId)
  }

  updateTask(taskId: string, updates: Partial<Task>): void {
    const task = this.tasks[taskId]
    if (task) Object.assign(task, updates)
  }

  deleteTask(taskId: string): void {
    // Remove from column taskIds BEFORE deleting from the tasks map.
    // This ensures the keyedList reconciliation (which disposes card
    // computations) is queued before any card text-binding computations
    // that would crash reading a deleted task's properties.
    for (const col of this.columns) {
      const idx = col.taskIds.indexOf(taskId)
      if (idx !== -1) col.taskIds.splice(idx, 1)
    }
    if (this.selectedTaskId === taskId) this.selectedTaskId = null
    delete this.tasks[taskId]
  }

  setDragging(taskId: string | null): void {
    this.draggingTaskId = taskId
  }

  setDragOver(columnId: string | null): void {
    this.dragOverColumnId = columnId
  }

  getTasksForColumn(columnId: string): Task[] {
    const col = this.columns.find((c) => c.id === columnId)
    if (!col) return []
    return col.taskIds.map((id) => this.tasks[id]).filter(Boolean)
  }
}

export default new KanbanStore()
