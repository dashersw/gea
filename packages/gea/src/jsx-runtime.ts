export namespace JSX {
  export type Element = string
  export interface IntrinsicElements {
    [elemName: string]: any
  }
  export interface IntrinsicAttributes {
    key?: string | number
  }
  /**
   * Defines that a component's attributes are read from its `props` property.
   * This ensures TypeScript correctly validates attributes against the component class's
   * defined props.
   */
  export interface ElementAttributesProperty {
    props: {}
  }
  export interface ElementChildrenAttribute {
    children: {}
  }
  /**
   * Gea class components define their view via the `template(props)` method.
   */
  export interface ElementClass {
    template?(props: unknown): unknown
  }
  /**
   * Gea components can be HTMLElements (intrinsic tags), functional components,
   * or class-based components that implement the `ElementClass` interface.
   */
  export type ElementType =
    | keyof IntrinsicElements
    | ((props: any) => any)
    | (new (props?: any, ...args: any[]) => ElementClass)
}

/**
 * Gea uses a Vite plugin to compile away JSX at build-time.
 * These stubs exist only to satisfy the TypeScript compiler and IDEs
 * when using "jsxImportSource": "@geajs/core".
 */
export function jsx() {}
export function jsxs() {}
export function jsxDev() {}
export function Fragment() {}
