import { hydrate } from '../../../../packages/gea-ssr/src/client'
import App from '../../../router-v2/src/App'
import authStore from '../../../router-v2/src/stores/auth-store'

hydrate(App, document.getElementById('app'), {
  storeRegistry: { AuthStore: authStore },
})
