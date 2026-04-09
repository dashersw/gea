/**
 * Port of `HMR_RUNTIME_SOURCE` in `src/index.ts` for node tests that simulate
 * `virtual:gea-hmr` without Vite. Keep behavior aligned when changing the runtime.
 */
import {
  GEA_BINDINGS,
  GEA_CHILD_COMPONENTS,
  GEA_CLEANUP_BINDINGS,
  GEA_ELEMENT,
  GEA_RENDERED,
  GEA_SELF_LISTENERS,
  GEA_TEARDOWN_SELF_LISTENERS,
} from '../../../gea/src/lib/symbols'
export type GeaHmrBindings = {
  registerHotModule: (moduleUrl: string, moduleExports: unknown) => unknown
  createHotComponentProxy: (moduleUrl: string, initialComponent: unknown) => unknown
  registerComponentInstance: (className: string, instance: unknown) => void
  unregisterComponentInstance: (className: string, instance: unknown) => void
  handleComponentUpdate: (moduleId: string, newModule: unknown) => boolean
}

type GeaHot = { data: { componentInstances: Map<string, Set<unknown>> }; invalidate?: () => void; accept?: () => void }

function getHot(): GeaHot {
  return (globalThis as { __geaHmrTestHot?: GeaHot }).__geaHmrTestHot!
}

function getHmrGlobal() {
  type G = { componentModules: Map<string, unknown>; componentProxies: Map<string, unknown> }
  const g = globalThis as { __geaHMRGlobal?: G }
  if (!g.__geaHMRGlobal) {
    g.__geaHMRGlobal = { componentModules: new Map(), componentProxies: new Map() }
  }
  return g.__geaHMRGlobal
}

function normalizeModuleUrl(moduleUrl: string): string {
  try {
    const url = new URL(moduleUrl)
    url.search = ''
    url.hash = ''
    return url.href
  } catch {
    return String(moduleUrl || '').replace(/[?#].*$/, '')
  }
}

function getLatestComponentClass(
  componentModules: Map<string, unknown>,
  moduleUrl: string,
  fallbackComponent: unknown,
): unknown {
  const latestModule = componentModules.get(normalizeModuleUrl(moduleUrl)) as { default?: unknown } | undefined
  return (latestModule && latestModule.default) || latestModule || fallbackComponent
}

function reRenderComponent(instance: Record<string, unknown>) {
  const i = instance as Record<string | symbol, unknown>
  if (!i || !i[GEA_ELEMENT]) return
  const el = i[GEA_ELEMENT] as { parentElement: HTMLElement | null }
  const parent = el.parentElement
  if (!parent) return
  const index = Array.prototype.indexOf.call(parent.children, el)
  const props = Object.assign({}, instance.props)
  const __stateSnapshot: Record<string, unknown> = {}
  const __ownKeys = Object.getOwnPropertyNames(instance)
  for (let __ki = 0; __ki < __ownKeys.length; __ki++) {
    const __k = __ownKeys[__ki]
    if (__k.charAt(0) === '_' || __k === 'props' || __k === 'id') continue
    const __desc = Object.getOwnPropertyDescriptor(instance, __k)
    if (__desc && (__desc.get || __desc.set)) continue
    try {
      __stateSnapshot[__k] = instance[__k]
    } catch {
      /* ignore */
    }
  }
  ;(i as any)[GEA_RENDERED] = false
  if (typeof (instance as any)[GEA_CLEANUP_BINDINGS] === 'function') (instance as any)[GEA_CLEANUP_BINDINGS]()
  if (typeof (instance as any)[GEA_TEARDOWN_SELF_LISTENERS] === 'function') (instance as any)[GEA_TEARDOWN_SELF_LISTENERS]()
  if (typeof instance.__cleanupCompiledDirectEvents === 'function') instance.__cleanupCompiledDirectEvents()
  const childComponents = i[GEA_CHILD_COMPONENTS] as unknown[] | undefined
  if (childComponents && childComponents.length) {
    childComponents.forEach((child) => {
      if (child && typeof (child as { dispose?: () => void }).dispose === 'function') {
        ;(child as { dispose: () => void }).dispose()
      }
    })
    i[GEA_CHILD_COMPONENTS] = []
  }
  if (i[GEA_ELEMENT] && (i[GEA_ELEMENT] as { parentNode: Node | null }).parentNode) {
    ;(i[GEA_ELEMENT] as { parentNode: { removeChild: (n: unknown) => void } }).parentNode.removeChild(i[GEA_ELEMENT])
  }
  i[GEA_ELEMENT] = null
  instance.props = props
  const __restoreKeys = Object.getOwnPropertyNames(__stateSnapshot)
  for (let __ri = 0; __ri < __restoreKeys.length; __ri++) {
    try {
      instance[__restoreKeys[__ri]] = __stateSnapshot[__restoreKeys[__ri]]
    } catch {
      /* ignore */
    }
  }
  if (!i[GEA_BINDINGS]) i[GEA_BINDINGS] = []
  if (!instance.__bindingRemovers) instance.__bindingRemovers = []
  if (!i[GEA_SELF_LISTENERS]) i[GEA_SELF_LISTENERS] = []
  if (!i[GEA_CHILD_COMPONENTS]) i[GEA_CHILD_COMPONENTS] = []
  if (typeof instance.render === 'function') {
    ;(instance.render as (p: HTMLElement, i: number) => void)(parent, index)
  }
  if (typeof instance.createdHooks === 'function') {
    ;(instance.createdHooks as (props: unknown) => void)(instance.props)
  }
}

export function resetGeaHmrTestState(): void {
  const instances = new Map<string, Set<unknown>>()
  ;(globalThis as { __geaHmrTestHot?: GeaHot }).__geaHmrTestHot = {
    data: { componentInstances: instances },
    accept() {},
  }
  ;(
    globalThis as {
      __geaHMRGlobal?: { componentModules: Map<string, unknown>; componentProxies: Map<string, unknown> }
    }
  ).__geaHMRGlobal = {
    componentModules: new Map(),
    componentProxies: new Map(),
  }
}

export function getGeaHmrBindings(): GeaHmrBindings {
  const hot = getHot()
  const componentInstances = hot.data.componentInstances
  const hmrGlobal = getHmrGlobal()
  const componentModules = hmrGlobal.componentModules
  const componentProxies = hmrGlobal.componentProxies

  function registerHotModule(moduleUrl: string, moduleExports: unknown) {
    if (!moduleExports) return moduleExports
    componentModules.set(normalizeModuleUrl(moduleUrl), moduleExports)
    return moduleExports
  }

  function createHotComponentProxy(moduleUrl: string, initialComponent: unknown) {
    const normalizedUrl = normalizeModuleUrl(moduleUrl)
    if (!componentModules.has(normalizedUrl) && initialComponent) {
      componentModules.set(normalizedUrl, { default: initialComponent })
    }
    if (!componentProxies.has(normalizedUrl)) {
      const target = function GeaHotComponentProxy() {}
      const proxy = new Proxy(target, {
        construct(_target, args, newTarget) {
          const ComponentClass = getLatestComponentClass(componentModules, normalizedUrl, initialComponent) as
            | (new (...a: unknown[]) => unknown)
            | undefined
          if (typeof ComponentClass !== 'function') {
            throw new Error('[gea HMR] No component class available for ' + normalizedUrl)
          }
          return Reflect.construct(ComponentClass, args, newTarget === proxy ? ComponentClass : newTarget)
        },
        get(_target, prop, receiver) {
          const ComponentClass = getLatestComponentClass(componentModules, normalizedUrl, initialComponent) as
            | Record<string, unknown>
            | undefined
          if (!ComponentClass) return undefined
          if (prop === 'prototype') return (ComponentClass as { prototype: unknown }).prototype
          return Reflect.get(ComponentClass, prop, receiver)
        },
        set(_target, prop, value, receiver) {
          const ComponentClass = getLatestComponentClass(componentModules, normalizedUrl, initialComponent) as
            | Record<string, unknown>
            | undefined
          if (!ComponentClass) return false
          return Reflect.set(ComponentClass, prop, value, receiver)
        },
        has(_target, prop) {
          const ComponentClass = getLatestComponentClass(componentModules, normalizedUrl, initialComponent) as
            | Record<string, unknown>
            | undefined
          return !!ComponentClass && prop in ComponentClass
        },
        ownKeys() {
          const ComponentClass = getLatestComponentClass(componentModules, normalizedUrl, initialComponent) as
            | Record<string, unknown>
            | undefined
          return ComponentClass ? Reflect.ownKeys(ComponentClass) : []
        },
        getOwnPropertyDescriptor(_target, prop) {
          const ComponentClass = getLatestComponentClass(componentModules, normalizedUrl, initialComponent) as
            | Record<string, unknown>
            | undefined
          return ComponentClass ? Object.getOwnPropertyDescriptor(ComponentClass, prop) : undefined
        },
      })
      componentProxies.set(normalizedUrl, proxy)
    }
    return componentProxies.get(normalizedUrl)
  }

  function registerComponentInstance(className: string, instance: unknown) {
    if (!componentInstances.has(className)) {
      componentInstances.set(className, new Set())
    }
    componentInstances.get(className)!.add(instance)
  }

  function unregisterComponentInstance(className: string, instance: unknown) {
    const instances = componentInstances.get(className)
    if (instances) {
      instances.delete(instance)
      if (instances.size === 0) {
        componentInstances.delete(className)
      }
    }
  }

  function handleComponentUpdate(moduleId: string, newModule: unknown) {
    const mod = newModule as { default?: new (...args: unknown[]) => unknown }
    const ComponentClass = mod.default || newModule
    if (!ComponentClass || typeof ComponentClass !== 'function') return false
    const className = ComponentClass.name
    if (!className) return false
    const instances = componentInstances.get(className)
    if (!instances || instances.size === 0) return false
    const newProto = ComponentClass.prototype as Record<string, PropertyDescriptor>
    const instancesArray = Array.from(instances)
    instancesArray.forEach((instance) => {
      try {
        const inst = instance as Record<string, unknown>
        Object.getOwnPropertyNames(newProto).forEach((name) => {
          if (name === 'constructor') return
          const descriptor = Object.getOwnPropertyDescriptor(newProto, name)
          if (!descriptor) return
          try {
            if (typeof descriptor.value === 'function') {
              inst[name] = (descriptor.value as (...a: unknown[]) => unknown).bind(instance)
            } else {
              Object.defineProperty(instance, name, descriptor)
            }
          } catch {
            /* ignore */
          }
        })
        try {
          const currentProto = Object.getPrototypeOf(instance)
          if (currentProto !== newProto && currentProto !== Object.prototype) {
            Object.setPrototypeOf(instance, newProto)
          }
        } catch {
          /* ignore */
        }
        reRenderComponent(inst)
      } catch (error) {
        console.error('[gea HMR] Error updating ' + className + ':', error)
        if (hot && hot.invalidate) hot.invalidate()
      }
    })
    return true
  }

  return {
    registerHotModule,
    createHotComponentProxy,
    registerComponentInstance,
    unregisterComponentInstance,
    handleComponentUpdate,
  }
}
