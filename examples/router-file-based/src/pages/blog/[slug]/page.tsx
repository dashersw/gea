import { Component } from '@geajs/core'
import { Link } from '@geajs/core'

interface Post {
  slug: string
  title: string
  date: string
  content: string
}

const POSTS: Record<string, Post> = {
  'getting-started': {
    slug: 'getting-started',
    title: 'Getting Started with Gea',
    date: '2026-03-01',
    content: `Gea is a lightweight reactive framework that compiles your component templates at build time.
To get started, create a new project with the CLI:

  npm create gea@latest my-app

Then run the dev server and start building your app.`,
  },
  'file-based-routing': {
    slug: 'file-based-routing',
    title: 'File-Based Routing in Gea',
    date: '2026-03-10',
    content: `File-based routing lets you define routes by creating files in a pages directory.
Call router.setPath('./pages') once in your entry file and the Vite plugin does the rest.

The plugin transforms this call into import.meta.glob statements at build time, so you
get lazy-loaded pages and eager-loaded layouts with zero configuration.`,
  },
  'reactive-stores': {
    slug: 'reactive-stores',
    title: 'Reactive Stores',
    date: '2026-03-18',
    content: `Gea's reactivity system tracks property access at the field level using a Proxy-based Store class.
When a component reads a reactive field, it subscribes automatically. When the field changes,
only the components that read it are re-rendered — no virtual DOM diffing required.`,
  },
}

export default class BlogPostPage extends Component {
  template({ slug }: { slug: string }) {
    const post = POSTS[slug]

    if (!post) {
      return (
        <div class="view">
          <h1>Post not found</h1>
          <p>No post with slug <strong>{slug}</strong>.</p>
          <Link to="/blog" label="Back to Blog" class="back-link" />
        </div>
      )
    }

    return (
      <div class="view">
        <Link to="/blog" label="← Back to Blog" class="back-link" />
        <span class="post-date">{post.date}</span>
        <h1>{post.title}</h1>
        <pre class="post-body">{post.content}</pre>
      </div>
    )
  }
}
