import { Component } from '../runtime/component'
import { GEA_CREATE_TEMPLATE } from '../runtime/symbols'
import { GEA_ROUTER_DEPTH, GEA_ROUTER_REF } from '../symbols'
import {
  bindRouteHost,
  createRouteHostElement,
  defineRouteHostPrototype,
  disposeRouteHost,
  resolveNestedRouteHost,
  routeHostState,
  updateNestedRouteHost,
} from './route-host'
import type { Router } from './router'

export default class Outlet extends Component<{ router?: Router | null }> {
  [GEA_ROUTER_DEPTH]: number = -1;
  [GEA_ROUTER_REF]: Router | null = null

  _createRouteHostTemplate() {
    return createRouteHostElement(this)
  }

  onAfterRender() {
    const state = routeHostState(this)
    const { depth, router } = resolveNestedRouteHost(this)
    this[GEA_ROUTER_DEPTH] = depth

    if (!router) return

    bindRouteHost(this, state, router, () => updateNestedRouteHost(this, routeHostState(this)))
    updateNestedRouteHost(this, state)
  }

  dispose() {
    disposeRouteHost(this, routeHostState(this))
    super.dispose()
  }
}

defineRouteHostPrototype(Outlet.prototype, GEA_CREATE_TEMPLATE)
