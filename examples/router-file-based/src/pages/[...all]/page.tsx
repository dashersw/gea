import { Component } from '@geajs/core'
import { router, Link } from '@geajs/core'

export default class NotFoundPage extends Component {
  template() {
    return (
      <div class="view not-found">
        <h1>404</h1>
        <p>
          No route matched <code>{router.path}</code>.
        </p>
        <Link to="/" label="Go Home" class="back-link" />
      </div>
    )
  }
}
