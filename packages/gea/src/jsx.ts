/* eslint-disable @typescript-eslint/no-namespace, @typescript-eslint/no-unused-vars */
declare namespace JSX {
  type Element = string
  interface IntrinsicElements {
    [elemName: string]: any
    Teleport: {
      'to-selector': string
      disabled?: boolean
      children?: any
    }
  }
  interface IntrinsicAttributes {
    key?: string | number
  }
}
export {}
