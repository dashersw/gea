import '../../../router-simple/src/styles.css'
import { hydrate } from '../../../../packages/gea-ssr/src/client'
import App from '../../../router-simple/src/App'

hydrate(App, document.getElementById('app'))
