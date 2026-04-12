import { GEA_DOM_PARENT_CHAIN } from './lib/symbols'

export {}

declare global {
  interface HTMLElement {
    [GEA_DOM_PARENT_CHAIN]?: string
  }

  interface Event {
    targetEl?: EventTarget | null
  }
}
