import { hydrate } from '../../../../packages/gea-ssr/src/client'
import App from '../../../todo/todo-app'
import todoStore from '../../../todo/todo-store'

hydrate(App, document.getElementById('app'), {
  storeRegistry: { TodoStore: todoStore },
})
