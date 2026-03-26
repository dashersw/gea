import { Component } from '@geajs/core'
import store from '../store'

export default class HomePage extends Component {
  template() {
    return (
      <div class="home-page">
        <h1>{store.greeting}</h1>
        <p class="ssr-marker">Server rendered content</p>
      </div>
    )
  }
}
