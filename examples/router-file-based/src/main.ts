import { router } from '@geajs/core'
import App from './App'
import './styles.css'

router.setPath('./pages')

const root = document.getElementById('app')
if (!root) throw new Error('App root element not found')

const app = new App()
app.render(root)
