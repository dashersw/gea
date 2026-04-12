import type { Store } from './store'

export type RootBridgeResult = { ok: true; value: any } | { ok: false }

export type RootBridgeGet = (t: Store, prop: string) => RootBridgeResult

/** Return true if the bridge handled the assignment on the real store target. */
export type RootBridgeSet = (t: Store, prop: string, value: any) => boolean

let bridgeGet: RootBridgeGet | null = null
let bridgeSet: RootBridgeSet | null = null

export function setComponentRootBridge(g: RootBridgeGet, s: RootBridgeSet): void {
  bridgeGet = g
  bridgeSet = s
}

export function tryComponentRootBridgeGet(t: Store, prop: string): RootBridgeResult | null {
  const g = bridgeGet
  if (!g) return null
  return g(t, prop)
}

export function tryComponentRootBridgeSet(t: Store, prop: string, value: any): boolean {
  const s = bridgeSet
  if (!s) return false
  return s(t, prop, value)
}
