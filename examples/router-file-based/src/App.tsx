import { Component } from '@geajs/core'
import { router, RouterView } from '@geajs/core'

export default class App extends Component {
  template() {
    if (router.error) {
      return (
        <div class="error-page">
          <h1>Something went wrong</h1>
          <p>{router.error}</p>
          <button click={() => router.replace('/')}>Go home</button>
        </div>
      )
    }
    return <RouterView />
  }
}
