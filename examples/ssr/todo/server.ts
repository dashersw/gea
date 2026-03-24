import { handleRequest } from '../../../packages/gea-ssr/src/handle-request'
import App from '../../todo/todo-app'
import todoStore from '../../todo/todo-store'

export default handleRequest(App, {
  async onBeforeRender() {
    todoStore.todos = [
      { id: 'ssr-1', text: 'Server rendered todo 1', done: false },
      { id: 'ssr-2', text: 'Server rendered todo 2', done: true },
      { id: 'ssr-3', text: 'Server rendered todo 3', done: false },
    ]
  },
  storeRegistry: { TodoStore: todoStore },
})
