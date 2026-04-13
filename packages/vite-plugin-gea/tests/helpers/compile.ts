import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ResolvedConfig } from 'vite'
import { geaPlugin } from '../../src/index'
import { escapeHtml as geaEscapeHtml, sanitizeAttr as geaSanitizeAttr } from '../../../gea/src/xss'
import * as geaSymbolsNs from '../../../gea/src/symbols'
import * as geaRuntimeSymsNs from '../../../gea/src/runtime/symbols'
import { createDisposer, NOOP_DISPOSER } from '../../../gea/src/runtime/disposer'
import { scheduleAfterRenderAsync } from '../../../gea/src/runtime/after-render-async'
import { CompiledComponent } from '../../../gea/src/runtime/compiled-component'
import { CompiledLeanReactiveComponent } from '../../../gea/src/runtime/compiled-lean-reactive-component'
import { CompiledTinyReactiveComponent } from '../../../gea/src/runtime/compiled-tiny-reactive-component'
import { CompiledReactiveComponent } from '../../../gea/src/runtime/compiled-reactive-component'
import { CompiledStaticElementComponent } from '../../../gea/src/runtime/compiled-static-element-component'
import { CompiledStaticComponent } from '../../../gea/src/runtime/compiled-static-component'
import { GEA_STATIC_TEMPLATE } from '../../../gea/src/runtime/compiled-static-symbols'
import { GEA_OBSERVE_DIRECT, GEA_SET_PROPS } from '../../../gea/src/runtime/internal-symbols'
import { CompiledStore } from '../../../gea/src/runtime/compiled-store'
import { CompiledLeanStore } from '../../../gea/src/runtime/compiled-lean-store'
import { subscribe, readPath } from '../../../gea/src/runtime/subscribe'
import { withTracking } from '../../../gea/src/runtime/with-tracking'
import { patch } from '../../../gea/src/runtime/patch'
import { reactiveText, reactiveTextValue } from '../../../gea/src/runtime/reactive-text'
import { reactiveAttr } from '../../../gea/src/runtime/reactive-attr'
import { reactiveBool, reactiveBoolAttr } from '../../../gea/src/runtime/reactive-bool'
import { reactiveClass } from '../../../gea/src/runtime/reactive-class'
import { reactiveClassName } from '../../../gea/src/runtime/reactive-class-name'
import { relationalClass } from '../../../gea/src/runtime/relational-class'
import { relationalClassProp } from '../../../gea/src/runtime/relational-class-prop'
import { reactiveStyle } from '../../../gea/src/runtime/reactive-style'
import { reactiveValue, reactiveValueRead } from '../../../gea/src/runtime/reactive-value'
import { delegateEvent } from '../../../gea/src/runtime/delegate-event'
import { delegateEventFast } from '../../../gea/src/runtime/delegate-event-fast'
import { delegateClick, ensureClickDelegate } from '../../../gea/src/runtime/delegate-click'
import { reactiveHtml } from '../../../gea/src/runtime/reactive-html'
import { mount } from '../../../gea/src/runtime/mount'
import { conditional } from '../../../gea/src/runtime/conditional'
import { conditionalTruthy } from '../../../gea/src/runtime/conditional-truthy'
import { keyedList, GEA_DOM_ITEM, GEA_DOM_KEY } from '../../../gea/src/runtime/keyed-list'
import { keyedListSimple } from '../../../gea/src/runtime/keyed-list-simple'
import { keyedListProp } from '../../../gea/src/runtime/keyed-list-prop'
import { _rescue } from '../../../gea/src/runtime/keyed-list/rescue'
import { createItemObservable, createItemProxy } from '../../../gea/src/runtime/keyed-list/item-obs'
import { GEA_DIRTY, GEA_DIRTY_PROPS } from '../../../gea/src/runtime/dirty-symbols'
import type { GeaHmrBindings } from './gea-hmr-runtime'

/** Reserved — do not use these names in compileJsx* `bindings`. */
const GEA_EVAL_RESERVED = ['__geaXss', '__geaSyms', '__geaRt'] as const

/** Plain object copy of `@geajs/core` symbol exports for `__geaSyms` (avoids `new Function` param collisions with `router`, etc.). */
export const geaSymsForEval: Record<string, unknown> = { ...geaSymbolsNs, ...geaRuntimeSymsNs }

/** New runtime helpers emitted by transformFile. Made available via __geaRt param. */
export const geaRuntimeForEval: Record<string, unknown> = {
  createDisposer,
  NOOP_DISPOSER,
  scheduleAfterRenderAsync,
  CompiledComponent,
  CompiledLeanReactiveComponent,
  CompiledTinyReactiveComponent,
  CompiledReactiveComponent,
  CompiledStaticElementComponent,
  CompiledStaticComponent,
  GEA_STATIC_TEMPLATE,
  GEA_OBSERVE_DIRECT,
  GEA_SET_PROPS,
  CompiledStore,
  CompiledLeanStore,
  subscribe,
  readPath,
  withTracking,
  patch,
  reactiveText,
  reactiveTextValue,
  reactiveAttr,
  reactiveBool,
  reactiveBoolAttr,
  reactiveClass,
  reactiveClassName,
  relationalClass,
  relationalClassProp,
  reactiveStyle,
  reactiveValue,
  reactiveValueRead,
  reactiveHtml,
  delegateEvent,
  delegateEventFast,
  delegateClick,
  ensureClickDelegate,
  mount,
  conditional,
  conditionalTruthy,
  keyedList,
  keyedListSimple,
  keyedListProp,
  GEA_DOM_ITEM,
  GEA_DOM_KEY,
  GEA_DIRTY,
  GEA_DIRTY_PROPS,
  _rescue,
  createItemObservable,
  createItemProxy,
}

export function buildEvalPrelude(): string {
  const symKeys = Object.keys(geaSymsForEval).filter((k) => k !== 'default')
  const rtKeys = Object.keys(geaRuntimeForEval)
  return [
    'const geaEscapeHtml = __geaXss.geaEscapeHtml;',
    'const geaSanitizeAttr = __geaXss.geaSanitizeAttr;',
    `const { ${symKeys.join(', ')} } = __geaSyms;`,
    `const { ${rtKeys.join(', ')} } = __geaRt;`,
    '',
  ].join('\n')
}

function assertNoEvalBindingCollisions(bindings: Record<string, unknown>): void {
  for (const k of GEA_EVAL_RESERVED) {
    assert.ok(!(k in bindings), `[gea test compile] bindings must not use reserved name "${k}"`)
  }
}

/** Merge user `bindings` with reserved `__geaXss` / `__geaSyms` / `__geaRt` params for `new Function` eval. */
export function mergeEvalBindings(bindings: Record<string, unknown>): Record<string, unknown> {
  assertNoEvalBindingCollisions(bindings)
  return {
    ...bindings,
    __geaXss: { geaEscapeHtml, geaSanitizeAttr },
    __geaSyms: geaSymsForEval,
    __geaRt: geaRuntimeForEval,
  }
}

const HELPERS_DIR = dirname(fileURLToPath(import.meta.url))

/** `packages/gea-ui/src` — use with `readGeaUiSource('components', 'button.tsx')`. */
export const GEA_UI_SRC = join(HELPERS_DIR, '../../../gea-ui/src')

export function readGeaUiSource(...segments: string[]): string {
  return readFileSync(join(GEA_UI_SRC, ...segments), 'utf8')
}

/** Gea-plugin transform + esbuild + strip imports/exports for `new Function` eval. */
export async function transformGeaSourceToEvalBody(source: string, id: string): Promise<string> {
  const plugin = geaPlugin()
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
  const result = await transform?.call({} as never, source, id)
  assert.ok(result)

  let code = typeof result === 'string' ? result : result.code

  const esbuild = await import('esbuild')
  const stripped = await esbuild.transform(code, { loader: 'ts', target: 'esnext' })
  code = stripped.code

  return code
    .replace(/^import .*;$/gm, '')
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^import\s+['"][^'"]+['"];?\s*$/gm, '')
    .replaceAll('import.meta.hot', 'undefined')
    .replaceAll('import.meta.url', '""')
    .replace(/export default class\s+/g, 'class ')
    .replace(/export default function\s+/g, 'function ')
    .replace(/export class\s+/g, 'class ')
    .replace(/^export type\s+[^;]+;?\s*$/gm, '')
    .replace(/export\s*\{[^}]*\}\s*;?/g, '')
}

function parseNamedImportBindings(namesStr: string): string[] {
  return namesStr.split(',').map((part) => {
    const p = part.trim()
    const m = p.match(/^(\w+)\s+as\s+(\w+)$/)
    if (m) return m[2]!
    return p
  })
}

/**
 * Same as {@link transformGeaSourceToEvalBody}, but keeps the HMR block alive:
 * `import.meta.hot` → `globalThis.__geaHmrTestHot`, `import.meta.url` → `moduleUrl`,
 * and `virtual:gea-hmr` imports become `const { … } = __geaHmrBindings`.
 */
export async function transformGeaSourceToEvalBodyForHmr(
  source: string,
  id: string,
  moduleUrl: string,
): Promise<string> {
  const plugin = geaPlugin()
  const configResolved = plugin.configResolved
  if (typeof configResolved === 'function') {
    configResolved.call({} as never, { command: 'serve' } as ResolvedConfig)
  }
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
  const result = await transform?.call({} as never, source, id)
  assert.ok(result)

  let code = typeof result === 'string' ? result : result.code

  const esbuild = await import('esbuild')
  const stripped = await esbuild.transform(code, { loader: 'ts', target: 'esnext' })
  code = stripped.code

  let hmrBindingNames: string[] = []
  code = code.replace(/import\s*\{([^}]+)\}\s*from\s*['"]virtual:gea-hmr['"]\s*;?/g, (_m, names: string) => {
    hmrBindingNames = parseNamedImportBindings(names)
    return ''
  })

  const hmrPrelude = hmrBindingNames.length > 0 ? `const { ${hmrBindingNames.join(', ')} } = __geaHmrBindings;\n` : ''

  code = hmrPrelude + code

  return code
    .replace(/^import .*;$/gm, '')
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^import\s+['"][^'"]+['"];?\s*$/gm, '')
    .replaceAll('import.meta.hot', 'globalThis.__geaHmrTestHot')
    .replaceAll('import.meta.url', JSON.stringify(moduleUrl))
    .replace(/export default class\s+/g, 'class ')
    .replace(/export default function\s+/g, 'function ')
    .replace(/export class\s+/g, 'class ')
    .replace(/^export type\s+[^;]+;?\s*$/gm, '')
    .replace(/export\s*\{[^}]*\}\s*;?/g, '')
}

/**
 * Compile a source file that defines multiple top-level classes (e.g. gea-ui `card.tsx`).
 * `exportNames` must list every class identifier to return from the eval closure.
 */
export async function compileJsxModule(
  source: string,
  id: string,
  exportNames: string[],
  bindings: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const allBindings = mergeEvalBindings(bindings)
  const body = buildEvalPrelude() + (await transformGeaSourceToEvalBody(source, id))
  const compiledSource = `${body}
return { ${exportNames.join(', ')} };`
  return new Function(...Object.keys(allBindings), compiledSource)(...Object.values(allBindings)) as Record<
    string,
    unknown
  >
}

export async function compileJsxComponent(
  source: string,
  id: string,
  className: string,
  bindings: Record<string, unknown>,
) {
  const allBindings = mergeEvalBindings(bindings)
  const body = buildEvalPrelude() + (await transformGeaSourceToEvalBody(source, id))
  const compiledSource = `${body}
return ${className};`
  return new Function(...Object.keys(allBindings), compiledSource)(...Object.values(allBindings))
}

/**
 * Like {@link compileJsxComponent}, but wires `virtual:gea-hmr` to `hmrBindings` and uses `moduleUrl`
 * as `import.meta.url` so `registerHotModule` / proxies resolve consistently.
 */
export async function compileJsxComponentForHmr(
  source: string,
  id: string,
  moduleUrl: string,
  className: string,
  bindings: Record<string, unknown>,
  hmrBindings: GeaHmrBindings,
) {
  const allBindings = mergeEvalBindings(bindings)
  const body = buildEvalPrelude() + (await transformGeaSourceToEvalBodyForHmr(source, id, moduleUrl))
  const compiledSource = `${body}
return ${className};`
  return new Function(...Object.keys(allBindings), '__geaHmrBindings', compiledSource)(
    ...Object.values(allBindings),
    hmrBindings,
  )
}

export async function loadRuntimeModules(seed: string) {
  // Post-flip: compiled apps target the new closure-compiled Component at runtime/component.ts.
  const [componentModule, storeModule] = await Promise.all([
    import(`../../../gea/src/runtime/component.ts?${seed}`),
    import(`../../../gea/src/store.ts?${seed}`),
  ])
  return [componentModule, storeModule]
}

/** Same `Component` module as `@geajs/ui` and `RouterView` — required when mixing compiled examples with those packages. */
export async function loadComponentUnseeded() {
  const mod = await import('../../../gea/src/runtime/component.ts')
  return mod.Component
}
