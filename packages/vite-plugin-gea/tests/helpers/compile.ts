import assert from 'node:assert/strict'
import { GEA_PROPS, GEA_PROP_THUNKS, GEA_SET_PROPS, GEA_CREATE_TEMPLATE } from '../../../gea/src/symbols'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ResolvedConfig } from 'vite'
import { geaPlugin } from '../../src/index'
import { geaEscapeHtml, geaSanitizeAttr } from '../../../gea/src/dom/xss'
import * as geaSymbolsNs from '../../../gea/src/symbols'
import * as geaRuntimeNs from '../../../gea/src/runtime'
import type { GeaHmrBindings } from './gea-hmr-runtime'

/** Reserved — do not use these names in compileJsx* `bindings`. */
const GEA_EVAL_RESERVED = ['__geaXss', '__geaSyms', '__geaRuntime'] as const

/** Plain object copy of `@geajs/core` symbol exports for `__geaSyms` (avoids `new Function` param collisions with `router`, etc.). */
export const geaSymsForEval: Record<string, unknown> = { ...geaSymbolsNs }

// Symbols that come from runtime (not from geaSymbolsNs) — skip in prelude to avoid duplicate declarations
const RUNTIME_SYMBOLS = new Set(['GEA_PROPS', 'GEA_PROP_THUNKS', 'GEA_SET_PROPS', 'GEA_CREATE_TEMPLATE', 'GEA_COMPILED'])

export function buildEvalPrelude(): string {
  const symKeys = Object.keys(geaSymbolsNs).filter((k) => k !== 'default' && !RUNTIME_SYMBOLS.has(k))
  return [
    'const geaEscapeHtml = __geaXss.geaEscapeHtml;',
    'const geaSanitizeAttr = __geaXss.geaSanitizeAttr;',
    `const { ${symKeys.join(', ')} } = __geaSyms;`,
    '',
  ].join('\n')
}

function assertNoEvalBindingCollisions(bindings: Record<string, unknown>): void {
  for (const k of GEA_EVAL_RESERVED) {
    assert.ok(!(k in bindings), `[gea test compile] bindings must not use reserved name "${k}"`)
  }
}

/** Merge user `bindings` with reserved `__geaXss` / `__geaSyms` params for `new Function` eval. */
export function mergeEvalBindings(bindings: Record<string, unknown>): Record<string, unknown> {
  assertNoEvalBindingCollisions(bindings)
  return {
    ...bindings,
    __geaXss: { geaEscapeHtml, geaSanitizeAttr },
    __geaSyms: geaSymsForEval,
    __geaRuntime: geaRuntimeNs,
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

  // Convert @geajs/core/runtime imports to __geaRuntime destructuring (not stripped)
  code = code.replace(
    /import\s*\{([^}]+)\}\s*from\s*["']@geajs\/core\/runtime["']\s*;?/g,
    (_m, names: string) => `const { ${names} } = __geaRuntime;`,
  )

  return code
    .replace(/^import .*;$/gm, '')
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^import\s+['"][^'"]+['"];?\s*$/gm, '')
    .replaceAll('import.meta.hot', 'undefined')
    .replaceAll('import.meta.url', '""')
    .replace(/export default class\s+/g, 'class ')
    .replace(/export default function\s+/g, 'function ')
    .replace(/export class\s+/g, 'class ')
    .replace(/^export default\s+.+;?\s*$/gm, '')
    .replace(/^export type\s+[^;]+;?\s*$/gm, '')
    .replace(/export\s*\{[^}]*\}\s*;?/g, '')
    .replace(/^export (const|let|var) /gm, '$1 ')
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

  // Convert @geajs/core/runtime imports to __geaRuntime destructuring
  code = code.replace(
    /import\s*\{([^}]+)\}\s*from\s*["']@geajs\/core\/runtime["']\s*;?/g,
    (_m, names: string) => `const { ${names} } = __geaRuntime;`,
  )

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
    .replace(/^export default\s+.+;?\s*$/gm, '')
    .replace(/^export type\s+[^;]+;?\s*$/gm, '')
    .replace(/export\s*\{[^}]*\}\s*;?/g, '')
    .replace(/^export (const|let|var) /gm, '$1 ')
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
 * Compile a store source file through the v2 compiler (fields → signals, methods → batch)
 * and eval it, returning the store class.
 *
 * The source must contain `import { Store } from '@geajs/core'` (stripped during eval)
 * and the `Store` base class must be provided in `bindings`.
 *
 * Usage:
 * ```ts
 * const [, { Store }] = await loadRuntimeModules(seed)
 * const EmailStore = await compileStore(storeSource, '/path/to/store.ts', 'EmailStore', { Store })
 * const store = new EmailStore()
 * ```
 */
export async function compileStore(
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
  const [componentModule, storeModule] = await Promise.all([
    import(`../../../gea/src/component/component.ts?${seed}`),
    import(`../../../gea/src/store/store.ts?${seed}`),
  ])
  // v2 uses named exports; wrap to provide `default` for back-compat with callers that destructure `{ default: Component }`
  const compatComponentModule = { ...componentModule, default: componentModule.Component }
  return [compatComponentModule, storeModule]
}

/** Run the v3 gea plugin transform only (no esbuild, no import stripping). Useful for codegen assertions. */
export async function transformWithPlugin(source: string, id: string): Promise<string | null> {
  const plugin = geaPlugin()
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
  const result = await transform?.call({} as never, source, id)
  if (!result) return null
  return typeof result === 'string' ? result : result.code
}

/** Same `Component` module as `@geajs/ui` and `RouterView` — required when mixing compiled examples with those packages (seeded `component.ts?seed` breaks prototype checks). */
export async function loadComponentUnseeded() {
  const mod = await import('../../../gea/src/component/component.ts')
  return mod.Component
}
