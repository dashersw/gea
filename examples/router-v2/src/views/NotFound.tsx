import { Component } from '@geajs/core'
import { Link } from '@geajs/core/router'

export default class NotFound extends Component {
  template() {
    return (
      <div class="view not-found">
        <h1>404</h1>
        <p>Page not found. The route you requested does not exist.</p>
        <Link to="/" label="Go Home" class="btn-primary" />
      </div>
    )
  }
}
