import type { Plugin, ResolvedConfig } from 'vite'
import { transform } from './pipeline.ts'
import { transformCompiledStoreModule } from './closure-codegen/transform/transform-store.ts'
import { transformDottedObserveCalls } from './closure-codegen/transform/transform-observe-paths.ts'
import { transformStaticRootMount } from './closure-codegen/transform/transform-static-root-mount.ts'
import { minifyGeaSymbolForKeys } from './symbol-key-minify.ts'
import { dirname, relative, resolve } from 'node:path'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { GeaIrBundleV1, GeaIrComponent, GeaIrModule, GeaIrStore } from './closure-codegen/ir.ts'
import {
  COMPILER_RUNTIME_ID,
  HMR_RUNTIME_ID,
  HMR_RUNTIME_SOURCE,
  RECONCILE_ID,
  RECONCILE_SOURCE,
  RESOLVED_COMPILER_RUNTIME_ID,
  RESOLVED_HMR_RUNTIME_ID,
  RESOLVED_RECONCILE_ID,
  RESOLVED_STORE_REGISTRY_ID,
  STORE_REGISTRY_ID,
} from './virtual-modules.ts'

const pluginDir = dirname(fileURLToPath(import.meta.url))

function hasSSREnvironment(ctx: object): boolean {
  if (!('environment' in ctx)) return false
  const env = ctx.environment
  return typeof env === 'object' && env !== null && 'name' in env && env.name === 'ssr'
}

function shouldMinifyGeaSymbolsForBuild(config: ResolvedConfig): boolean {
  const build = config.build
  if (!build || config.command !== 'build' || build.ssr) return false

  const lib = build.lib
  if (!lib) return true

  const formats = lib.formats ?? []
  return formats.length > 0 && formats.every((format) => format === 'iife' || format === 'umd')
}

export interface GeaPluginOptions {
  ir?: {
    enabled: boolean
    outFile?: string
  }
}

export function geaPlugin(options: GeaPluginOptions = {}): Plugin {
  const envIrOutFile = process.env.GEA_IR_OUT || process.env.GEA_IR_FILE
  const irOptions = options.ir ?? (envIrOutFile ? { enabled: true, outFile: envIrOutFile } : undefined)
  const storeModules = new Set<string>()
  const componentModules = new Set<string>()
  let isServeCommand = false
  let shouldMinifyGeaSymbolKeys = false
  let resolvedConfig: ResolvedConfig | null = null
  const irModules = new Map<string, GeaIrModule>()
  const irComponents = new Map<string, GeaIrComponent>()
  const irStores = new Map<string, GeaIrStore>()
  const hostCapabilities = new Set<string>()
  // Maps absolute file path → { className, hasDefaultExport }
  const storeRegistry = new Map<string, { className: string; hasDefaultExport: boolean }>()

  const resolveImportPath = (importer: string, source: string): string | null => {
    const base = resolve(dirname(importer), source)
    const candidates = [
      base,
      `${base}.js`,
      `${base}.jsx`,
      `${base}.ts`,
      `${base}.tsx`,
      resolve(base, 'index.js'),
      resolve(base, 'index.jsx'),
      resolve(base, 'index.ts'),
      resolve(base, 'index.tsx'),
    ]

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate
    }

    return null
  }

  const extractStoreClassName = (source: string): string | null => {
    const match = source.match(/class\s+(\w+)\s+extends\s+Store\b/)
    return match ? match[1] : null
  }

  const isStoreModule = (filePath: string): boolean => {
    if (storeModules.has(filePath)) return true
    if (!existsSync(filePath)) return false
    try {
      const source = readFileSync(filePath, 'utf8')
      if (source.includes('extends Store') || source.includes('new Store(')) {
        storeModules.add(filePath)
        const className = extractStoreClassName(source)
        if (className) {
          const hasDefaultExport = /export\s+default\s+new\s+\w+/.test(source) || /export\s+default\s+\w+/.test(source)
          storeRegistry.set(filePath, { className, hasDefaultExport })
        }
        return true
      }
      if (
        /from\s+['"]@geajs\/core(?:\/[^'"]*)?['"]/.test(source) &&
        (/createRouter\b/.test(source) || /new\s+Router\b/.test(source))
      ) {
        storeModules.add(filePath)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  const looksLikeGeaFunctionalComponentSource = (source: string): boolean => {
    if (!source.includes('<') || !source.includes('>')) return false
    if (/export\s+default\s+async\s+function\b/.test(source)) return true
    if (/export\s+default\s+function\b/.test(source)) return true
    if (/export\s+default\s*\([^)]*\)\s*=>\s*/.test(source)) return true
    return false
  }

  const isComponentModule = (filePath: string): boolean => {
    if (componentModules.has(filePath)) return true
    if (!existsSync(filePath)) return false
    try {
      const source = readFileSync(filePath, 'utf8')
      if (source.includes('extends Component')) {
        componentModules.add(filePath)
        return true
      }
      if (looksLikeGeaFunctionalComponentSource(source)) {
        componentModules.add(filePath)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  const isClassComponentModule = (filePath: string): boolean => {
    if (!existsSync(filePath)) return false
    try {
      const source = readFileSync(filePath, 'utf8')
      if (!source.includes('<') || !source.includes('>')) return false
      return /\bclass\s+\w+\s+extends\s+Component\b/.test(source)
    } catch {
      return false
    }
  }

  const isFunctionComponentModule = (filePath: string): boolean => {
    if (!existsSync(filePath)) return false
    try {
      const source = readFileSync(filePath, 'utf8')
      if (!source.includes('<') || !source.includes('>')) return false
      return /export\s+default\s+function\b/.test(source) || /export\s+default\s*\([^)]*\)\s*=>\s*/.test(source)
    } catch {
      return false
    }
  }

  const generateStoreRegistrySource = (): string => {
    const imports: string[] = []
    const entries: string[] = []
    let idx = 0
    for (const [filePath, { className, hasDefaultExport }] of storeRegistry) {
      if (!hasDefaultExport) continue
      const alias = `__s${idx++}`
      imports.push(`import ${alias} from '${filePath}'`)
      entries.push(`  "${className}": ${alias}`)
    }
    if (imports.length === 0) {
      return 'export default {}'
    }
    return `${imports.join('\n')}\nexport default {\n${entries.join(',\n')}\n}`
  }

  const envPath = existsSync(resolve(pluginDir, 'gea-env.d.ts'))
    ? resolve(pluginDir, 'gea-env.d.ts')
    : resolve(pluginDir, '..', 'gea-env.d.ts')

  return {
    name: 'gea-plugin',
    enforce: 'pre',
    configResolved(config: ResolvedConfig) {
      resolvedConfig = config
      isServeCommand = config.command === 'serve'
      shouldMinifyGeaSymbolKeys = shouldMinifyGeaSymbolsForBuild(config)
    },
    config(config) {
      if (!existsSync(envPath)) return
      const projectRoot = resolve(config.root || process.cwd())
      const tsconfigPath = resolve(projectRoot, 'tsconfig.json')
      if (!existsSync(tsconfigPath)) return
      const envRelative = relative(projectRoot, envPath).replace(/\\/g, '/')
      if (envRelative.startsWith('/') || !envRelative) return
      try {
        const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'))
        const include = (tsconfig.include as string[] | undefined) || []
        if (include.some((p: string) => p.includes('gea-env.d.ts'))) return
        tsconfig.include = [...include, envRelative]
        writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2))
      } catch {
        /* ignore */
      }
    },
    resolveId(id) {
      if (id === COMPILER_RUNTIME_ID) return RESOLVED_COMPILER_RUNTIME_ID
      if (id === RECONCILE_ID) return RESOLVED_RECONCILE_ID
      if (id === HMR_RUNTIME_ID) return RESOLVED_HMR_RUNTIME_ID
      if (id === STORE_REGISTRY_ID) return RESOLVED_STORE_REGISTRY_ID
    },
    async load(id) {
      if (id === RESOLVED_COMPILER_RUNTIME_ID) {
        const resolvedCore = await this.resolve('@geajs/core', undefined, { skipSelf: true })
        const fromCoreEntry = resolvedCore?.id ? compilerRuntimePathFromCoreEntry(resolvedCore.id) : null
        const candidates = [
          fromCoreEntry,
          resolve(pluginDir, '../../gea/src/compiler-runtime.ts'),
          resolve(pluginDir, '../../gea/dist/compiler-runtime.mjs'),
          resolve(pluginDir, '../../core/dist/compiler-runtime.mjs'),
        ].filter((candidate): candidate is string => !!candidate)
        for (const candidate of candidates) {
          if (existsSync(candidate)) return compilerRuntimeSource(candidate)
        }
        throw new Error('[gea-plugin] Could not resolve @geajs/core compiler runtime')
      }
      if (id === RESOLVED_RECONCILE_ID) return RECONCILE_SOURCE
      if (id === RESOLVED_HMR_RUNTIME_ID) return HMR_RUNTIME_SOURCE
      if (id === RESOLVED_STORE_REGISTRY_ID) return generateStoreRegistrySource()
    },
    transform(code, id) {
      const isSSR = hasSSREnvironment(this)
      const cleanId = id.split('?')[0]
      if (!cleanId.match(/\.(js|jsx|ts|tsx)$/) || cleanId.includes('node_modules')) return null
      let transformedCode = code
      let changed = false
      if (irOptions?.enabled) recordHostCapabilities(code)

      // Register stores (must happen before pipeline for cross-file tracking)
      if (code.includes('extends Store') || code.includes('new Store(')) {
        storeModules.add(cleanId)
        const storeClassName = extractStoreClassName(code)
        if (storeClassName) {
          const hasDefaultExport = /export\s+default\s+new\s+\w+/.test(code) || /export\s+default\s+\w+/.test(code)
          storeRegistry.set(cleanId, { className: storeClassName, hasDefaultExport })
        }
      }

      if (/\bclass\s+Component\s+extends\s+Store\b/.test(code)) return null

      if (!isSSR) {
        const observeResult = transformDottedObserveCalls(transformedCode)
        if (observeResult?.changed) {
          transformedCode = observeResult.code
          changed = true
        }

        const storeResult = transformCompiledStoreModule(transformedCode, cleanId)
        if (storeResult?.ir) recordStoreIr(cleanId, storeResult.ir)
        if (storeResult?.changed) return { code: storeResult.code, map: null }

        const rootMountResult = transformStaticRootMount(transformedCode, cleanId, resolveImportPath)
        if (rootMountResult?.changed) {
          for (const file of rootMountResult.watchFiles ?? []) this.addWatchFile?.(file)
          return { code: rootMountResult.code, map: null }
        }
      }

      const result = transform({
        sourceFile: cleanId,
        code: transformedCode,
        isServe: isServeCommand,
        isSSR,
        hmrImportSource: HMR_RUNTIME_ID,
        isStoreModule,
        isComponentModule,
        isClassComponentModule,
        isFunctionComponentModule,
        resolveImportPath: (importer, source) => resolveImportPath(importer, source),
        registerStoreModule: (fp) => storeModules.add(fp),
        registerComponentModule: (fp) => componentModules.add(fp),
      })
      if (result) {
        if (result.ir) recordComponentIr(cleanId, result.ir)
        return result
      }

      // For non-component files (like router.ts) that import from component
      // modules, inject HMR dep-accept so updates don't propagate further
      // and cause circular dependency TDZ errors.
      if (isServeCommand && !isSSR) {
        const componentDeps = findComponentDeps(transformedCode, cleanId)
        if (componentDeps.length > 0) {
          const accepts = componentDeps.map((dep) => `  import.meta.hot.accept('${dep}', () => {});`).join('\n')
          return {
            code: transformedCode + `\nif (import.meta.hot) {\n${accepts}\n}\n`,
            map: null,
          }
        }
      }

      if (changed) return { code: transformedCode, map: null }

      return null
    },
    renderChunk(code) {
      if (!shouldMinifyGeaSymbolKeys) return null
      const next = minifyGeaSymbolForKeys(code)
      return next === code ? null : { code: next, map: null }
    },
    generateBundle(_options, bundle) {
      if (!irOptions?.enabled) return
      const irBundle: GeaIrBundleV1 = {
        schema: 'gea-ir',
        version: 1,
        entry: geaIrEntryFromBundle(bundle) ?? geaIrConfiguredEntry(resolvedConfig),
        modules: Array.from(irModules.values()),
        components: Array.from(irComponents.values()),
        stores: Array.from(irStores.values()),
        hostCapabilities: Array.from(hostCapabilities).sort(),
      }
      const source = JSON.stringify(irBundle, null, 2)
      const outFile = irOptions.outFile ?? 'gea-ir.json'
      if (outFile.startsWith('/') || /^[A-Za-z]:[\\/]/.test(outFile)) {
        mkdirSync(dirname(outFile), { recursive: true })
        writeFileSync(outFile, source)
      } else {
        this.emitFile({ type: 'asset', fileName: outFile, source })
      }
    },
  }

  function recordComponentIr(moduleId: string, ir: { module: GeaIrModule; components: GeaIrComponent[] }): void {
    const existing = irModules.get(moduleId) ?? { id: moduleId, file: moduleId, components: [], stores: [] }
    const componentIds = new Set(existing.components)
    for (const component of ir.components) {
      irComponents.set(component.id, component)
      componentIds.add(component.id)
    }
    irModules.set(moduleId, { ...existing, components: Array.from(componentIds) })
  }

  function recordStoreIr(moduleId: string, store: GeaIrStore): void {
    const existing = irModules.get(moduleId) ?? { id: moduleId, file: moduleId, components: [], stores: [] }
    const storeIds = new Set(existing.stores)
    irStores.set(store.id, store)
    storeIds.add(store.id)
    irModules.set(moduleId, { ...existing, stores: Array.from(storeIds) })
  }

  function recordHostCapabilities(source: string): void {
    if (/\bfetch\s*\(/.test(source)) hostCapabilities.add('fetch')
    if (source.includes('https://')) hostCapabilities.add('https')
    if (/\bApps\s*\./.test(source)) hostCapabilities.add('apps')
    if (/\b(?:BLE|BLEServer)\b|\bgea_embedded_ble_|\b__gea_embedded_ble_/.test(source)) hostCapabilities.add('ble')
    if (/\bWiFi\s*\./.test(source)) hostCapabilities.add('wifi')
    if (/\b(?:Accelerometer|accelerometer)\s*\.|\bgea_embedded_imu_/.test(source)) hostCapabilities.add('imu')
    if (/\baudioContext\s*\.|\bgea_embedded_audio_/.test(source)) hostCapabilities.add('audio')
    if (/\bscreen\s*\./.test(source)) hostCapabilities.add('screen')
    if (/\b__gea_embedded_image\b/.test(source)) hostCapabilities.add('image')
    if (/\b__gea_embedded_touch\b/.test(source)) hostCapabilities.add('touch')
    if (/\bdocument\s*\./.test(source)) hostCapabilities.add('dom')
  }
}

type GeaRollupBundle = Record<string, { type: string; fileName?: string; isEntry?: boolean; facadeModuleId?: string | null }>

function geaIrEntryFromBundle(bundle: GeaRollupBundle): string | null {
  const entries = Object.values(bundle)
    .filter((item) => item.type === 'chunk' && item.isEntry && item.fileName)
    .map((item) => item.fileName!)
    .sort()
  return entries[0] ?? null
}

function geaIrConfiguredEntry(config: ResolvedConfig | null): string {
  const input = config?.build.rollupOptions.input
  if (typeof input === 'string') return input
  if (Array.isArray(input)) return input[0] ? String(input[0]) : ''
  if (input && typeof input === 'object') {
    const firstKey = Object.keys(input).sort()[0]
    return firstKey ? String(input[firstKey]) : ''
  }
  return ''
}

function resolveToFile(base: string): string | null {
  const exts = ['.ts', '.tsx', '.js', '.jsx']
  const indexFiles = exts.map((ext) => resolve(base, 'index' + ext))
  const candidates = [base, ...exts.map((ext) => base + ext), ...indexFiles]
  for (const c of candidates) {
    try {
      if (existsSync(c) && statSync(c).isFile()) return c
    } catch {
      /* skip */
    }
  }
  return null
}

function normalizeImportPath(path: string): string {
  return path.replace(/\\/g, '/')
}

function compilerRuntimePathFromCoreEntry(entry: string): string | null {
  const clean = entry.split('?')[0]
  if (clean.endsWith('/src/index.ts')) return clean.slice(0, -'/src/index.ts'.length) + '/src/compiler-runtime.ts'
  if (clean.endsWith('/dist/index.mjs')) return clean.slice(0, -'/dist/index.mjs'.length) + '/dist/compiler-runtime.mjs'
  return null
}

function compilerRuntimeSource(runtimePath: string): string {
  const path = normalizeImportPath(runtimePath)
  return `export {
  NOOP_DISPOSER,
  createDisposer,
  CompiledComponent,
  CompiledLeanReactiveComponent,
  CompiledLeanStore,
  CompiledReactiveComponent,
  CompiledTinyReactiveComponent,
  CompiledStaticElementComponent,
  CompiledStaticComponent,
  CompiledStore,
  reactiveText,
  reactiveTextValue,
  reactiveAttr,
  reactiveHtml,
  reactiveBool,
  reactiveBoolAttr,
  reactiveClass,
  reactiveClassName,
  relationalClass,
  relationalClassProp,
  reactiveStyle,
  reactiveValue,
  reactiveValueRead,
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
  createItemObservable,
  createItemProxy,
  _rescue,
  GEA_CREATE_TEMPLATE,
  GEA_PARENT_COMPONENT,
  GEA_STATIC_TEMPLATE,
  GEA_OBSERVE_DIRECT,
  GEA_SET_PROPS,
  GEA_PROXY_RAW,
} from ${JSON.stringify(path)}
`
}

function findComponentDeps(code: string, filePath: string): string[] {
  const deps: string[] = []
  const importRegex = /import\s+(?:[\w{},\s*]+)\s+from\s+['"](\.[^'"]+)['"]/g
  let match
  while ((match = importRegex.exec(code)) !== null) {
    const source = match[1]
    const base = resolve(dirname(filePath), source)
    const resolved = resolveToFile(base)
    if (!resolved) continue
    try {
      const depCode = readFileSync(resolved, 'utf8')
      const looksLikeComponent =
        /class\s+\w+\s+extends\s+Component\b/.test(depCode) && depCode.includes('<') && depCode.includes('>')
      if (looksLikeComponent) deps.push(source)
    } catch {
      /* skip */
    }
  }
  return deps
}
