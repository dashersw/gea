import { Component } from '@geajs/core'

export default class MismatchPage extends Component {
  template() {
    const env = typeof window !== 'undefined' ? 'client' : 'server'
    return (
      <div class="mismatch-page">
        <h1>Mismatch Demo</h1>
        <p class="mismatch-value">Rendered on {env}</p>
      </div>
    )
  }
}
