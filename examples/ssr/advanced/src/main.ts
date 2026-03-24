import { hydrate } from '../../../../packages/gea-ssr/src/client'
import App from './App'
import store from './store'

hydrate(App, document.getElementById('app'), {
  storeRegistry: { AdvancedStore: store },
})
