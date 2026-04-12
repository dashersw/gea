import assert from 'node:assert/strict'
import babelGenerator from '@babel/generator'
import * as t from '@babel/types'
import { JSDOM } from 'jsdom'
import { geaPlugin } from '../../src/index'
import { transformSource } from '../../src/transform/index'

export { t, geaPlugin }

export const generate = 'default' in babelGenerator ? babelGenerator.default : babelGenerator

export function withDom<T>(run: (dom: JSDOM) => T): T {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    NodeFilter: globalThis.NodeFilter,
    Event: globalThis.Event,
    CustomEvent: globalThis.CustomEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  }

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id: number) => clearTimeout(id),
  })

  try {
    return run(dom)
  } finally {
    Object.assign(globalThis, previous)
    dom.window.close()
  }
}

/**
 * Compile a component source through the v2 gea plugin.
 * Returns the transformed source code.
 */
export function transformComponentSource(source: string): string {
  const result = transformSource(source, '/virtual/test-component.tsx')
  assert.ok(result, 'transformSource returned null — source may not contain Component/Store/JSX')
  return result
}

/**
 * Compile source through the vite plugin's transform hook.
 */
export async function transformWithPlugin(source: string, id: string): Promise<string | null> {
  const plugin = geaPlugin()
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
  const result = await transform?.call({} as never, source, id)
  if (!result) return null
  return typeof result === 'string' ? result : result.code
}
