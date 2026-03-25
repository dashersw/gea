import { Component, Head } from '@geajs/core'

export default class NotFound extends Component {
  template() {
    return (
      <div class="view not-found">
        <Head title="404 — Page Not Found" description="The page you are looking for does not exist." />
        <h1>404</h1>
        <p>The page you are looking for does not exist.</p>
        <a href="/" class="back-link">
          ← Back to home
        </a>
      </div>
    )
  }
}
