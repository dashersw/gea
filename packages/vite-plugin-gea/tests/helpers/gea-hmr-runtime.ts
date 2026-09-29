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
import { HMR_RUNTIME_SOURCE } from '../../src/virtual-modules.ts'

// Proxies come from the shipped `virtual:gea-hmr` module (no Vite: import.meta.hot is
// undefined) so tests exercise its real traps. It shares `globalThis.__geaHMRGlobal`.
const shippedRuntime = await import(`data:text/javascript,${encodeURIComponent(HMR_RUNTIME_SOURCE)}`)

export const registerHotModule: (moduleUrl: string, moduleExports: any) => any = shippedRuntime.registerHotModule
export const createHotComponentProxy: (moduleUrl: string, initialComponent: any) => any =
  shippedRuntime.createHotComponentProxy

const componentInstances = new Map<string, Set<any>>()

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
