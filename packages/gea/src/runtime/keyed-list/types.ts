import type { Disposer } from '../disposer'

export interface ListState {
  container: Element
  anchor: Comment
  getDomItems(): Element[]
  getSource(): readonly unknown[]
  getKey(idx: number): string
  readonly listId: string
}

export interface ItemObservable {
  current: any
  observe: (path: string | string[], fn: () => void) => () => void
  _fire: () => void
}

export interface Entry {
  key: string
  item: any
  element: Element
  disposer: Disposer
  obs: ItemObservable
}
