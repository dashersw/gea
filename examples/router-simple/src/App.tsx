import { Component } from '@geajs/core'
import { router, Link, RouterView } from '@geajs/core/router'
import Home from './views/Home'
import About from './views/About'
import UserProfile from './views/UserProfile'
import NotFound from './views/NotFound'

const routes = {
  '/': Home,
  '/about': About,
  '/users/:id': UserProfile,
  '*': NotFound,
} as const

export default class App extends Component {
  template() {
    return (
      <div class="app">
        <nav class="nav">
          <Link to="/" label="Home" exact class={router.isActive('/') ? 'nav-link active' : 'nav-link'} />
          <Link to="/about" label="About" class={router.isActive('/about') ? 'nav-link active' : 'nav-link'} />
          <Link to="/users/1" label="Alice" class={router.isActive('/users/1') ? 'nav-link active' : 'nav-link'} />
          <Link to="/users/2" label="Bob" class={router.isActive('/users/2') ? 'nav-link active' : 'nav-link'} />
          <Link to="/users/3" label="Charlie" class={router.isActive('/users/3') ? 'nav-link active' : 'nav-link'} />
        </nav>
        <main class="content">
          <RouterView routes={routes} />
        </main>
      </div>
    )
  }
}
