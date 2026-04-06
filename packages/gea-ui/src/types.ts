export type JSXNode = string | number | boolean | null | undefined | JSXNode[]

export interface GMouseEvent<T extends EventTarget = Element> extends MouseEvent {
  readonly currentTarget: T
}

export type MouseEventHandler<T extends EventTarget = Element> = (e: GMouseEvent<T>) => void
