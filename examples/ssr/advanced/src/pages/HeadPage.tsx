import { Component } from '@geajs/core'

export default class HeadPage extends Component {
  template() {
    return (
      <div class="head-page">
        <h1>Head Management Demo</h1>
        <p>This page has dynamic head tags injected by SSR.</p>
      </div>
    )
  }
}
