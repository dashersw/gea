/* eslint-disable @typescript-eslint/no-namespace, @typescript-eslint/no-empty-object-type */
// Do not `/// <reference types="react" />` here — that pulls in React’s global JSX rules
// and forces class components to match `React.Component` (constructor + instance shape).

type _GeaDomAugment<T> = import('react').DOMAttributes<T>

declare module 'react' {
  interface LabelHTMLAttributes<T> {
    /** Gea uses `for` in JSX (compiled to `htmlFor`). */
    for?: string | undefined
  }
  interface DOMAttributes<T> {
    /** Gea JSX uses `class` (same as compile-time `className` → `class`). */
    class?: string | undefined
    click?: _GeaDomAugment<T>['onClick']
    dblclick?: _GeaDomAugment<T>['onDoubleClick']
    change?: _GeaDomAugment<T>['onChange']
    input?: _GeaDomAugment<T>['onInput']
    submit?: _GeaDomAugment<T>['onSubmit']
    reset?: _GeaDomAugment<T>['onReset']
    focus?: _GeaDomAugment<T>['onFocus']
    blur?: _GeaDomAugment<T>['onBlur']
    keydown?: _GeaDomAugment<T>['onKeyDown']
    keyup?: _GeaDomAugment<T>['onKeyUp']
    keypress?: _GeaDomAugment<T>['onKeyPress']
    mousedown?: _GeaDomAugment<T>['onMouseDown']
    mouseup?: _GeaDomAugment<T>['onMouseUp']
    mouseover?: _GeaDomAugment<T>['onMouseOver']
    mouseout?: _GeaDomAugment<T>['onMouseOut']
    mouseenter?: _GeaDomAugment<T>['onMouseEnter']
    mouseleave?: _GeaDomAugment<T>['onMouseLeave']
    touchstart?: _GeaDomAugment<T>['onTouchStart']
    touchend?: _GeaDomAugment<T>['onTouchEnd']
    touchmove?: _GeaDomAugment<T>['onTouchMove']
    pointerdown?: _GeaDomAugment<T>['onPointerDown']
    pointerup?: _GeaDomAugment<T>['onPointerUp']
    pointermove?: _GeaDomAugment<T>['onPointerMove']
    scroll?: _GeaDomAugment<T>['onScroll']
    resize?: import('react').ReactEventHandler<T> | undefined
    drag?: _GeaDomAugment<T>['onDrag']
    dragstart?: _GeaDomAugment<T>['onDragStart']
    dragend?: _GeaDomAugment<T>['onDragEnd']
    dragover?: _GeaDomAugment<T>['onDragOver']
    dragleave?: _GeaDomAugment<T>['onDragLeave']
    drop?: _GeaDomAugment<T>['onDrop']
    tap?: (e: Event) => void
    longTap?: (e: Event) => void
    swipeRight?: (e: Event) => void
    swipeUp?: (e: Event) => void
    swipeLeft?: (e: Event) => void
    swipeDown?: (e: Event) => void
  }
}

declare global {
  namespace JSX {
    type Element = string
    interface IntrinsicElements extends import('react').JSX.IntrinsicElements {}
    interface IntrinsicAttributes extends import('react').JSX.IntrinsicAttributes {}
    /**
     * Same idea as React: `props` must be typed `{}` here so TypeScript reads each
     * class’s real `props` / `declare props` for JSX attributes. Using `unknown`
     * makes attribute types collapse to `unknown` and breaks completions.
     */
    interface ElementAttributesProperty {
      props: {}
    }
    interface ElementChildrenAttribute {
      children: {}
    }
    /**
     * Gea class components implement `template(props)` instead of React's `render()`.
     */
    interface ElementClass {
      template?(props: unknown): unknown
    }
    /**
     * Gea class components use `new Component(props)` (no React `context`) and `template()`, not `render()`.
     * React’s `ElementType` includes `React.JSXElementConstructor`, which rejects Gea classes unless we override.
     */
    type ElementType =
      | keyof IntrinsicElements
      | ((props: any) => any)
      | (new (props?: any, ...args: any[]) => ElementClass)
  }
}

export {}
