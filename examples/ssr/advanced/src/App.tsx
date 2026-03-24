import { Component } from '@geajs/core'
import HomePage from './pages/HomePage'

export default class App extends Component {
  template() {
    // During SSR, handleRequest passes __ssrRouteComponent as the resolved route component.
    // Render it directly — no client-side routing needed for these tests.
    const RouteComponent = this.props?.__ssrRouteComponent || HomePage
    const routeProps = this.props?.__ssrRouteProps || {}

    if (typeof RouteComponent === 'function' && RouteComponent.prototype) {
      const view = new RouteComponent(routeProps)
      return view.template(routeProps)
    }

    return new HomePage().template()
  }
}
