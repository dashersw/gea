import { Component } from '@geajs/core'
import { Link } from '@geajs/core'

const POSTS = [
  { slug: 'getting-started', title: 'Getting Started with Gea', date: '2026-03-01', excerpt: 'Learn how to set up your first Gea project from scratch.' },
  { slug: 'file-based-routing', title: 'File-Based Routing in Gea', date: '2026-03-10', excerpt: 'Discover how router.setPath() automatically generates routes from your file system.' },
  { slug: 'reactive-stores', title: 'Reactive Stores', date: '2026-03-18', excerpt: 'A deep dive into how Gea tracks reactivity without a virtual DOM.' },
]

export default class BlogPage extends Component {
  template() {
    return (
      <div class="view">
        <h1>Blog</h1>
        <p>The latest articles from the Gea team.</p>
        <div class="post-list">
          {POSTS.map((post) => (
            <Link key={post.slug} to={`/blog/${post.slug}`} class="post-card">
              <span class="post-date">{post.date}</span>
              <h2 class="post-title">{post.title}</h2>
              <p class="post-excerpt">{post.excerpt}</p>
            </Link>
          ))}
        </div>
      </div>
    )
  }
}
