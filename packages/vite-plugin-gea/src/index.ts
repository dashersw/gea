import type { Plugin, ResolvedConfig } from 'vite'
import { parse } from '@babel/parser'
import { transform } from './pipeline.ts'
import { transformCompiledStoreModule } from './closure-codegen/transform/transform-store.ts'
import { transformDottedObserveCalls } from './closure-codegen/transform/transform-observe-paths.ts'
import { transformStaticRootMount } from './closure-codegen/transform/transform-static-root-mount.ts'
import { minifyGeaSymbolForKeys } from './symbol-key-minify.ts'
import { createHash } from 'node:crypto'
import { dirname, posix, relative, resolve } from 'node:path'
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
  const staticModuleShapes = new Map<string, StaticModuleShape>()
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
      if (irOptions?.enabled) {
        recordHostCapabilities(code)
        staticModuleShapes.set(cleanId, collectStaticModuleShape(code))
      }

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

        const storeResult = transformCompiledStoreModule(transformedCode, cleanId, resolveImportPath)
        for (const storeIr of storeResult?.irs ?? (storeResult?.ir ? [storeResult.ir] : [])) {
          recordStoreIr(cleanId, storeIr)
        }
        if (storeResult?.changed) {
          // A store-only module is done. A MIXED module (maps' index.device.tsx
          // declares its stores next to the component and the top-level
          // `mount(...)` call) must continue through the root-mount and
          // component passes on the store-transformed code, or the component
          // loses its IR (no mounted renderer) and the mount stays dynamic.
          const mixedModule = /\bextends\s+(Component|ReactiveComponent)\b|\bmount\s*\(/.test(storeResult.code)
          if (!mixedModule) return { code: storeResult.code, map: null }
          transformedCode = storeResult.code
          changed = true
        }

        // Inlining removes the mounted instance that component HMR patches.
        // Keep the component boundary in dev; retain this optimization for builds.
        const rootMountResult = isServeCommand
          ? null
          : transformStaticRootMount(transformedCode, cleanId, resolveImportPath)
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
        // IR build (GEA_IR_OUT / options.ir) == the embedded/native geatsc
        // backend; lets emit paths pick embedded-specific forms (e.g. the
        // keyed-list observer re-resolving the payload-less hub field).
        embedded: !!irOptions?.enabled,
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
        // A ReactiveComponent's compiled class must survive into the final
        // bundle: parents mount it as `make_shared<Class>()`, so the geatsc
        // C++ backend needs the class definition in the bundle text. Once the
        // lean transform splices template() out, the class is dead JS to
        // rollup (the IR renderer does the mounting; the `void <Child>;`
        // keep-alives are provably pure) — without this it gets tree-shaken
        // and the typed mount call references a class that no longer exists.
        if (result.ir?.components.some((component) => component.reactiveState)) {
          return { code: result.code, map: result.map ?? null, moduleSideEffects: 'no-treeshake' }
        }
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
    async generateBundle(_options, bundle) {
      if (!irOptions?.enabled) return
      const renderedIds = renderedModuleIds(bundle)
      const modules = Array.from(irModules.values()).filter((module) => {
        if (!renderedIds) return true
        return renderedIds.has(cleanRollupModuleId(module.id)) || renderedIds.has(cleanRollupModuleId(module.file))
      })
      const componentIds = new Set(modules.flatMap((module) => module.components))
      const storeIds = new Set(modules.flatMap((module) => module.stores))
      // A lean ReactiveComponent's compiled class drops its template() method
      // (the template lives only in the IR), so the emitted JS no longer
      // references the child components that template mounts — rollup
      // tree-shakes their modules, and the rendered-module filter above would
      // then drop those children from the IR even though the embedded backend
      // still mounts them from the parent's template. Close componentIds over
      // mount-slot references so IR-live children survive tree-shaking.
      const moduleById = new Map(Array.from(irModules.values()).map((module) => [module.id, module]))
      const pending = Array.from(componentIds)
      while (pending.length > 0) {
        const component = irComponents.get(pending.pop()!)
        if (!component) continue
        for (const tag of collectMountTags(component.template.slots)) {
          for (const candidate of irComponents.values()) {
            if (candidate.exportName !== tag || componentIds.has(candidate.id)) continue
            componentIds.add(candidate.id)
            pending.push(candidate.id)
            const candidateModule = moduleById.get(candidate.module)
            if (candidateModule && !modules.includes(candidateModule)) modules.push(candidateModule)
          }
        }
      }
      const liveComponents = Array.from(irComponents.values()).filter((component) => componentIds.has(component.id))
      const logicalRoutes = await collectLogicalModuleRoutes({
        entries: entryFacadeModuleIds(bundle),
        root: resolvedConfig?.root,
        moduleShapes: staticModuleShapes,
        resolveModule: async (specifier, importer) => {
          const resolved = await this.resolve(specifier, importer, { skipSelf: true })
          return resolved && !resolved.external ? cleanRollupModuleId(resolved.id) : null
        },
      })
      const components = liveComponents.map((component) =>
        attachRootRendererAuthority(component, logicalRoutes, staticModuleShapes),
      )
      const irBundle: GeaIrBundleV1 = {
        schema: 'gea-ir',
        version: 1,
        entry: geaIrEntryFromBundle(bundle) ?? geaIrConfiguredEntry(resolvedConfig),
        modules,
        components,
        stores: Array.from(irStores.values()).filter((store) => storeIds.has(store.id)),
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

  // Component tags mounted anywhere in a template's slots — including templates
  // nested in slot payloads (conditional consequent/alternate, keyed-list row
  // templates, forwarded children). Payload `attrs`/`children` hold raw Babel
  // AST at this point; recursion only follows template-shaped objects (a
  // `slots` array) so the walk never descends into the AST.
  function collectMountTags(slots: unknown, tags = new Set<string>(), depth = 0): Set<string> {
    if (depth > 8 || !Array.isArray(slots)) return tags
    for (const slot of slots) {
      if (!slot || typeof slot !== 'object') continue
      const { kind, payload } = slot as { kind?: unknown; payload?: unknown }
      if (!payload || typeof payload !== 'object') continue
      const record = payload as Record<string, unknown>
      if (kind === 'mount' && typeof record.tag === 'string') tags.add(record.tag)
      for (const key of Object.keys(record)) {
        if (key === 'attrs' || key === 'children') continue
        const value = record[key]
        if (value && typeof value === 'object' && Array.isArray((value as { slots?: unknown }).slots)) {
          collectMountTags((value as { slots: unknown }).slots, tags, depth + 1)
        }
      }
    }
    return tags
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
    if (/\baudioContext\s*\.|\b__gea_audioContext\b|\b__gea_Audio\b/.test(source)) hostCapabilities.add('audio')
    if (/\bscreen\s*\./.test(source)) hostCapabilities.add('screen')
    if (/\b__gea_embedded_image\b/.test(source)) hostCapabilities.add('image')
    if (/\b__gea_embedded_touch\b/.test(source)) hostCapabilities.add('touch')
    if (/\bdocument\s*\./.test(source)) hostCapabilities.add('dom')
  }
}

interface StaticModuleShape {
  readonly specifiers: readonly string[]
  readonly exportsByLocalName: ReadonlyMap<string, ReadonlySet<string>>
}

function collectStaticModuleShape(source: string): StaticModuleShape {
  const specifiers = new Set<string>()
  const exportsByLocalName = new Map<string, Set<string>>()
  const addExport = (localName: string, exportName: string): void => {
    const names = exportsByLocalName.get(localName) ?? new Set<string>()
    names.add(exportName)
    exportsByLocalName.set(localName, names)
  }

  try {
    const ast = parse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'classProperties', 'classPrivateProperties', 'classPrivateMethods'],
    })
    for (const statement of ast.program.body) {
      if (
        (statement.type === 'ImportDeclaration' ||
          statement.type === 'ExportNamedDeclaration' ||
          statement.type === 'ExportAllDeclaration') &&
        statement.source?.value
      ) {
        specifiers.add(statement.source.value)
      }
      if (statement.type === 'ExportNamedDeclaration') {
        const declaration = statement.declaration
        if (
          (declaration?.type === 'ClassDeclaration' || declaration?.type === 'FunctionDeclaration') &&
          declaration.id
        ) {
          addExport(declaration.id.name, declaration.id.name)
        } else if (declaration?.type === 'VariableDeclaration') {
          for (const declarator of declaration.declarations) {
            if (declarator.id.type === 'Identifier') addExport(declarator.id.name, declarator.id.name)
          }
        }
        if (!statement.source) {
          for (const specifier of statement.specifiers) {
            if (specifier.type !== 'ExportSpecifier') continue
            const localName = specifier.local.type === 'Identifier' ? specifier.local.name : specifier.local.value
            const exportName =
              specifier.exported.type === 'Identifier' ? specifier.exported.name : specifier.exported.value
            addExport(localName, exportName)
          }
        }
      } else if (statement.type === 'ExportDefaultDeclaration') {
        const declaration = statement.declaration
        if ((declaration.type === 'ClassDeclaration' || declaration.type === 'FunctionDeclaration') && declaration.id) {
          addExport(declaration.id.name, 'default')
        } else if (declaration.type === 'Identifier') {
          addExport(declaration.name, 'default')
        }
      }
    }
  } catch {
    // The component transform owns syntax diagnostics. An unparseable module
    // publishes no root-renderer authority, so the downstream protocol remains
    // fail-closed instead of guessing an identity.
  }

  return {
    specifiers: [...specifiers].sort(),
    exportsByLocalName: new Map(
      [...exportsByLocalName].map(([localName, exportNames]) => [localName, new Set([...exportNames].sort())]),
    ),
  }
}

/** Logical source coordinates are relative to the project, never to its checkout. */
async function collectLogicalModuleRoutes(input: {
  readonly entries: readonly string[]
  readonly root?: string
  readonly moduleShapes: ReadonlyMap<string, StaticModuleShape>
  readonly resolveModule: (specifier: string, importer: string) => Promise<string | null>
}): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
  let root = input.root ?? (input.entries[0] ? dirname(input.entries[0]) : '/')
  if (!input.root) {
    while (input.entries.some((entry) => relative(root, entry).startsWith('../'))) root = dirname(root)
  }
  const routes = new Map<string, Set<string>>()
  const owners = new Map<string, string>()
  const pending: string[] = []
  const add = (moduleId: string, fallback: string | null): void => {
    moduleId = cleanRollupModuleId(moduleId)
    if (routes.has(moduleId)) return
    const local = relative(root, moduleId).replace(/\\/g, '/')
    // Resolved project identities make aliases converge without collapsing
    // unrelated modules onto the same package-root or entry-root coordinate.
    const route = !local.startsWith('../') && !moduleId.startsWith('\0') ? `/${local}` : fallback
    if (!route) return
    const owner = owners.get(route)
    if (owner && owner !== moduleId) throw new Error(`Ambiguous Gea renderer module coordinate: ${route}`)
    owners.set(route, moduleId)
    routes.set(moduleId, new Set([route]))
    pending.push(moduleId)
  }
  for (const entry of input.entries) add(entry, `/${relative(root, entry).replace(/\\/g, '/')}`)
  // Visit each resolved module once: a cyclic import through an alias must not
  // generate an unbounded family of longer and longer textual routes.
  while (pending.length > 0) {
    const moduleId = pending.shift()!
    const route = [...routes.get(moduleId)!][0]!
    for (const specifier of input.moduleShapes.get(moduleId)?.specifiers ?? []) {
      const target = await input.resolveModule(specifier, moduleId)
      if (!target) continue
      const relativeImport = specifier.startsWith('./') || specifier.startsWith('../')
      const fallback = relativeImport
        ? posix.join(posix.dirname(route), specifier)
        : specifier.startsWith('/')
          ? null
          : `/@modules/${specifier}`
      add(target, fallback)
    }
  }
  return routes
}

function attachRootRendererAuthority(
  component: GeaIrComponent,
  logicalRoutes: ReadonlyMap<string, ReadonlySet<string>>,
  moduleShapes: ReadonlyMap<string, StaticModuleShape>,
): GeaIrComponent {
  const moduleId = cleanRollupModuleId(component.module)
  const routes = logicalRoutes.get(moduleId)
  const exportNames = moduleShapes.get(moduleId)?.exportsByLocalName.get(component.exportName)
  if (!routes?.size || !exportNames?.size) return component

  const candidates = [...routes].flatMap((moduleSpecifier) =>
    [...exportNames].map((exportName) => ({ moduleSpecifier, exportName })),
  )
  candidates.sort((left, right) => {
    const leftOwnName = left.exportName === component.exportName ? 0 : 1
    const rightOwnName = right.exportName === component.exportName ? 0 : 1
    return (
      leftOwnName - rightOwnName ||
      left.moduleSpecifier.length - right.moduleSpecifier.length ||
      `${left.moduleSpecifier}#${left.exportName}`.localeCompare(`${right.moduleSpecifier}#${right.exportName}`)
    )
  })
  const coordinate = candidates[0]!
  const digest = createHash('sha256')
    .update(`${coordinate.moduleSpecifier}\u0000${coordinate.exportName}`)
    .digest('hex')
  return {
    ...component,
    rootRendererAuthority: {
      component: coordinate,
      rendererResourceId: `gea-renderer:v1:${digest}`,
    },
  }
}

type GeaRollupBundle = Record<
  string,
  {
    type: string
    fileName?: string
    isEntry?: boolean
    facadeModuleId?: string | null
    modules?: Record<string, unknown>
  }
>

function entryFacadeModuleIds(bundle: GeaRollupBundle): string[] {
  return Object.values(bundle)
    .filter((item) => item.type === 'chunk' && item.isEntry && item.facadeModuleId)
    .map((item) => cleanRollupModuleId(item.facadeModuleId!))
    .sort()
}

function renderedModuleIds(bundle: GeaRollupBundle): Set<string> | null {
  const ids = new Set<string>()
  for (const item of Object.values(bundle)) {
    if (item.type !== 'chunk') continue
    if (item.facadeModuleId) ids.add(cleanRollupModuleId(item.facadeModuleId))
    if (item.modules && typeof item.modules === 'object') {
      for (const id of Object.keys(item.modules)) ids.add(cleanRollupModuleId(id))
    }
  }
  return ids.size > 0 ? ids : null
}

function cleanRollupModuleId(id: string): string {
  return id.split('?')[0] ?? id
}

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

// Re-derive `virtual:gea-compiler-runtime`'s re-export list from
// compiler-runtime.ts's OWN per-submodule `export {...} from './runtime/x'`
// lines, one output line per input line, with each relative specifier
// rewritten to an absolute path so it resolves correctly regardless of the
// virtual module's own (nonexistent) location.
//
// This exists to match the granularity of the module-graph plugin's
// dead-re-export pruning (`gea-vite-module-graph-plugin.mjs`'s
// `pruneDeadReExports`), which drops one `export ... from '<target>'`
// statement at a time based on whether `<target>` survived Rollup's
// tree-shaking. The real barrel (compiler-runtime.ts) already re-exports each
// name (group) from its own submodule file, so pruning there is correctly
// per-submodule: an app that never touches `conditionalTruthy` gets that one
// line dropped, while every other line survives untouched.
//
// The STATIC fallback below re-exported every name in ONE statement pointing
// at the barrel file itself (`export { conditionalTruthy, ... } from
// '<compiler-runtime.ts path>'`). That collapsed the whole list onto a single
// target: as long as the app used ANY compiler-runtime export, the barrel
// itself stayed live, so the prune pass could never selectively drop just
// `conditionalTruthy` -- the entire block was atomic. geatsc would then chase
// an alias for a name the real barrel had already pruned from its own
// snapshot, and get back `ts.unknownSymbol`: the `binding-blocker:
// unresolved-binding-cell` census row this fixes. Reading and rewriting the
// real file's lines keeps this virtual module byte-for-byte in sync with
// compiler-runtime.ts's structure automatically, instead of via a
// hand-maintained duplicate list that could also just drift on its own.
function compilerRuntimeExportLines(runtimePath: string): string[] | null {
  if (!runtimePath.endsWith('.ts')) return null // built .mjs bundles inline everything into one physical file already -- no sub-module granularity exists to preserve.
  let source: string
  try {
    source = readFileSync(runtimePath, 'utf8')
  } catch {
    return null
  }
  const dir = dirname(runtimePath)
  const lines: string[] = []
  const EXPORT_FROM_RE = /export\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = EXPORT_FROM_RE.exec(source))) {
    const names = match[1]
    const relativeSpecifier = match[2]
    const absoluteSpecifier = normalizeImportPath(resolve(dir, relativeSpecifier))
    lines.push(`export {${names}} from ${JSON.stringify(absoluteSpecifier)}`)
  }
  return lines.length > 0 ? lines : null
}

function compilerRuntimeSource(runtimePath: string): string {
  const perSubmoduleLines = compilerRuntimeExportLines(runtimePath)
  if (perSubmoduleLines) return `${perSubmoduleLines.join('\n')}\n`

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
  reactiveStyleProp,
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
  readItem,
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
