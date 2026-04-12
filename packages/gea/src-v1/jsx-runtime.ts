/* eslint-disable @typescript-eslint/no-namespace -- JSX namespace matches React's factory typings */
import type { CSSProperties, DetailedHTMLProps, JSX as ReactJSX, Ref, SVGProps } from 'react'

/** Widen `ref` (Gea assigns nodes to instance fields) and `style` (Gea accepts plain CSS strings). */
type GeaWidenRef<P> =
  P extends DetailedHTMLProps<infer _E, infer T>
    ? Omit<P, 'ref' | 'style'> & { ref?: Ref<T> | (T | null) | undefined; style?: CSSProperties | string | undefined }
    : P extends SVGProps<infer T>
      ? Omit<P, 'ref' | 'style'> & { ref?: Ref<T> | (T | null) | undefined; style?: CSSProperties | string | undefined }
      : P

type GeaIntrinsicElements = {
  [K in keyof ReactJSX.IntrinsicElements]: GeaWidenRef<ReactJSX.IntrinsicElements[K]>
}

/**
 * Gea wires native DOM listeners; events are browser Events, not React synthetics.
 * Bivariant on the event parameter so `(e: Event) => void` and `(e: InputEvent) => void` both work.
 *
 * Use `globalThis.*` event types: inside `declare module 'react'`, bare `MouseEvent` / `InputEvent`
 * resolve to React's synthetic event interfaces, not the DOM lib.
 */
type GeaNativeHandler<E extends globalThis.Event, T = EventTarget> = {
  bivarianceHack(event: E & { currentTarget: T; target: EventTarget }): void
}['bivarianceHack']

declare module 'react' {
  // Generic must match React's `LabelHTMLAttributes<T>` for declaration merge (parameter unused here).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface LabelHTMLAttributes<T> {
    /** Gea uses `for` in JSX (compiled to `htmlFor`). */
    for?: string | undefined
  }
  interface DOMAttributes<T> {
    /** Gea JSX uses `class` (same as compile-time `className` → `class`). */
    class?: string | undefined
    click?: GeaNativeHandler<globalThis.MouseEvent, T> | undefined
    dblclick?: GeaNativeHandler<globalThis.MouseEvent, T> | undefined
    change?: GeaNativeHandler<globalThis.Event, T> | undefined
    input?: GeaNativeHandler<globalThis.InputEvent, T> | undefined
    submit?: GeaNativeHandler<globalThis.Event, T> | undefined
    reset?: GeaNativeHandler<globalThis.Event, T> | undefined
    focus?: GeaNativeHandler<globalThis.FocusEvent, T> | undefined
    blur?: GeaNativeHandler<globalThis.FocusEvent, T> | undefined
    keydown?: GeaNativeHandler<globalThis.KeyboardEvent, T> | undefined
    keyup?: GeaNativeHandler<globalThis.KeyboardEvent, T> | undefined
    keypress?: GeaNativeHandler<globalThis.KeyboardEvent, T> | undefined
    mousedown?: GeaNativeHandler<globalThis.MouseEvent, T> | undefined
    mouseup?: GeaNativeHandler<globalThis.MouseEvent, T> | undefined
    mouseover?: GeaNativeHandler<globalThis.MouseEvent, T> | undefined
    mouseout?: GeaNativeHandler<globalThis.MouseEvent, T> | undefined
    mouseenter?: GeaNativeHandler<globalThis.MouseEvent, T> | undefined
    mouseleave?: GeaNativeHandler<globalThis.MouseEvent, T> | undefined
    mousemove?: GeaNativeHandler<globalThis.MouseEvent, T> | undefined
    contextmenu?: GeaNativeHandler<globalThis.MouseEvent, T> | undefined
    touchstart?: GeaNativeHandler<globalThis.TouchEvent, T> | undefined
    touchend?: GeaNativeHandler<globalThis.TouchEvent, T> | undefined
    touchmove?: GeaNativeHandler<globalThis.TouchEvent, T> | undefined
    pointerdown?: GeaNativeHandler<globalThis.PointerEvent, T> | undefined
    pointerup?: GeaNativeHandler<globalThis.PointerEvent, T> | undefined
    pointermove?: GeaNativeHandler<globalThis.PointerEvent, T> | undefined
    scroll?: GeaNativeHandler<globalThis.Event, T> | undefined
    resize?: GeaNativeHandler<globalThis.UIEvent, T> | undefined
    drag?: GeaNativeHandler<globalThis.DragEvent, T> | undefined
    dragstart?: GeaNativeHandler<globalThis.DragEvent, T> | undefined
    dragend?: GeaNativeHandler<globalThis.DragEvent, T> | undefined
    dragover?: GeaNativeHandler<globalThis.DragEvent, T> | undefined
    dragleave?: GeaNativeHandler<globalThis.DragEvent, T> | undefined
    drop?: GeaNativeHandler<globalThis.DragEvent, T> | undefined
    tap?: (e: Event) => void
    longTap?: (e: Event) => void
    swipeRight?: (e: Event) => void
    swipeUp?: (e: Event) => void
    swipeLeft?: (e: Event) => void
    swipeDown?: (e: Event) => void
  }
}

export namespace JSX {
  export type Element = string
  export interface IntrinsicElements extends GeaIntrinsicElements {}
  export interface IntrinsicAttributes extends ReactJSX.IntrinsicAttributes {}
  /**
   * Same idea as React: `props` must be typed `{}` here so TypeScript reads each
   * class's real `props` / `declare props` for JSX attributes. Using `unknown`
   * makes attribute types collapse to `unknown` and breaks completions.
   */
  export interface ElementAttributesProperty {
    props: {}
  }
  export interface ElementChildrenAttribute {
    children: {}
  }
  /**
   * Gea class components implement `template(props)` instead of React's `render()`.
   */
  export interface ElementClass {
    template?(props: unknown): unknown
  }
  /**
   * Gea class components use `new Component(props)` (no React `context`) and `template()`, not `render()`.
   * React's `ElementType` includes `React.JSXElementConstructor`, which rejects Gea classes unless we override.
   */
  export type ElementType =
    | keyof IntrinsicElements
    | ((props: any) => any)
    | (new (props?: any, ...args: any[]) => ElementClass)
}

export function jsx(): string {
  return ''
}
export function jsxs(): string {
  return ''
}
export const Fragment = Symbol.for('gea.fragment')
