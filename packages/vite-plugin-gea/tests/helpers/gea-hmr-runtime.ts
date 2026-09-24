/**
 * JSDOM test harness for the same HMR instance registry contract as
 * `virtual:gea-hmr` in the plugin. Uses {@link reRenderComponent} that matches
 * the closure-compiled {@link Component} (dispose + fresh disposer + render).
 * Not the browser bundle; keep behavior aligned with `packages/vite-plugin-gea/src/index.ts`.
 */
import { createDisposer } from '../../../gea/src/runtime/disposer'
import { GEA_STATIC_NODES } from '../../../gea/src/runtime/compiled-static-symbols'
import { GEA_CREATED_CALLED, GEA_DISPOSER } from '../../../gea/src/runtime/internal-symbols'
import { GEA_DOM_COMPONENT, GEA_ELEMENT } from '../../../gea/src/runtime/symbols'

const hmrGlobal =
  (
    globalThis as {
      __geaHMRGlobal?: { componentModules: Map<string, object>; componentProxies?: Map<string, any> }
    }
  ).__geaHMRGlobal ||
  ((
    globalThis as unknown as {
      __geaHMRGlobal: { componentModules: Map<string, object>; componentProxies: Map<string, any> }
    }
  ).__geaHMRGlobal = {
    componentModules: new Map(),
    componentProxies: new Map(),
  })

const componentModules = hmrGlobal.componentModules
const componentProxies = hmrGlobal.componentProxies || (hmrGlobal.componentProxies = new Map())
const componentInstances = new Map<string, Set<any>>()

function normalizeModuleUrl(moduleUrl: string): string {
  try {
    const url = new URL(moduleUrl, 'file:///')
    url.search = ''
    url.hash = ''
    return url.href
  } catch {
    return String(moduleUrl || '').replace(/[?#].*$/, '')
  }
}

export function registerHotModule(moduleUrl: string, moduleExports: any): any {
  if (!moduleExports) return moduleExports
  componentModules.set(normalizeModuleUrl(moduleUrl), moduleExports)
  return moduleExports
}

export function getLatestComponentClass(moduleUrl: string, fallback: any): any {
  const m = componentModules.get(normalizeModuleUrl(moduleUrl))
  return m && (m as { default?: any }).default ? (m as { default: any }).default : m || fallback
}

export function createHotComponentProxy(moduleUrl: string, initialComponent: any): any {
  const normalizedUrl = normalizeModuleUrl(moduleUrl)
  if (!componentModules.has(normalizedUrl) && initialComponent) {
    componentModules.set(normalizedUrl, { default: initialComponent })
  }
  if (!componentProxies.has(normalizedUrl)) {
    const target = function GeaHotComponentProxy() {}
    const proxy = new Proxy(target, {
      construct(_t, args, newTarget) {
        const C = getLatestComponentClass(moduleUrl, initialComponent)
        if (typeof C !== 'function') throw new Error(`[gea HMR test] No component for ${moduleUrl}`)
        return Reflect.construct(C, args, newTarget === proxy ? C : newTarget)
      },
      apply(_t, thisArg, args) {
        const C = getLatestComponentClass(moduleUrl, initialComponent)
        if (typeof C !== 'function') return undefined
        return Reflect.apply(C, thisArg, args)
      },
      get(_t, prop, receiver) {
        const C = getLatestComponentClass(moduleUrl, initialComponent)
        if (!C) return undefined
        if (prop === 'prototype') return C.prototype
        return Reflect.get(C, prop, receiver)
      },
    })
    componentProxies.set(normalizedUrl, proxy)
  }
  return componentProxies.get(normalizedUrl)
}

export function registerComponentInstance(className: string, instance: any): void {
  if (!componentInstances.has(className)) {
    componentInstances.set(className, new Set())
  }
  componentInstances.get(className)!.add(instance)
}

export function unregisterComponentInstance(className: string, instance: any): void {
  const set = componentInstances.get(className)
  if (set) {
    set.delete(instance)
    if (set.size === 0) componentInstances.delete(className)
  }
}

function moveAppendedBefore(parent: Node, tail: Node | null, nextSibling: Node | null): void {
  if (!nextSibling || nextSibling.parentNode !== parent) return
  let first = tail ? tail.nextSibling : parent.firstChild
  while (first && first !== nextSibling) {
    const node = first
    first = node.nextSibling
    parent.insertBefore(node, nextSibling)
  }
}

function reRenderComponent(instance: any): void {
  const roots = instance?.[GEA_STATIC_NODES] as Node[] | undefined
  const el = (roots ? roots[roots.length - 1] : instance?.[GEA_ELEMENT] || instance?.el) as Node | null | undefined
  if (!el || !el.parentNode) return
  const parent = el.parentNode
  const nextSibling = el.nextSibling
  const props = Object.assign({}, instance.props)
  instance.dispose()
  instance[GEA_DISPOSER] = createDisposer()
  instance[GEA_CREATED_CALLED] = true
  instance.props = props
  instance.rendered = false
  const tail = parent.lastChild
  instance.render(parent)
  moveAppendedBefore(parent, tail, nextSibling)
  const newEl = ((instance && instance[GEA_ELEMENT]) || instance?.el) as { [k: symbol]: any } | null
  if (newEl) newEl[GEA_DOM_COMPONENT] = instance
}

export function handleComponentUpdate(_moduleId: string, newModule: any): boolean | null {
  const ComponentClass: any = newModule.default || newModule
  if (!ComponentClass || typeof ComponentClass !== 'function') return false
  return rebindInstancesToNewClass(ComponentClass)
}

/**
 * Rebind all live instances registered under an existing `className` to `NewClass.prototype`.
 * (The plugin’s Vite `handleComponentUpdate` is module-shaped; class-shaped updates are
 * what multi-export files need in tests.)
 */
export function rebindClassInstancesToNewPrototype(className: string, NewClass: any): boolean | null {
  if (typeof NewClass !== 'function' || !className) return false
  const instSet = componentInstances.get(className)
  if (!instSet || instSet.size === 0) return false
  const newProto = NewClass.prototype
  const instances = Array.from(instSet)
  const newBase = Object.getPrototypeOf(newProto)
  for (const instance of instances) {
    const oldProto = Object.getPrototypeOf(instance)
    if (!oldProto || Object.getPrototypeOf(oldProto) !== newBase) return null
  }
  for (const instance of instances) {
    try {
      try {
        Object.setPrototypeOf(instance, newProto)
      } catch {
        /* ignore */
      }
      reRenderComponent(instance)
    } catch (e) {
      console.error('[gea HMR test] rebind failed for', className, e)
    }
  }
  return true
}

function rebindInstancesToNewClass(ComponentClass: any): boolean | null {
  const className: string = ComponentClass.name
  if (!className) return false
  return rebindClassInstancesToNewPrototype(className, ComponentClass)
}

export type GeaHmrBindings = {
  registerHotModule: typeof registerHotModule
  createHotComponentProxy: typeof createHotComponentProxy
  registerComponentInstance: typeof registerComponentInstance
  unregisterComponentInstance: typeof unregisterComponentInstance
  handleComponentUpdate: typeof handleComponentUpdate
}
