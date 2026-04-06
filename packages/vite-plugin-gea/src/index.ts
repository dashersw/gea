import type { Plugin, ResolvedConfig } from 'vite'
import { transform } from './pipeline.ts'
import { dirname, relative, resolve } from 'node:path'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pluginDir = dirname(fileURLToPath(import.meta.url))

function hasSSREnvironment(ctx: object): boolean {
  if (!('environment' in ctx)) return false
  const env = ctx.environment
  return typeof env === 'object' && env !== null && 'name' in env && env.name === 'ssr'
}

const RECONCILE_ID = 'virtual:gea-reconcile'
const RESOLVED_RECONCILE_ID = '\0' + RECONCILE_ID

const HMR_RUNTIME_ID = 'virtual:gea-hmr'
const RESOLVED_HMR_RUNTIME_ID = '\0' + HMR_RUNTIME_ID

const STORE_REGISTRY_ID = 'virtual:gea-store-registry'
const RESOLVED_STORE_REGISTRY_ID = '\0' + STORE_REGISTRY_ID

const RECONCILE_SOURCE = `
import { GEA_DOM_ITEM } from '@geajs/core';
function getKey(el) {
  if (el[GEA_DOM_ITEM]) return String(el[GEA_DOM_ITEM].id);
  return el.getAttribute('key');
}
export function reconcile(oldC, newC) {
  var oldMap = new Map();
  var arr = Array.from(oldC.children);
  for (var i = 0; i < arr.length; i++) {
    var k = getKey(arr[i]);
    if (k) oldMap.set(k, arr[i]);
  }
  var newArr = Array.from(newC.children);
  var seen = new Set();
  var prev = null;
  for (var j = 0; j < newArr.length; j++) {
    var nk = getKey(newArr[j]);
    if (!nk) continue;
    seen.add(nk);
    var existing = oldMap.get(nk);
    if (existing) {
      if (existing.innerHTML !== newArr[j].innerHTML) {
        existing.innerHTML = newArr[j].innerHTML;
      }
      var newEl = newArr[j];
      for (var a = 0; a < newEl.attributes.length; a++) {
        var at = newEl.attributes[a];
        if (at.name !== 'key' && existing.getAttribute(at.name) !== at.value) {
          existing.setAttribute(at.name, at.value);
        }
      }
      if (prev ? existing.previousElementSibling !== prev : existing !== oldC.firstElementChild) {
        if (prev) prev.after(existing); else oldC.prepend(existing);
      }
      prev = existing;
    } else {
      if (prev) prev.after(newArr[j]); else oldC.prepend(newArr[j]);
      prev = newArr[j];
    }
  }
  oldMap.forEach(function(el, key) {
    if (!seen.has(key)) el.remove();
  });
}
`

const HMR_RUNTIME_SOURCE = `
var GEA_ELEMENT = Symbol.for('gea.element');
var GEA_RENDERED = Symbol.for('gea.rendered');
var GEA_CLEANUP_BINDINGS = Symbol.for('gea.component.cleanupBindings');
var GEA_TEARDOWN_SELF_LISTENERS = Symbol.for('gea.component.teardownSelfListeners');
var GEA_CHILD_COMPONENTS = Symbol.for('gea.childComponents');
var GEA_BINDINGS = Symbol.for('gea.bindings');
var GEA_SELF_LISTENERS = Symbol.for('gea.selfListeners');
var hot = import.meta.hot;
var componentInstances = hot && hot.data && hot.data.componentInstances || new Map();
if (hot) hot.data.componentInstances = componentInstances;
var hmrGlobal = globalThis.__geaHMRGlobal || (globalThis.__geaHMRGlobal = {
  componentModules: new Map(),
  componentProxies: new Map(),
});
var componentModules = hmrGlobal.componentModules;
var componentProxies = hmrGlobal.componentProxies;

function normalizeModuleUrl(moduleUrl) {
  try {
    var url = new URL(moduleUrl, import.meta.url);
    url.search = '';
    url.hash = '';
    return url.href;
  } catch(e) {
    return String(moduleUrl || '').replace(/[?#].*$/, '');
  }
}

function getLatestComponentClass(moduleUrl, fallbackComponent) {
  var latestModule = componentModules.get(normalizeModuleUrl(moduleUrl));
  return latestModule && latestModule.default || latestModule || fallbackComponent;
}

export function registerHotModule(moduleUrl, moduleExports) {
  if (!moduleExports) return moduleExports;
  componentModules.set(normalizeModuleUrl(moduleUrl), moduleExports);
  return moduleExports;
}

export function createHotComponentProxy(moduleUrl, initialComponent) {
  var normalizedUrl = normalizeModuleUrl(moduleUrl);
  if (!componentModules.has(normalizedUrl) && initialComponent) {
    componentModules.set(normalizedUrl, { default: initialComponent });
  }
  if (!componentProxies.has(normalizedUrl)) {
    var target = function GeaHotComponentProxy() {};
    var proxy = new Proxy(target, {
      construct: function(_target, args, newTarget) {
        var ComponentClass = getLatestComponentClass(normalizedUrl, initialComponent);
        if (typeof ComponentClass !== 'function') {
          throw new Error('[gea HMR] No component class available for ' + normalizedUrl);
        }
        return Reflect.construct(ComponentClass, args, newTarget === proxy ? ComponentClass : newTarget);
      },
      get: function(_target, prop, receiver) {
        var ComponentClass = getLatestComponentClass(normalizedUrl, initialComponent);
        if (!ComponentClass) return undefined;
        if (prop === 'prototype') return ComponentClass.prototype;
        return Reflect.get(ComponentClass, prop, receiver);
      },
      set: function(_target, prop, value, receiver) {
        var ComponentClass = getLatestComponentClass(normalizedUrl, initialComponent);
        if (!ComponentClass) return false;
        return Reflect.set(ComponentClass, prop, value, receiver);
      },
      has: function(_target, prop) {
        var ComponentClass = getLatestComponentClass(normalizedUrl, initialComponent);
        return !!ComponentClass && prop in ComponentClass;
      },
      ownKeys: function() {
        var ComponentClass = getLatestComponentClass(normalizedUrl, initialComponent);
        return ComponentClass ? Reflect.ownKeys(ComponentClass) : [];
      },
      getOwnPropertyDescriptor: function(_target, prop) {
        var ComponentClass = getLatestComponentClass(normalizedUrl, initialComponent);
        return ComponentClass ? Object.getOwnPropertyDescriptor(ComponentClass, prop) : undefined;
      }
    });
    componentProxies.set(normalizedUrl, proxy);
  }
  return componentProxies.get(normalizedUrl);
}

export function registerComponentInstance(className, instance) {
  if (!componentInstances.has(className)) {
    componentInstances.set(className, new Set());
  }
  componentInstances.get(className).add(instance);
}

export function unregisterComponentInstance(className, instance) {
  var instances = componentInstances.get(className);
  if (instances) {
    instances.delete(instance);
    if (instances.size === 0) {
      componentInstances.delete(className);
    }
  }
}

function reRenderComponent(instance) {
  if (!instance || !instance[GEA_ELEMENT]) return;
  var parent = instance[GEA_ELEMENT].parentElement;
  if (!parent) return;
  var index = Array.prototype.indexOf.call(parent.children, instance[GEA_ELEMENT]);
  var props = Object.assign({}, instance.props);
  var __stateSnapshot = {};
  var __ownKeys = Object.getOwnPropertyNames(instance);
  for (var __ki = 0; __ki < __ownKeys.length; __ki++) {
    var __k = __ownKeys[__ki];
    if (__k.charAt(0) === '_' || __k === 'props' || __k === 'id') continue;
    var __desc = Object.getOwnPropertyDescriptor(instance, __k);
    if (__desc && (__desc.get || __desc.set)) continue;
    try { __stateSnapshot[__k] = instance[__k]; } catch(e) {}
  }
  instance[GEA_RENDERED] = false;
  if (typeof instance[GEA_CLEANUP_BINDINGS] === 'function') instance[GEA_CLEANUP_BINDINGS]();
  if (typeof instance[GEA_TEARDOWN_SELF_LISTENERS] === 'function') instance[GEA_TEARDOWN_SELF_LISTENERS]();
  if (instance.__cleanupCompiledDirectEvents) instance.__cleanupCompiledDirectEvents();
  var __cc = instance[GEA_CHILD_COMPONENTS];
  if (__cc && __cc.length) {
    __cc.forEach(function(child) { if (child && child.dispose) child.dispose(); });
    instance[GEA_CHILD_COMPONENTS] = [];
  }
  if (instance[GEA_ELEMENT] && instance[GEA_ELEMENT].parentNode) {
    instance[GEA_ELEMENT].parentNode.removeChild(instance[GEA_ELEMENT]);
  }
  instance[GEA_ELEMENT] = null;
  instance.props = props;
  var __restoreKeys = Object.getOwnPropertyNames(__stateSnapshot);
  for (var __ri = 0; __ri < __restoreKeys.length; __ri++) {
    try { instance[__restoreKeys[__ri]] = __stateSnapshot[__restoreKeys[__ri]]; } catch(e) {}
  }
  if (!instance[GEA_BINDINGS]) instance[GEA_BINDINGS] = [];
  if (!instance.__bindingRemovers) instance.__bindingRemovers = [];
  if (!instance[GEA_SELF_LISTENERS]) instance[GEA_SELF_LISTENERS] = [];
  if (!instance[GEA_CHILD_COMPONENTS]) instance[GEA_CHILD_COMPONENTS] = [];
  instance.render(parent, index);
  if (typeof instance.createdHooks === 'function') {
    instance.createdHooks(instance.props);
  }
}

export function handleComponentUpdate(moduleId, newModule) {
  var ComponentClass = newModule.default || newModule;
  if (!ComponentClass || typeof ComponentClass !== 'function') return false;
  var className = ComponentClass.name;
  if (!className) return false;
  var instances = componentInstances.get(className);
  if (!instances || instances.size === 0) return false;
  var newProto = ComponentClass.prototype;
  var instancesArray = Array.from(instances);
  instancesArray.forEach(function(instance) {
    try {
      Object.getOwnPropertyNames(newProto).forEach(function(name) {
        if (name === 'constructor') return;
        var descriptor = Object.getOwnPropertyDescriptor(newProto, name);
        if (!descriptor) return;
        try {
          if (typeof descriptor.value === 'function') {
            instance[name] = descriptor.value.bind(instance);
          } else {
            Object.defineProperty(instance, name, descriptor);
          }
        } catch(e) {}
      });
      try {
        var currentProto = Object.getPrototypeOf(instance);
        if (currentProto !== newProto && currentProto !== Object.prototype) {
          Object.setPrototypeOf(instance, newProto);
        }
      } catch(e) {}
      reRenderComponent(instance);
    } catch(error) {
      console.error('[gea HMR] Error updating ' + className + ':', error);
      if (hot && hot.invalidate) hot.invalidate();
    }
  });
  return true;
}
`

export function geaPlugin(): Plugin {
  const storeModules = new Set<string>()
  const componentModules = new Set<string>()
  let isServeCommand = false
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
      isServeCommand = config.command === 'serve'
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
      if (id === RECONCILE_ID) return RESOLVED_RECONCILE_ID
      if (id === HMR_RUNTIME_ID) return RESOLVED_HMR_RUNTIME_ID
      if (id === STORE_REGISTRY_ID) return RESOLVED_STORE_REGISTRY_ID
    },
    load(id) {
      if (id === RESOLVED_RECONCILE_ID) return RECONCILE_SOURCE
      if (id === RESOLVED_HMR_RUNTIME_ID) return HMR_RUNTIME_SOURCE
      if (id === RESOLVED_STORE_REGISTRY_ID) return generateStoreRegistrySource()
    },
    transform(code, id) {
      const isSSR = hasSSREnvironment(this)
      const cleanId = id.split('?')[0]
      if (!cleanId.match(/\.(js|jsx|ts|tsx)$/) || cleanId.includes('node_modules')) return null

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

      const result = transform({
        sourceFile: cleanId,
        code,
        isServe: isServeCommand,
        isSSR,
        hmrImportSource: HMR_RUNTIME_ID,
        isStoreModule,
        isComponentModule,
        resolveImportPath: (importer, source) => resolveImportPath(importer, source),
        registerStoreModule: (fp) => storeModules.add(fp),
        registerComponentModule: (fp) => componentModules.add(fp),
      })
      if (result) return result

      // For non-component files (like router.ts) that import from component
      // modules, inject HMR dep-accept so updates don't propagate further
      // and cause circular dependency TDZ errors.
      if (isServeCommand && !isSSR) {
        const componentDeps = findComponentDeps(code, cleanId)
        if (componentDeps.length > 0) {
          const accepts = componentDeps.map((dep) => `  import.meta.hot.accept('${dep}', () => {});`).join('\n')
          return {
            code: code + `\nif (import.meta.hot) {\n${accepts}\n}\n`,
            map: null,
          }
        }
      }

      return null
    },
  }
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
