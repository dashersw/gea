import { Component } from '@geajs/core'
import { router, Link, Outlet } from '@geajs/core'

export default class RootLayout extends Component {
  template() {
    return (
      <div class="app">
        <nav class="nav">
          <Link to="/" label="Home" class={router.isExact('/') ? 'nav-link active' : 'nav-link'} />
          <Link to="/about" label="About" class={router.isActive('/about') ? 'nav-link active' : 'nav-link'} />
          <Link to="/blog" label="Blog" class={router.isActive('/blog') ? 'nav-link active' : 'nav-link'} />
          <Link to="/users" label="Users" class={router.isActive('/users') ? 'nav-link active' : 'nav-link'} />
        </nav>
        <main class="content">
          <Outlet />
        </main>
      </div>
    )
  }
}
