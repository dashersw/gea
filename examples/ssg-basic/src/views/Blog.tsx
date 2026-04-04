import { Component, Head } from '@geajs/core'
import { ssg } from '@geajs/ssg'

export default class Blog extends Component {
  template() {
    const posts = ssg.content('blog', {
      sort: (a, b) => new Date(b.frontmatter.date).getTime() - new Date(a.frontmatter.date).getTime(),
    })

    return (
      <div class="view">
        <Head title="Blog — SSG Basic" description="Articles about Gea and modern web development" />
        <h1>Blog</h1>
        <p>Articles about Gea and modern web development.</p>
        <div class="post-list">
          {posts
            .map(
              (post) => `
              <a href="/blog/${post.slug}" class="post-card">
                <time>${new Date(post.frontmatter.date).toISOString().split('T')[0]}</time>
                <h2>${post.frontmatter.title}</h2>
                <p>${post.frontmatter.excerpt}</p>
              </a>
            `,
            )
            .join('')}
        </div>
      </div>
    )
  }
}
