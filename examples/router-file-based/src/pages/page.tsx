import { Component } from '@geajs/core'
import { Link } from '@geajs/core'

export default class HomePage extends Component {
  template() {
    return (
      <div class="view">
        <h1>Home</h1>
        <p>
          Welcome to the Gea file-based router example. Routes are automatically generated from
          the <code>pages/</code> directory — no manual route map required.
        </p>
        <p>
          Each <code>page.tsx</code> file becomes a route, and <code>layout.tsx</code> files
          wrap their directory's routes with a shared layout.
        </p>
        <div class="card-grid">
          <Link to="/about" class="card">
            <span class="card-title">About</span>
            <span class="card-desc">Learn about this example</span>
          </Link>
          <Link to="/blog" class="card">
            <span class="card-title">Blog</span>
            <span class="card-desc">Read the latest posts</span>
          </Link>
          <Link to="/users" class="card">
            <span class="card-title">Users</span>
            <span class="card-desc">Browse user profiles</span>
          </Link>
        </div>
      </div>
    )
  }
}
