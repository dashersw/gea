import { Component, Head } from '@geajs/core'
import Counter from './Counter'
import LiveClock from './LiveClock'

export default class Contact extends Component {
  template() {
    return (
      <div class="view">
        <Head title="Contact — SSG Basic" description="Get in touch with us" />
        <h1>Contact</h1>
        <p>Get in touch with us through the channels below.</p>
        <div class="card">
          <h2>GitHub</h2>
          <p>
            <a href="https://github.com/dashersw/gea" style="color: var(--accent)">
              github.com/dashersw/gea
            </a>
          </p>
        </div>
        <div class="card">
          <h2>Email</h2>
          <p>hello@geajs.dev</p>
        </div>
        <div class="card">
          <h2>Reactive Counter</h2>
          <p>This counter works after JS loads — SSG renders the initial state.</p>
          <Counter />
        </div>
        <LiveClock />
      </div>
    )
  }
}
