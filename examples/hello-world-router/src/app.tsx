import { Component, RouterView, router } from '@geajs/core'

class Home extends Component {
  template() {
    return <p>Hello Router</p>
  }
}

const routes = {
  '/': Home,
} as const

router.setRoutes(routes)

export default class App extends Component {
  template() {
    return (
      <main>
        <RouterView routes={routes} />
      </main>
    )
  }
}
