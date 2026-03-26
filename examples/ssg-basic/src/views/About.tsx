import { Component, Head } from '@geajs/core'

const features = [
  { name: 'Compile-time JSX', description: 'No runtime template parsing — JSX is compiled at build time' },
  { name: 'Proxy-based Stores', description: 'Surgical DOM updates without virtual DOM diffing' },
  { name: 'Tiny Footprint', description: '~13kb gzipped — minimal overhead for maximum performance' },
  { name: 'SSG Support', description: 'Pre-render pages at build time for instant loads' },
]

export default class About extends Component {
  template() {
    return (
      <div class="view">
        <Head title="About — SSG Basic" description="Learn about Gea and its features" />
        <h1>About</h1>
        <p>
          Gea is a lightweight reactive UI framework that compiles JSX at build time and uses proxy-based stores for
          surgical DOM updates — all without a virtual DOM.
        </p>

        <h2>Features</h2>
        <div class="feature-grid">
          {features
            .map(
              (f) => `
              <div class="card">
                <h3>${f.name}</h3>
                <p>${f.description}</p>
              </div>
            `,
            )
            .join('')}
        </div>
      </div>
    )
  }
}
