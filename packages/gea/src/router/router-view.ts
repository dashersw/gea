import { Component } from '../runtime/component'
import { GEA_CREATE_TEMPLATE } from '../runtime/symbols'
import { GEA_ROUTER_DEPTH, GEA_ROUTER_REF } from '../symbols'
import { getDefaultRouter } from './context'
import {
  bindRouteHost,
  createRouteHostElement,
  defineRouteHostPrototype,
  disposeRouteHost,
  routeHostState,
  updateRootRouteHost,
} from './route-host'
import type { Router } from './router'
import type { RouteMap } from './types'

export default class RouterView extends Component<{ router?: Router; routes?: RouteMap }> {
  [GEA_ROUTER_DEPTH]: number = 0;
  [GEA_ROUTER_REF]: Router | null = null

  _createRouteHostTemplate() {
    // Apply routes eagerly so nested route hosts can read the route tree before
    // onAfterRender runs.
    const router = this.props?.router ?? this[GEA_ROUTER_REF] ?? getDefaultRouter()
    if (router && this.props?.routes && typeof router.setRoutes === 'function') {
      const state = routeHostState(this)
      if (!state.routesApplied) {
        router.setRoutes(this.props.routes)
        state.routesApplied = true
      }
    }
    return createRouteHostElement(this)
  }

  onAfterRender() {
    const state = routeHostState(this)
    const router = this.props?.router ?? this[GEA_ROUTER_REF] ?? getDefaultRouter()
    if (!router) return

    if (this.props?.routes && !state.routesApplied) {
      router.setRoutes(this.props.routes)
      state.routesApplied = true
    }

    bindRouteHost(this, state, router, () => updateRootRouteHost(this, routeHostState(this)))
    updateRootRouteHost(this, state)
  }

  dispose() {
    disposeRouteHost(this, routeHostState(this))
    super.dispose()
  }
}

defineRouteHostPrototype(RouterView.prototype, GEA_CREATE_TEMPLATE)
