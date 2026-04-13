/**
 * SSR bridge surface — consumed by `@geajs/ssr` via the `@geajs/core/ssr` subpath.
 * App code should import from `@geajs/core`, not this module.
 */
import { Store, getRootProxyHandlerFactoryForSSR, setRootProxyHandlerFactoryForSSR } from './store'
import { GEA_ROOT_PROXY_HANDLER_FACTORY } from './runtime/internal-symbols'

export { resetUidCounter, setUidProvider, clearUidProvider } from './uid'
export {
  findPropertyDescriptor,
  isClassConstructorValue,
  samePathParts,
  rootGetValue,
  rootSetValue,
  rootDeleteProperty,
} from './store'
export { GEA_ROOT_PROXY_HANDLER_FACTORY }

export type RootProxyHandlerFactory = () => ProxyHandler<any>

let installedRootProxyHandlerBridge = false

function installRootProxyHandlerBridge(): void {
  if (installedRootProxyHandlerBridge) return
  installedRootProxyHandlerBridge = true
  Object.defineProperty(Store, GEA_ROOT_PROXY_HANDLER_FACTORY, {
    configurable: true,
    get: getRootProxyHandlerFactoryForSSR,
    set: setRootProxyHandlerFactoryForSSR,
  })
}

installRootProxyHandlerBridge()

export function getRootProxyHandlerFactory(): RootProxyHandlerFactory | null {
  return getRootProxyHandlerFactoryForSSR()
}

export function setRootProxyHandlerFactory(factory: RootProxyHandlerFactory | null): void {
  setRootProxyHandlerFactoryForSSR(factory)
}
