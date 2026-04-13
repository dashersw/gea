import type { Router } from './router'

let defaultRouter: Router | null = null
let ssrRouterResolver: (() => object | null) | null = null

export function setDefaultRouter(router: Router): void {
  defaultRouter = router
}

export function clearDefaultRouter(router: Router): void {
  if (defaultRouter === router) defaultRouter = null
}

export function getDefaultRouter(): Router | null {
  const ssrRouter = ssrRouterResolver?.()
  return (ssrRouter as Router | null) ?? defaultRouter
}

export function getSSRRouterResolver(): (() => object | null) | null {
  return ssrRouterResolver
}

export function setSSRRouterResolver(resolver: (() => object | null) | null): void {
  ssrRouterResolver = resolver
}
