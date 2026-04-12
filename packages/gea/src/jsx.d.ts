declare namespace JSX {
  type Element = HTMLElement | Node

  interface IntrinsicElements {
    [elemName: string]: any
  }
}
