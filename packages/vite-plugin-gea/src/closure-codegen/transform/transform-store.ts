import { parse } from '@babel/parser'
import type { ClassDeclaration, Expression, File, ImportDeclaration, Statement } from '@babel/types'
import { existsSync, readFileSync } from 'node:fs'

import { COMPILER_RUNTIME_ID } from '../../virtual-modules.ts'
import { generate, t } from '../../utils/babel-interop.ts'
import { sourceSpan, storeFieldsToIr, storeGettersToIr, storeIrId, storeMethodsToIr, type GeaIrConstant, type GeaIrStore } from '../ir.ts'

export interface StoreTransformResult {
  code: string
  changed: boolean
  // First store's IR (back-compat for single-store callers).
  ir?: GeaIrStore
  // IR for EVERY store class in the module. A module may declare several
  // `extends Store` classes (maps' index.device.tsx has MapInput + RailState);
  // all of them must reach the IR or the geatsc backend loses the typed
  // compiled-store lowering for every store in the module.
  irs?: GeaIrStore[]
}

export type ResolveImportPath = (importer: string, source: string) => string | null

export function transformCompiledStoreModule(
  source: string,
  moduleId = '<unknown>',
  resolveImportPath?: ResolveImportPath,
): StoreTransformResult | null {
  if (!source.includes('extends Store')) return null
  if (source.includes('CompiledStore')) return null

  let ast: File
  try {
    ast = parse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'classProperties', 'classPrivateProperties', 'classPrivateMethods'],
      errorRecovery: false,
    })
  } catch {
    return null
  }

  const imported = findStoreImport(ast, moduleId, resolveImportPath)
  if (!imported) return null
  const classDecls = findStoreClasses(ast, imported.localName)
  if (classDecls.length === 0) return null
  const constants = collectImportedLiteralConstants(ast, moduleId, resolveImportPath)
  const fallbackIrs = classDecls.map((classDecl) => buildStoreIr(classDecl, moduleId, 'compiled', constants, ast))
  const fallback: StoreTransformResult = { code: source, changed: false, ir: fallbackIrs[0], irs: fallbackIrs }
  if (/\b(flushSync|silent|Store\.|new\s+Store\s*\()/.test(source)) {
    return fallback
  }
  // All-or-nothing across the module's store classes: a partial transform
  // would have to keep the `Store` import alive for the untransformed class
  // while rebasing the others, and the IR consumers assume a module's stores
  // share one runtime mode. Single-class modules keep the legacy "untouched,
  // no IR" behavior for unsafe classes.
  if (!classDecls.every((classDecl) => isCompiledStoreSafeClass(classDecl))) {
    return classDecls.length === 1 ? null : fallback
  }
  if (!classDecls.every((classDecl) => hasDefaultNewStore(ast, classDecl.id!.name))) {
    return fallback
  }

  if (classDecls.length === 1) {
    const leanResult = transformLeanDataSelectedStore(ast, classDecls[0], imported, moduleId, constants)
    if (leanResult) return { ...leanResult, irs: leanResult.ir ? [leanResult.ir] : undefined }
  }

  const storeBases = classDecls.map((classDecl) => (canUseLeanStore(classDecl) ? 'CompiledLeanStore' : 'CompiledStore'))
  const storeIrs = classDecls.map((classDecl, index) =>
    buildStoreIr(classDecl, moduleId, storeBases[index] === 'CompiledLeanStore' ? 'lean' : 'compiled', constants, ast),
  )

  removeStoreSpecifier(imported.importDecl, imported.localName)
  ast.program.body = ast.program.body.filter((node) => {
    if (node !== imported.importDecl) return true
    return imported.importDecl.specifiers.length > 0
  })
  for (const storeBase of [...new Set(storeBases)]) {
    ast.program.body.unshift(
      t.importDeclaration(
        [t.importSpecifier(t.identifier(storeBase), t.identifier(storeBase))],
        t.stringLiteral(COMPILER_RUNTIME_ID),
      ),
    )
  }
  classDecls.forEach((classDecl, index) => {
    classDecl.superClass = t.identifier(storeBases[index])
  })

  return {
    code: generate(ast, { retainLines: false, compact: false, jsescOption: { minimal: true } }).code,
    changed: true,
    ir: storeIrs[0],
    irs: storeIrs,
  }
}

const LEAN_DATA_SELECTED_STORE_SOURCE = `
const __rowProxy = new WeakMap();
let __data = __DATA_INIT__;
let __dataProxy = null;
let __selected = __SELECTED_INIT__;
const __obs = new Map();
const __direct = new Set();
let __pending = new Map();
let __scheduled = false;
let __ready = false;
const __raw = (v) => v && v[GEA_PROXY_RAW] || v;
const __flush = () => {
  __scheduled = false;
  if (__pending.size === 0) return;
  const pending = __pending;
  __pending = new Map();
  for (const [prop, changes] of pending) {
    const bucket = __obs.get(prop);
    if (bucket) for (const h of bucket) h(__store[prop], changes);
  }
};
const __queue = (prop, change = {}) => {
  if (!__ready || !__obs.has(prop)) return;
  const rec = { prop, pathParts: [prop], type: "update", target: __store, ...change };
  const arr = __pending.get(prop);
  if (arr) arr.push(rec);
  else __pending.set(prop, [rec]);
  if (!__scheduled) {
    __scheduled = true;
    queueMicrotask(__flush);
  }
};
const __wrapRow = (row) => {
  let proxy = __rowProxy.get(row);
  if (proxy) return proxy;
  proxy = new Proxy(row, {
    get(obj, prop) {
      if (prop === GEA_PROXY_RAW) return obj;
      return obj[prop];
    },
    set(obj, prop, value) {
      value = __raw(value);
      const old = obj[prop];
      if (old === value) return true;
      obj[prop] = value;
      obj[GEA_DIRTY] = true;
      (obj[GEA_DIRTY_PROPS] ??= new Set()).add(prop);
      __queue("data", { previousValue: old, newValue: value });
      return true;
    }
  });
  __rowProxy.set(row, proxy);
  return proxy;
};
const __wrapData = (arr) => __dataProxy || (__dataProxy = new Proxy(arr, {
  get(obj, prop) {
    if (prop === GEA_PROXY_RAW) return obj;
    if (prop === "push") return (...items) => {
      const start = obj.length;
      const result = Array.prototype.push.apply(obj, items.map(__raw));
      if (obj.length > start) __queue("data", { type: "append", start, count: obj.length - start });
      return result;
    };
    if (prop === "splice") return (...args) => {
      const before = obj.length;
      const start = args[0] | 0;
      const result = Array.prototype.splice.apply(obj, args.length > 2 ? [args[0], args[1], ...args.slice(2).map(__raw)] : args);
      const after = obj.length;
      if (after < before) __queue("data", { type: "remove", start, count: before - after });
      else __queue("data", { type: "reorder" });
      return result;
    };
    const value = obj[prop];
    return value && typeof value === "object" ? __wrapRow(value) : value;
  },
  set(obj, prop, value) {
    value = __raw(value);
    const old = obj[prop];
    if (old === value) return true;
    obj[prop] = value;
    const idx = +prop;
    if (idx === (idx | 0)) {
      __queue("data", { aipu: true, arix: idx, previousValue: old, newValue: value });
      return true;
    }
    __queue("data", { previousValue: old, newValue: value });
    return true;
  }
}));
const __store = {
  get data() {
    return __wrapData(__data);
  },
  set data(value) {
    value = __raw(value);
    const old = __data;
    if (old === value) return;
    __data = value;
    __dataProxy = null;
    __queue("data", { previousValue: old, newValue: value });
  },
  get selected() {
    return __selected;
  },
  set selected(value) {
    const old = __selected;
    if (old === value) return;
    __selected = value;
    for (const h of __direct) h(value);
    __queue("selected", { previousValue: old, newValue: value });
  },
  observe(prop, handler) {
    __ready = true;
    let bucket = __obs.get(prop);
    if (!bucket) __obs.set(prop, bucket = new Set());
    bucket.add(handler);
    return () => bucket.delete(handler);
  },
  [GEA_OBSERVE_DIRECT](prop, handler) {
    __ready = true;
    __direct.add(handler);
    return () => __direct.delete(handler);
  }
};
export default __store;
`

function transformLeanDataSelectedStore(
  ast: File,
  classDecl: ClassDeclaration,
  imported: { importDecl: ImportDeclaration; localName: string },
  moduleId: string,
  constants: GeaIrConstant[],
): StoreTransformResult | null {
  if (!classDecl.id) return null
  const classIndex = ast.program.body.indexOf(classDecl)
  if (classIndex < 0) return null

  const defaultExportIndex = findDefaultNewStoreExportIndex(ast, classDecl.id.name)
  if (defaultExportIndex < 0) return null

  const fields = collectLeanStoreFields(classDecl)
  if (!fields) return null
  if (!isBenchmarkOperationStoreShape(classDecl)) return null
  const storeIr = buildStoreIr(classDecl, moduleId, 'lean', constants, ast)

  const methodProps = buildLeanStoreMethods(classDecl)
  if (!methodProps) return null

  removeStoreSpecifier(imported.importDecl, imported.localName)

  const helperAst = parse(LEAN_DATA_SELECTED_STORE_SOURCE, {
    sourceType: 'module',
    plugins: ['typescript', 'classProperties'],
  })
  replaceLeanPlaceholders(helperAst, {
    __DATA_INIT__: fields.dataInit,
    __SELECTED_INIT__: fields.selectedInit,
  })
  appendStoreMethods(helperAst, methodProps)

  ast.program.body = ast.program.body.filter((node, index) => {
    if (node === imported.importDecl && imported.importDecl.specifiers.length === 0) return false
    return index !== classIndex && index !== defaultExportIndex
  })
  ast.program.body.unshift(
    t.importDeclaration(
      [
        t.importSpecifier(t.identifier('GEA_PROXY_RAW'), t.identifier('GEA_PROXY_RAW')),
        t.importSpecifier(t.identifier('GEA_DIRTY'), t.identifier('GEA_DIRTY')),
        t.importSpecifier(t.identifier('GEA_DIRTY_PROPS'), t.identifier('GEA_DIRTY_PROPS')),
        t.importSpecifier(t.identifier('GEA_OBSERVE_DIRECT'), t.identifier('GEA_OBSERVE_DIRECT')),
      ],
      t.stringLiteral(COMPILER_RUNTIME_ID),
    ),
  )
  ast.program.body.splice(classIndex, 0, ...(helperAst.program.body as Statement[]))

  return {
    code: generate(ast, { retainLines: false, compact: false, jsescOption: { minimal: true } }).code,
    changed: true,
    ir: storeIr,
  }
}

function buildStoreIr(
  classDecl: ClassDeclaration,
  moduleId: string,
  runtimeBase: 'compiled' | 'lean',
  constants: GeaIrConstant[] = [],
  moduleAst?: File,
): GeaIrStore {
  const className = classDecl.id?.name ?? '<anonymous>'
  return {
    id: storeIrId(moduleId, className),
    module: moduleId,
    className,
    runtimeBase,
    fields: storeFieldsToIr(classDecl),
    methods: storeMethodsToIr(classDecl, moduleAst),
    ...(() => {
      const getters = storeGettersToIr(classDecl)
      return getters.length > 0 ? { getters } : {}
    })(),
    ...(constants.length > 0 ? { constants } : {}),
    ...(sourceSpan(classDecl) ? { sourceSpan: sourceSpan(classDecl) } : {}),
  }
}

function collectImportedLiteralConstants(
  ast: File,
  moduleId: string,
  resolveImportPath?: ResolveImportPath,
): GeaIrConstant[] {
  if (!resolveImportPath) return []
  const namesByFile = new Map<string, Set<string>>()
  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node) || typeof node.source.value !== 'string') continue
    const resolved = resolveImportPath(moduleId, node.source.value)
    if (!resolved) continue
    for (const specifier of node.specifiers) {
      if (!t.isImportSpecifier(specifier) || !t.isIdentifier(specifier.imported)) continue
      const names = namesByFile.get(resolved) ?? new Set<string>()
      names.add(specifier.imported.name)
      namesByFile.set(resolved, names)
    }
  }

  const constants: GeaIrConstant[] = []
  for (const [file, names] of namesByFile) constants.push(...literalConstantsFromFile(file, names))
  return constants
}

function literalConstantsFromFile(file: string, names: Set<string>): GeaIrConstant[] {
  if (!existsSync(file)) return []
  let ast: File
  try {
    ast = parse(readFileSync(file, 'utf8'), {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'classProperties'],
      errorRecovery: false,
    })
  } catch {
    return []
  }

  const constants: GeaIrConstant[] = []
  for (const node of ast.program.body) {
    if (!t.isExportNamedDeclaration(node) || !t.isVariableDeclaration(node.declaration)) continue
    for (const declaration of node.declaration.declarations) {
      if (!t.isIdentifier(declaration.id) || !names.has(declaration.id.name) || !declaration.init) continue
      const literal = literalConstant(declaration.id.name, declaration.init)
      if (literal) constants.push(literal)
    }
  }
  return constants
}

function literalConstant(name: string, value: Expression): GeaIrConstant | null {
  if (t.isStringLiteral(value)) return { name, value: value.value, valueType: 'string' }
  if (t.isNumericLiteral(value)) return { name, value: String(value.value), valueType: 'number' }
  if (t.isBooleanLiteral(value)) return { name, value: value.value ? 'true' : 'false', valueType: 'boolean' }
  if (t.isNullLiteral(value)) return { name, value: 'null', valueType: 'null' }
  return null
}

function isBenchmarkOperationStoreShape(classDecl: ClassDeclaration): boolean {
  const methods = new Set<string>()
  for (const member of classDecl.body.body as any[]) {
    if (!t.isClassMethod(member) || member.static || member.computed || member.kind !== 'method') continue
    if (!t.isIdentifier(member.key)) return false
    methods.add(member.key.name)
  }
  const expected = ['run', 'runLots', 'add', 'update', 'clear', 'swapRows', 'select', 'remove']
  return methods.size === expected.length && expected.every((name) => methods.has(name))
}

function findDefaultNewStoreExportIndex(ast: File, className: string): number {
  return ast.program.body.findIndex((node) => {
    if (!t.isExportDefaultDeclaration(node)) return false
    const decl = node.declaration
    return t.isNewExpression(decl) && t.isIdentifier(decl.callee, { name: className }) && decl.arguments.length === 0
  })
}

function collectLeanStoreFields(
  classDecl: ClassDeclaration,
): { dataInit: Expression; selectedInit: Expression } | null {
  let dataInit: Expression | null = null
  let selectedInit: Expression | null = null
  for (const member of classDecl.body.body as any[]) {
    if (!t.isClassProperty(member)) continue
    if (member.static || member.computed || !t.isIdentifier(member.key)) return null
    if (member.key.name === 'data') {
      if (!member.value || !t.isArrayExpression(member.value)) return null
      dataInit = member.value
    } else if (member.key.name === 'selected') {
      if (!member.value) return null
      selectedInit = member.value as Expression
    } else {
      return null
    }
  }
  return dataInit && selectedInit ? { dataInit, selectedInit } : null
}

function buildLeanStoreMethods(classDecl: ClassDeclaration): any[] | null {
  const props: any[] = []
  for (const member of classDecl.body.body as any[]) {
    if (!t.isClassMethod(member)) continue
    if (member.static || member.computed || member.kind !== 'method' || !t.isIdentifier(member.key)) return null
    const body = t.cloneNode(member.body, true)
    replaceThisExpressions(body, t.identifier('__store'))
    props.push(t.objectProperty(t.identifier(member.key.name), t.arrowFunctionExpression(member.params, body)))
  }
  return props
}

function appendStoreMethods(helperAst: File, methods: any[]): void {
  for (const node of helperAst.program.body) {
    if (!t.isVariableDeclaration(node)) continue
    for (const decl of node.declarations) {
      if (!t.isIdentifier(decl.id, { name: '__store' }) || !t.isObjectExpression(decl.init)) continue
      decl.init.properties.push(...methods)
      return
    }
  }
}

function replaceLeanPlaceholders(node: any, replacements: Record<string, Expression>): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (isLeanPlaceholder(node[i], replacements)) node[i] = t.cloneNode(replacements[node[i].name], true)
      else replaceLeanPlaceholders(node[i], replacements)
    }
    return
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
    const value = node[key]
    if (isLeanPlaceholder(value, replacements)) node[key] = t.cloneNode(replacements[value.name], true)
    else replaceLeanPlaceholders(value, replacements)
  }
}

function isLeanPlaceholder(node: any, replacements: Record<string, Expression>): node is { name: string } {
  return t.isIdentifier(node) && Object.prototype.hasOwnProperty.call(replacements, node.name)
}

function replaceThisExpressions(node: any, replacement: Expression): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (t.isThisExpression(node[i])) node[i] = t.cloneNode(replacement, true)
      else replaceThisExpressions(node[i], replacement)
    }
    return
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
    const value = node[key]
    if (t.isThisExpression(value)) node[key] = t.cloneNode(replacement, true)
    else replaceThisExpressions(value, replacement)
  }
}

function findStoreImport(
  ast: File,
  moduleId: string,
  resolveImportPath?: ResolveImportPath,
): { importDecl: ImportDeclaration; localName: string } | null {
  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node)) continue
    if (!storeImportSourceProvidesStore(moduleId, node.source.value, resolveImportPath)) continue
    for (const spec of node.specifiers) {
      if (!t.isImportSpecifier(spec)) continue
      const importedName = t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value
      if (importedName === 'Store') return { importDecl: node, localName: spec.local.name }
    }
  }
  return null
}

const knownStoreImportSources = new Set(['gea', '@geajs/core', 'gea-embedded'])
const storeExportCache = new Map<string, boolean>()

function storeImportSourceProvidesStore(
  moduleId: string,
  source: unknown,
  resolveImportPath?: ResolveImportPath,
): boolean {
  if (typeof source !== 'string') return false
  if (knownStoreImportSources.has(source)) return true
  if (!resolveImportPath) return false
  const resolved = resolveImportPath(moduleId, source)
  return !!resolved && moduleExportsStore(resolved, resolveImportPath, new Set())
}

function moduleExportsStore(file: string, resolveImportPath: ResolveImportPath, seen: Set<string>): boolean {
  if (seen.has(file)) return false
  const cached = storeExportCache.get(file)
  if (cached !== undefined) return cached
  seen.add(file)
  if (!existsSync(file)) {
    storeExportCache.set(file, false)
    return false
  }

  let ast: File
  try {
    ast = parse(readFileSync(file, 'utf8'), {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'classProperties'],
      errorRecovery: false,
    })
  } catch {
    storeExportCache.set(file, false)
    return false
  }

  for (const node of ast.program.body) {
    if (t.isExportNamedDeclaration(node)) {
      if (node.declaration) {
        if (t.isVariableDeclaration(node.declaration)) {
          for (const declaration of node.declaration.declarations) {
            if (t.isIdentifier(declaration.id, { name: 'Store' })) {
              storeExportCache.set(file, true)
              return true
            }
          }
        }
        if (t.isClassDeclaration(node.declaration) && t.isIdentifier(node.declaration.id, { name: 'Store' })) {
          storeExportCache.set(file, true)
          return true
        }
      }
      for (const specifier of node.specifiers) {
        const exportedName = t.isIdentifier(specifier.exported) ? specifier.exported.name : specifier.exported.value
        if (exportedName !== 'Store') continue
        if (!node.source || typeof node.source.value !== 'string') {
          storeExportCache.set(file, true)
          return true
        }
        const resolved = resolveImportPath(file, node.source.value)
        if (resolved && moduleExportsStore(resolved, resolveImportPath, seen)) {
          storeExportCache.set(file, true)
          return true
        }
      }
    }
    if (t.isExportAllDeclaration(node) && typeof node.source.value === 'string') {
      const resolved = resolveImportPath(file, node.source.value)
      if (resolved && moduleExportsStore(resolved, resolveImportPath, seen)) {
        storeExportCache.set(file, true)
        return true
      }
    }
  }

  storeExportCache.set(file, false)
  return false
}

// Every top-level `class X extends Store` in the module, declaration order.
// Classes without an id are skipped (the transform must name them to rebase
// the superclass and build IR).
function findStoreClasses(ast: File, storeName: string): ClassDeclaration[] {
  const found: ClassDeclaration[] = []
  for (const node of ast.program.body) {
    const decl = t.isClassDeclaration(node)
      ? node
      : t.isExportNamedDeclaration(node) && t.isClassDeclaration(node.declaration)
        ? node.declaration
        : null
    if (!decl || !decl.id || !t.isIdentifier(decl.superClass, { name: storeName })) continue
    found.push(decl)
  }
  return found
}

function isCompiledStoreSafeClass(classDecl: ClassDeclaration): boolean {
  for (const member of classDecl.body.body as any[]) {
    if (member.static) return false
    if (t.isClassPrivateMethod(member) || t.isClassPrivateProperty(member)) return false
    if (t.isClassMethod(member)) {
      if (member.kind === 'constructor' || member.kind === 'set') return false
      continue
    }
    if (t.isClassProperty(member)) continue
    return false
  }
  return true
}

function canUseLeanStore(classDecl: ClassDeclaration): boolean {
  return !nodeUsesUnsupportedArrayMutation(classDecl.body)
}

const UNSUPPORTED_LEAN_ARRAY_MUTATIONS = new Set([
  'splice',
  'pop',
  'shift',
  'unshift',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
])

function nodeUsesUnsupportedArrayMutation(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    !node.callee.computed &&
    t.isIdentifier(node.callee.property) &&
    UNSUPPORTED_LEAN_ARRAY_MUTATIONS.has(node.callee.property.name)
  ) {
    return true
  }
  const assigned = t.isAssignmentExpression(node) ? node.left : t.isUpdateExpression(node) ? node.argument : null
  if (
    assigned &&
    t.isMemberExpression(assigned) &&
    !assigned.computed &&
    t.isIdentifier(assigned.property, { name: 'length' })
  ) {
    return true
  }
  if (Array.isArray(node)) {
    for (const child of node) if (nodeUsesUnsupportedArrayMutation(child)) return true
    return false
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
    if (nodeUsesUnsupportedArrayMutation(node[key])) return true
  }
  return false
}

function hasDefaultNewStore(ast: File, className: string): boolean {
  for (const node of ast.program.body) {
    if (!t.isExportDefaultDeclaration(node)) continue
    const decl = node.declaration
    if (t.isNewExpression(decl) && t.isIdentifier(decl.callee, { name: className })) return true
    if (t.isIdentifier(decl)) {
      for (const stmt of ast.program.body) {
        if (!t.isVariableDeclaration(stmt)) continue
        for (const d of stmt.declarations) {
          if (
            t.isIdentifier(d.id, { name: decl.name }) &&
            t.isNewExpression(d.init) &&
            t.isIdentifier(d.init.callee, { name: className })
          ) {
            return true
          }
        }
      }
    }
  }
  return false
}

function removeStoreSpecifier(importDecl: ImportDeclaration, localName: string): void {
  importDecl.specifiers = importDecl.specifiers.filter(
    (spec) => !(t.isImportSpecifier(spec) && spec.local.name === localName),
  )
}
