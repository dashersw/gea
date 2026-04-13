// Shared v2 Component helpers for SSR tests. The v2 SSR path instantiates a
// real `@geajs/core` Component (not a v1 `template()`-style object), so tests
// define their classes through these helpers.

import { Component, GEA_CREATE_TEMPLATE } from '@geajs/core'

/** Build a Component subclass whose template renders the given HTML string. */
export function makeTestComponent(htmlFn: (self: any) => string): any {
  return class extends Component {
    [GEA_CREATE_TEMPLATE](): Node {
      const frag = document.createElement('template')
      frag.innerHTML = htmlFn(this)
      return frag.content.firstChild ?? document.createComment('')
    }
  }
}

/** Build a Component subclass whose template throws. */
export function makeThrowingComponent(message: string): any {
  return class extends Component {
    [GEA_CREATE_TEMPLATE](): Node {
      throw new Error(message)
    }
  }
}
