import type { StoreChange } from '../store'

export interface ListConfig {
  arrayPathParts: string[]
  create: (item: any, index?: number) => HTMLElement
  propPatchers?: Record<string, Array<(row: HTMLElement, value: any, item: any) => void>>
  hasComponentItems?: boolean
}

function samePathParts(a?: string[], b?: string[]): boolean {
  if (!a || !b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function rebuildList(container: HTMLElement, array: any[], create: (item: any, index?: number) => HTMLElement): void {
  container.textContent = ''
  if (array.length === 0) return

  const fragment = document.createDocumentFragment()
  for (let i = 0; i < array.length; i++) {
    fragment.appendChild(create(array[i], i))
  }
  container.appendChild(fragment)
}

function rerenderListInPlace(
  container: HTMLElement,
  array: any[],
  create: (item: any, index?: number) => HTMLElement,
): void {
  const currentLength = container.children.length
  const nextLength = array.length
  const sharedLength = currentLength < nextLength ? currentLength : nextLength

  for (let i = 0; i < sharedLength; i++) {
    const row = container.children[i]
    const nextRow = create(array[i], i)
    if (row) {
      row.replaceWith(nextRow)
    } else {
      container.appendChild(nextRow)
    }
  }

  if (nextLength > currentLength) {
    const fragment = document.createDocumentFragment()
    for (let i = currentLength; i < nextLength; i++) {
      fragment.appendChild(create(array[i], i))
    }
    container.appendChild(fragment)
    return
  }

  for (let i = currentLength - 1; i >= nextLength; i--) {
    const row = container.children[i]
    if (row) row.remove()
  }
}

function applyReorder(container: HTMLElement, permutation: number[]): void {
  const rows = Array.from(container.children)
  for (let i = 0; i < permutation.length; i++) {
    const row = rows[permutation[i]] as HTMLElement | undefined
    if (!row) continue
    const currentRow = container.children[i]
    if (currentRow !== row) {
      container.insertBefore(row, currentRow || null)
    }
  }
}

function applySwap(container: HTMLElement, firstIndex: number, secondIndex: number): void {
  if (firstIndex === secondIndex) return
  const lowIndex = firstIndex < secondIndex ? firstIndex : secondIndex
  const highIndex = firstIndex < secondIndex ? secondIndex : firstIndex
  const lowRow = container.children[lowIndex]
  const highRow = container.children[highIndex]
  if (!(lowRow && highRow)) return

  const highNext = highRow.nextElementSibling
  container.insertBefore(highRow, lowRow)
  container.insertBefore(lowRow, highNext)
}

function applyPropChanges(container: HTMLElement, items: any[], changes: StoreChange[], config: ListConfig): boolean {
  if (!config.propPatchers) return false

  const rawItems = items && (items as any).__getTarget ? (items as any).__getTarget : items
  let handledAny = false
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]
    if (!change?.isArrayItemPropUpdate) continue
    if (!samePathParts(change.arrayPathParts, config.arrayPathParts)) continue
    if (change.arrayIndex == null) continue

    const lp = change.leafPathParts
    const key = lp && lp.length > 0 ? (lp.length === 1 ? lp[0] : lp.join('.')) : change.property
    const patchers = config.propPatchers[key] || config.propPatchers[change.property]
    if (!patchers || patchers.length === 0) continue

    const row = container.children[change.arrayIndex] as HTMLElement | undefined
    if (!row) continue

    handledAny = true
    const item = rawItems[change.arrayIndex]
    for (let j = 0; j < patchers.length; j++) {
      patchers[j](row, change.newValue, item)
    }
  }

  return handledAny
}

export function applyListChanges(
  container: HTMLElement,
  array: any[],
  changes: StoreChange[] | null,
  config: ListConfig,
): void {
  const proxiedItems = Array.isArray(array) ? array : []
  const items = proxiedItems && (proxiedItems as any).__getTarget ? (proxiedItems as any).__getTarget : proxiedItems

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

  if (changes.every((change) => change?.type === 'update' && change.arrayOp === 'swap')) {
    const seen = new Set<string>()
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i]
      const opId = change.opId || `${change.property}:${change.otherIndex}`
      if (seen.has(opId)) continue
      seen.add(opId)

      const firstIndex = Number(change.property)
      const secondIndex = Number(change.otherIndex)
      if (!Number.isInteger(firstIndex) || !Number.isInteger(secondIndex)) continue
      applySwap(container, firstIndex, secondIndex)
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
    rebuildList(container, items, config.create)
    return
  }

  let handledMutation = false
  const deleteIndexes: number[] = []
  const addIndexes: number[] = []

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]
    if (!change) continue

    if (change.type === 'delete') {
      const idx = Number(change.property)
      if (Number.isInteger(idx) && idx >= 0) {
        deleteIndexes.push(idx)
        handledMutation = true
      }
      continue
    }

    if (change.type === 'add') {
      const idx = Number(change.property)
      if (Number.isInteger(idx) && idx >= 0) {
        addIndexes.push(idx)
        handledMutation = true
      }
      continue
    }

    if (change.type === 'append') {
      const start = change.start ?? 0
      const count = change.count ?? 0
      if (count > 0) {
        const fragment = document.createDocumentFragment()
        for (let j = 0; j < count; j++) {
          fragment.appendChild(config.create(items[start + j], start + j))
        }
        container.appendChild(fragment)
      }
      handledMutation = true
    }
  }

  if (!handledMutation) {
    rebuildList(container, items, config.create)
    return
  }

  if (addIndexes.length > 0 && addIndexes.includes(0)) {
    const firstChild = container.children[0] as HTMLElement | undefined
    if (firstChild && !firstChild.hasAttribute('data-gea-item-id')) {
      if (container.children.length !== items.length) {
        rebuildList(container, items, config.create)
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
