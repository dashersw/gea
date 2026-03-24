import { Component } from '@geajs/core'

const SETUP_CODE = 'router.setPath(\'./pages\')'

export default class AboutPage extends Component {
  template() {
    return (
      <div class="view">
        <h1>About</h1>
        <p>
          This example demonstrates file-based routing in Gea. Instead of defining a route map
          by hand, call <code>{SETUP_CODE}</code> once in your entry file and the Vite plugin
          generates routes automatically from the file system.
        </p>
        <h2>File conventions</h2>
        <ul>
          <li><code>page.tsx</code> — page component for the route</li>
          <li><code>layout.tsx</code> — wraps all routes in the directory</li>
          <li><code>[param]/page.tsx</code> — dynamic segment, becomes :param</li>
          <li><code>[...slug]/page.tsx</code> — catch-all segment, becomes *</li>
        </ul>
        <h2>How it works</h2>
        <p>
          At build time the Vite plugin rewrites the <code>setPath()</code> call into
          <code>import.meta.glob</code> statements. Layouts load eagerly; pages load lazily.
        </p>
        <h2>This example's page structure</h2>
        <pre class="code-block">{
`pages/
  layout.tsx            root layout (nav + Outlet)
  page.tsx              /
  about/page.tsx        /about
  blog/page.tsx         /blog
  blog/[slug]/page.tsx  /blog/:slug
  users/page.tsx        /users
  users/[id]/page.tsx   /users/:id
  [...all]/page.tsx     * (404 catch-all)`
        }</pre>
      </div>
    )
  }
}
