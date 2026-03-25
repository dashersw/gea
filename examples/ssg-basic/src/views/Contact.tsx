import { Component, Head } from '@geajs/core'

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
      </div>
    )
  }
}
