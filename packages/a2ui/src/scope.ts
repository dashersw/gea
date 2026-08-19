import { parsePointer, readPointer } from './pointer'

export interface RootScope {
  kind: 'root'
}

export interface CollectionScope {
  kind: 'collection'
  basePath: string[]
  /** Mutable: keyedList's patchEntry rewrites this on reorder. */
  index: number
  /** Mutable: the current item. Relative reads resolve against this. */
  item: unknown
  parent: Scope
}

export type Scope = RootScope | CollectionScope

export function createRootScope(): RootScope {
  return { kind: 'root' }
}

export function createCollectionScope(
  basePath: string[],
  index: number,
  item: unknown,
  parent: Scope,
): CollectionScope {
  return { kind: 'collection', basePath, index, item, parent }
}

function isAbsolute(path: string): boolean {
  return path.startsWith('/')
}

/**
 * Absolute paths resolve from the model root. Relative paths (an A2UI
 * extension to RFC 6901) resolve against the current collection item, which
 * is what keeps rows correct under reorder. A relative path in root scope is
 * not legal per spec; we return undefined rather than throw, per the
 * progressive-rendering note.
 */
export function resolveRead(store: unknown, path: string, scope: Scope): unknown {
  if (isAbsolute(path)) return readPointer(store, parsePointer(path))
  if (scope.kind !== 'collection') return undefined
  return readPointer(scope.item, parsePointer('/' + path))
}

/** Writes always land on the Store, so relative paths become absolute parts. */
export function resolveWriteParts(path: string, scope: Scope): string[] {
  if (isAbsolute(path)) return parsePointer(path)
  if (scope.kind !== 'collection') return parsePointer('/' + path)
  return [...scope.basePath, String(scope.index), ...parsePointer('/' + path)]
}
