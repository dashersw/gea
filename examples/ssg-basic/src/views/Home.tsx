import { Component, Head } from '@geajs/core'

export default class Home extends Component {
  template() {
    return (
      <div class="view">
        <Head title="Home — SSG Basic" description="A Gea SSG example with static HTML generation" />
        <span class="badge">Static Site Generation</span>
        <h1>Welcome to Gea SSG</h1>
        <p>
          This page was statically generated at build time. No JavaScript is required to display this content — it is
          served as pure HTML.
        </p>
        <ul class="feature-list">
          <li>
            <strong>Zero JS payload</strong> — pages are pre-rendered to static HTML files
          </li>
          <li>
            <strong>SEO friendly</strong> — search engines see fully rendered content
          </li>
          <li>
            <strong>Instant load</strong> — no client-side rendering delay
          </li>
        </ul>
      </div>
    )
  }
}
