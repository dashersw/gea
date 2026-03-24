import { hydrate } from '../../../../packages/gea-ssr/src/client'
import App from '../../../kanban/src/kanban-app'
import kanbanStore from '../../../kanban/src/kanban-store'

hydrate(App, document.getElementById('app'), {
  storeRegistry: { KanbanStore: kanbanStore },
})
