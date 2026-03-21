import { JSDOM } from 'jsdom'

if (typeof globalThis.document === 'undefined') {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
  const raf = (cb) => setTimeout(() => cb(Date.now()), 0)
  const caf = (id) => clearTimeout(id)
  dom.window.requestAnimationFrame = raf
  dom.window.cancelAnimationFrame = caf

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLUnknownElement: dom.window.HTMLUnknownElement,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    MutationObserver: dom.window.MutationObserver,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    MouseEvent: dom.window.MouseEvent,
    requestAnimationFrame: raf,
    cancelAnimationFrame: caf,
    localStorage: dom.window.localStorage,
  })
}
