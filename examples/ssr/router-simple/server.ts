import { handleRequest } from '../../../packages/gea-ssr/src/handle-request'
import App from '../../router-simple/src/App'
import Home from '../../router-simple/src/views/Home'
import About from '../../router-simple/src/views/About'
import UserProfile from '../../router-simple/src/views/UserProfile'
import NotFound from '../../router-simple/src/views/NotFound'

export default handleRequest(App, {
  routes: {
    '/': Home,
    '/about': About,
    '/users/:id': UserProfile,
    '*': NotFound,
  },
})
