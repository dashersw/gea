import { samePathParts } from '../store'
const _frag = () => document.createDocumentFragment()
import type { StoreChange } from '../store'
import { GEA_DOM_KEY, GEA_PROXY_GET_TARGET } from '../symbols'

export interface ListConfig {
  arrayPathParts: string[]
  create: (item: any, index?: number) => HTMLElement
  render?: (item: any, index?: number) => string
  propPatchers?: Record<string, Array<(row: HTMLElement, value: any, item: any) => void>>
  patchRow?: (row: HTMLElement, item: any, prevItem: any, index?: number) => void
  getKey?: (item: any, index?: number) => string
  hasComponentItems?: boolean
}

function rebuildList(container: HTMLElement, array: any[], config: ListConfig): void {
  container.textContent = ''
  if (array.length === 0) return
  const f = _frag()
  for (let i = 0; i < array.length; i++) f.appendChild(config.create(array[i], i))
  container.appendChild(f)
}

function rerenderListInPlace(
  container: HTMLElement,
  array: any[],
  create: (item: any, index?: number) => HTMLElement,
): void {
  const cl = container.children.length
  const nl = array.length
  for (let i = 0; i < (cl < nl ? cl : nl); i++) container.children[i].replaceWith(create(array[i], i))
  if (nl > cl) {
    const f = _frag()
    for (let i = cl; i < nl; i++) f.appendChild(create(array[i], i))
    container.appendChild(f)
  }
  while (container.children.length > nl) container.lastElementChild!.remove()
}

function applyReorder(container: HTMLElement, permutation: number[]): void {
  const rows = Array.from(container.children)
  for (let i = 0; i < permutation.length; i++) {
    const r = rows[permutation[i]] as HTMLElement | undefined
    if (r && r !== container.children[i]) container.insertBefore(r, container.children[i] || null)
  }
}

function applyPropChanges(
  container: HTMLElement,
  rawItems: any[],
  changes: StoreChange[],
  config: ListConfig,
): boolean {
  if (!config.propPatchers) return false

  const children = container.children
  let handledAny = false

  const firstAipu = changes[0]
  const arppMatch = firstAipu?.isArrayItemPropUpdate ? samePathParts(firstAipu.arrayPathParts, config.arrayPathParts) : false

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]
    if (!change.isArrayItemPropUpdate || change.arrayIndex == null) continue
    if (!arppMatch && !samePathParts(change.arrayPathParts, config.arrayPathParts)) continue

    const lp = change.leafPathParts
    const key = lp && lp.length > 0 ? (lp.length === 1 ? lp[0] : lp.join('.')) : change.property
    const patchers = config.propPatchers[key] || config.propPatchers[change.property]
    if (!patchers || patchers.length === 0) continue

    const row = children[change.arrayIndex] as HTMLElement | undefined
    if (!row) continue

    handledAny = true
    const item = rawItems[change.arrayIndex]
    for (let j = 0; j < patchers.length; j++) {
      patchers[j](row, change.newValue, item)
    }
  }

  return handledAny
}

function applyRootReplacementPatch(
  container: HTMLElement,
  items: any[],
  change: StoreChange,
  config: ListConfig,
): boolean {
  if (!config.patchRow || !config.getKey || !Array.isArray(change.previousValue)) return false

  const prevItems = change.previousValue
  if (prevItems.length !== items.length || container.children.length !== items.length) return false

  for (let index = 0; index < items.length; index++) {
    const prevKey = config.getKey(prevItems[index], index)
    const nextKey = config.getKey(items[index], index)
    if (prevKey !== nextKey) return false
    const row = container.children[index] as HTMLElement | undefined
    if (!row) return false
    const domKey = (row as any)[GEA_DOM_KEY] ?? row.getAttribute('data-gid')
    if (domKey == null || domKey !== prevKey) return false
  }

  for (let index = 0; index < items.length; index++) {
    const row = container.children[index] as HTMLElement
    config.patchRow(row, items[index], prevItems[index], index)
  }

  return true
}

export function applyListChanges(
  container: HTMLElement,
  array: any[],
  changes: StoreChange[] | null,
  config: ListConfig,
): void {
  const proxiedItems = Array.isArray(array) ? array : []
  const items = (proxiedItems as any)?.[GEA_PROXY_GET_TARGET] ?? proxiedItems

  if (!changes || changes.length === 0) {
    rerenderListInPlace(container, items, config.create)
    return
  }

  const firstChange = changes[0]
  if (
    firstChange?.type === 'reorder' &&
    samePathParts(firstChange.pathParts, config.arrayPathParts) &&
    Array.isArray(firstChange.permutation)
  ) {
    applyReorder(container, firstChange.permutation)
    return
  }

  let allSwaps = true
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i]
    if (!(c?.type === 'update' && c.arrayOp === 'swap')) {
      allSwaps = false
      break
    }
  }
  if (allSwaps) {
    const seen = new Set<string>()
    for (let i = 0; i < changes.length; i++) {
      const c = changes[i]
      const id = c.opId || c.property + ':' + c.otherIndex
      if (seen.has(id)) continue
      seen.add(id)
      const a = +c.property,
        b = +c.otherIndex
      if (a === b || !(a >= 0) || !(b >= 0)) continue
      const ea = container.children[a],
        eb = container.children[b]
      if (ea && eb) {
        const ref = eb.nextElementSibling
        container.insertBefore(eb, ea)
        container.insertBefore(ea, ref)
      }
    }
    return
  }

  if (applyPropChanges(container, items, changes, config)) {
    return
  }

  if (
    (firstChange?.type === 'update' || firstChange?.type === 'add') &&
    samePathParts(firstChange.pathParts, config.arrayPathParts)
  ) {
    if (applyRootReplacementPatch(container, items, firstChange, config)) {
      return
    }
    rebuildList(container, items, config)
    return
  }

  let handledMutation = false
  const deleteIndexes: number[] = []
  const addIndexes: number[] = []

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]
    if (!change) continue

    if (change.type === 'delete' || change.type === 'add') {
      const idx = Number(change.property)
      if (Number.isInteger(idx) && idx >= 0) {
        ;(change.type === 'delete' ? deleteIndexes : addIndexes).push(idx)
        handledMutation = true
      }
      continue
    }

    if (change.type === 'append') {
      const start = change.start ?? 0
      const count = change.count ?? 0
      if (count > 0) {
        const fragment = _frag()
        for (let j = 0; j < count; j++) {
          fragment.appendChild(config.create(items[start + j], start + j))
        }
        container.appendChild(fragment)
      }
      handledMutation = true
    }
  }

  if (!handledMutation) {
    rebuildList(container, items, config)
    return
  }

  if (addIndexes.length > 0 && addIndexes.includes(0)) {
    const firstChild = container.children[0] as HTMLElement | undefined
    if (firstChild && (firstChild as any)[GEA_DOM_KEY] == null && !firstChild.hasAttribute('data-gid')) {
      if (container.children.length !== items.length) {
        rebuildList(container, items, config)
        return
      }
      // Lengths match: either legacy no-op (multiple non-row nodes) or a single empty-state
      // placeholder next to one item — remove only the latter (avoid rebuildList: cond markers).
      if (container.children.length === 1) {
        firstChild.remove()
      } else {
        return
      }
    }
  }

  if (deleteIndexes.length > 1) deleteIndexes.sort((a, b) => b - a)
  for (let i = 0; i < deleteIndexes.length; i++) {
    const row = container.children[deleteIndexes[i]]
    if (row) row.remove()
  }

  if (addIndexes.length > 1) addIndexes.sort((a, b) => a - b)
  for (let i = 0; i < addIndexes.length; i++) {
    const index = addIndexes[i]
    const row = config.create(items[index], index)
    container.insertBefore(row, container.children[index] || null)
  }
}
