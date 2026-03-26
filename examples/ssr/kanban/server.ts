import { handleRequest } from '../../../packages/gea-ssr/src/handle-request'
import App from '../../kanban/src/kanban-app'
import kanbanStore from '../../kanban/src/kanban-store'

export default handleRequest(App, {
  storeRegistry: { KanbanStore: kanbanStore },
})
