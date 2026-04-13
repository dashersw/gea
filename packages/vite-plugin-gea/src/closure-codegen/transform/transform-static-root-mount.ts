import { parse } from '@babel/parser'
import type {
  ClassDeclaration,
  Expression,
  File,
  FunctionDeclaration,
  ImportDeclaration,
  Statement,
} from '@babel/types'
import { readFileSync } from 'node:fs'
import { dirname, relative } from 'node:path'

import { generate, t, traverse } from '../../utils/babel-interop.ts'
import {
  collectBindings,
  compileJsxToBlock,
  createEmitContext,
  lowerJsxInStatement,
  substituteBindings,
  type DirectFnComponentParams,
} from '../emit.ts'
import { extractTemplateJsx, findTemplateMethod } from '../generator.ts'
import { extractPrecedingStatements, foldEarlyReturnGuards } from './transform-template-methods.ts'
import { collectDirectFnComponentParams, collectDirectFnComponents, collectDirectFnStringProps } from '../transform.ts'
import { canUseStaticCompiledComponent, rewriteFnComponent } from './transform-components.ts'
import { ensureCoreImports } from './transform-imports.ts'

interface MountPattern {
  appImport: string
  start: number
  end: number
  parent: Expression
}

interface StaticTemplateFactory {
  imports: ImportDeclaration[]
  declarations: Statement[]
  mountExpression: Expression
  importsNeeded: Set<string>
}

interface ImportedStaticFunction {
  localName: string
  fnDecl: FunctionDeclaration
  params: DirectFnComponentParams
}

export interface StaticRootMountTransformResult {
  code: string
  changed: boolean
}

export function transformStaticRootMount(
  source: string,
  filePath: string,
  resolveImportPath: (importer: string, source: string) => string | null,
): StaticRootMountTransformResult | null {
  if (!source.includes('.render') || !source.includes('new ')) return null

  let ast: File
  try {
    ast = parse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'classProperties', 'classPrivateProperties', 'classPrivateMethods'],
    })
  } catch {
    return null
  }

  const defaultImports = collectDefaultImports(ast)
  if (defaultImports.size === 0) return null

  const pattern = findRootMountPattern(ast, defaultImports)
  if (!pattern) return null
  if (countIdentifier(ast, pattern.appImport) !== 2) return null

  const imported = defaultImports.get(pattern.appImport)
  if (!imported || !imported.source.startsWith('.')) return null
  const resolved = resolveImportPath(filePath, imported.source)
  if (!resolved) return null

  const factory = createStaticTemplateFactory(resolved, '__gea_root0', filePath, resolveImportPath)
  if (!factory) return null

  ast.program.body.splice(
    pattern.start,
    pattern.end - pattern.start + 1,
    createAppendStatement(pattern.parent, factory),
  )
  removeDefaultImport(ast, pattern.appImport)
  insertDeclarationsAfterImports(ast, factory.imports)
  insertDeclarationsAfterImports(ast, factory.declarations)
  ensureCoreImports(ast, factory.importsNeeded)

  const out = generate(ast, { retainLines: false, compact: false, jsescOption: { minimal: true } })
  return { code: out.code, changed: true }
}

function collectDefaultImports(ast: File): Map<string, { source: string; declaration: ImportDeclaration }> {
  const out = new Map<string, { source: string; declaration: ImportDeclaration }>()
  for (const stmt of ast.program.body) {
    if (!t.isImportDeclaration(stmt)) continue
    for (const spec of stmt.specifiers) {
      if (t.isImportDefaultSpecifier(spec)) out.set(spec.local.name, { source: stmt.source.value, declaration: stmt })
    }
  }
  return out
}

function findRootMountPattern(ast: File, imports: Map<string, unknown>): MountPattern | null {
  const body = ast.program.body
  for (let i = 0; i < body.length; i++) {
    const direct = directMountPattern(body[i], imports)
    if (direct) return { ...direct, start: i, end: i }

    const next = body[i + 1]
    if (!next) continue
    const split = splitMountPattern(body[i], next, imports)
    if (split) return { ...split, start: i, end: i + 1 }
  }
  return null
}

function directMountPattern(
  stmt: Statement,
  imports: Map<string, unknown>,
): Omit<MountPattern, 'start' | 'end'> | null {
  if (!t.isExpressionStatement(stmt)) return null
  const expr = stmt.expression
  if (!t.isCallExpression(expr) || !t.isMemberExpression(expr.callee)) return null
  if (!t.isIdentifier(expr.callee.property, { name: 'render' })) return null
  if (!t.isNewExpression(expr.callee.object) || !t.isIdentifier(expr.callee.object.callee)) return null
  if (expr.arguments.length !== 1 || !t.isExpression(expr.arguments[0])) return null
  const appImport = expr.callee.object.callee.name
  if (!imports.has(appImport)) return null
  return { appImport, parent: t.cloneNode(expr.arguments[0], true) as Expression }
}

function splitMountPattern(
  first: Statement,
  second: Statement,
  imports: Map<string, unknown>,
): Omit<MountPattern, 'start' | 'end'> | null {
  if (!t.isVariableDeclaration(first) || first.declarations.length !== 1) return null
  const decl = first.declarations[0]
  if (!t.isIdentifier(decl.id) || !t.isNewExpression(decl.init) || !t.isIdentifier(decl.init.callee)) return null
  const appImport = decl.init.callee.name
  if (!imports.has(appImport)) return null

  if (!t.isExpressionStatement(second)) return null
  const expr = second.expression
  if (!t.isCallExpression(expr) || !t.isMemberExpression(expr.callee)) return null
  if (!t.isIdentifier(expr.callee.object, { name: decl.id.name })) return null
  if (!t.isIdentifier(expr.callee.property, { name: 'render' })) return null
  if (expr.arguments.length !== 1 || !t.isExpression(expr.arguments[0])) return null

  if (countIdentifierInStatements([first, second], decl.id.name) !== 2) return null
  return { appImport, parent: t.cloneNode(expr.arguments[0], true) as Expression }
}

function createStaticTemplateFactory(
  componentPath: string,
  tplName: string,
  mountFilePath: string,
  resolveImportPath: (importer: string, source: string) => string | null,
): StaticTemplateFactory | null {
  let source: string
  try {
    source = readFileSync(componentPath, 'utf8')
  } catch {
    return null
  }

  let ast: File
  try {
    ast = parse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'classProperties', 'classPrivateProperties', 'classPrivateMethods'],
    })
  } catch {
    return null
  }

  const classDecl = findDefaultClassDeclaration(ast)
  if (!classDecl || !canUseStaticCompiledComponent(classDecl)) return null
  if (!hasNoRootModuleTopLevelSideEffects(ast, classDecl)) return null
  const templateMethod = findTemplateMethod(classDecl)
  if (templateMethod) foldEarlyReturnGuards(templateMethod)
  const jsx = templateMethod ? extractTemplateJsx(templateMethod) : null
  if (!jsx || !isBuiltinElementRoot(jsx)) return null

  const ctx = createEmitContext()
  ctx.directFnComponents = collectDirectFnComponents(ast)
  ctx.directFnComponentParams = collectDirectFnComponentParams(ast, ctx.directFnComponents)
  ctx.directFnNoDisposer = new Set()
  ctx.directFnFactoryAliases = new Map()
  ctx.directClassComponents = new Set()
  ctx.directFactoryComponents = new Set()

  const importedFns: ImportedStaticFunction[] = []
  if (!collectImportedStaticFunctionComponents(ast, componentPath, resolveImportPath, ctx, importedFns)) return null
  ctx.directFnStringProps = collectDirectFnStringProps(ast, ctx.directFnComponents)

  const blockedRootBindings = collectRootModuleBindings(ast, classDecl, ctx.directFnComponents)
  if (nodeContainsAnyIdentifier(jsx, blockedRootBindings)) return null

  const importedFnDecls: Statement[] = []
  for (const imported of importedFns) {
    const compiled = compileImportedStaticFunction(imported, ctx)
    if (!compiled) return null
    if (compiled.factoryName) {
      ctx.directFnFactoryAliases.set(imported.localName, compiled.factoryName)
    } else if (compiled.fnDecl) {
      importedFnDecls.push(compiled.fnDecl)
    }
  }

  const fnDecls: Statement[] = []
  for (const stmt of ast.program.body) {
    if (!t.isFunctionDeclaration(stmt) || !stmt.id || !ctx.directFnComponents.has(stmt.id.name)) continue
    rewriteFnComponent(stmt, ctx)
    const alias = getZeroArgFactoryAlias(stmt)
    if (alias) {
      ctx.directFnFactoryAliases.set(stmt.id.name, alias)
      continue
    }
    fnDecls.push(t.cloneNode(stmt, true) as Statement)
  }

  const preceding = extractPrecedingStatements(templateMethod)
  if (preceding.length > 0) collectBindings(preceding, ctx.bindings)
  const block = compileJsxToBlock(jsx, ctx)
  if (
    ctx.importsNeeded.has('keyedList') ||
    ctx.importsNeeded.has('keyedListSimple') ||
    ctx.importsNeeded.has('keyedListProp')
  ) {
    return null
  }
  const keptPreceding = preceding
    .filter((s) => {
      if (t.isReturnStatement(s) || t.isThrowStatement(s)) return false
      if (t.isVariableDeclaration(s)) {
        const allPatterns = s.declarations.every((d) => t.isObjectPattern(d.id) || t.isArrayPattern(d.id))
        if (allPatterns) return false
      }
      return true
    })
    .map((s) => substituteBindings(s, ctx.bindings))
    .map((s) => lowerJsxInStatement(s, ctx))
  const rootUsesDisposer = nodeContainsIdentifier(block, 'd')
  const disposerArg = rootUsesDisposer ? [t.callExpression(t.identifier('createDisposer'), [])] : []
  if (rootUsesDisposer) ctx.importsNeeded.add('createDisposer')
  const factoryDecl = t.functionDeclaration(
    t.identifier(tplName + '_create'),
    rootUsesDisposer ? [t.identifier('d')] : [],
    t.blockStatement([...keptPreceding, ...block.body]),
  )
  const compiledImportNames = new Set(importedFns.map((imported) => imported.localName))
  const copiedImports = collectCopiedImports(ast, componentPath, mountFilePath, resolveImportPath, compiledImportNames)
  if (!copiedImports) return null

  return {
    imports: copiedImports,
    declarations: [...ctx.templateDecls, ...importedFnDecls, ...fnDecls, factoryDecl],
    mountExpression: t.callExpression(t.identifier(tplName + '_create'), disposerArg),
    importsNeeded: ctx.importsNeeded,
  }
}

function collectCopiedImports(
  ast: File,
  componentPath: string,
  mountFilePath: string,
  resolveImportPath: (importer: string, source: string) => string | null,
  compiledImportNames: Set<string>,
): ImportDeclaration[] | null {
  const imports: ImportDeclaration[] = []
  for (const stmt of ast.program.body) {
    if (!t.isImportDeclaration(stmt)) continue
    if (stmt.source.value === '@geajs/core') continue
    if (isTypeOnlyImport(stmt)) continue

    const copy = t.cloneNode(stmt, true) as ImportDeclaration
    copy.specifiers = copy.specifiers.filter((spec) => {
      if (specifierIsTypeOnly(spec)) return false
      return !compiledImportNames.has(spec.local.name)
    })
    if (stmt.specifiers.length > 0 && copy.specifiers.length === 0) continue

    if (typeof stmt.source.value === 'string' && stmt.source.value.startsWith('.')) {
      const resolved = resolveImportPath(componentPath, stmt.source.value)
      if (!resolved) return null
      copy.source = t.stringLiteral(toRelativeImportSource(mountFilePath, resolved))
    }
    imports.push(copy)
  }
  return imports
}

function toRelativeImportSource(fromFile: string, targetFile: string): string {
  let source = relative(dirname(fromFile), targetFile).replace(/\\/g, '/')
  if (!source.startsWith('.')) source = './' + source
  return source
}

function collectImportedStaticFunctionComponents(
  ast: File,
  importerPath: string,
  resolveImportPath: (importer: string, source: string) => string | null,
  ctx: ReturnType<typeof createEmitContext>,
  importedFns: ImportedStaticFunction[],
): boolean {
  for (const stmt of ast.program.body) {
    if (!t.isImportDeclaration(stmt)) continue
    if (stmt.source.value === '@geajs/core') continue
    if (isTypeOnlyImport(stmt)) continue
    if (!stmt.source.value.startsWith('.') || stmt.specifiers.length === 0) continue
    const componentSpecs = stmt.specifiers.filter(
      (spec) => !specifierIsTypeOnly(spec) && isComponentName(spec.local.name),
    )
    if (componentSpecs.length === 0) continue
    const resolved = resolveImportPath(importerPath, stmt.source.value)
    if (!resolved) return false
    const imported = readImportModule(resolved)
    if (!imported) return false
    for (const spec of componentSpecs) {
      const localName = spec.local.name
      const exportedName = getImportedExportName(spec)
      if (!exportedName) return false
      const fnDecl = getExportedFunction(imported.ast, exportedName, localName)
      if (fnDecl) {
        const params = getDirectFnParams(fnDecl)
        if (!params || !functionReturnsJsx(fnDecl)) {
          ctx.directFactoryComponents?.add(localName)
          continue
        }
        if (!hasNoTopLevelSideEffects(imported.ast) || !importedDirectFunctionUsesAreSafe(ast, new Set([localName]))) {
          ctx.directFactoryComponents?.add(localName)
          continue
        }
        const moduleBindings = collectImportedModuleBindings(imported.ast, fnDecl)
        if (nodeContainsAnyIdentifier(fnDecl.body, moduleBindings)) {
          ctx.directFactoryComponents?.add(localName)
          continue
        }
        ctx.directFnComponents?.add(localName)
        ctx.directFnComponentParams?.set(localName, params)
        importedFns.push({ localName, fnDecl, params })
        continue
      }

      const classDecl = getExportedClass(imported.ast, exportedName)
      if (classDecl && findTemplateMethod(classDecl)) {
        ctx.directClassComponents?.add(localName)
        continue
      }

      return false
    }
  }
  return true
}

function readImportModule(componentPath: string): { ast: File } | null {
  let source: string
  try {
    source = readFileSync(componentPath, 'utf8')
  } catch {
    return null
  }
  let ast: File
  try {
    ast = parse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'classProperties', 'classPrivateProperties', 'classPrivateMethods'],
    })
  } catch {
    return null
  }
  return { ast }
}

function compileImportedStaticFunction(
  imported: ImportedStaticFunction,
  ctx: ReturnType<typeof createEmitContext>,
): { factoryName?: string; fnDecl?: Statement } | null {
  const rewritten = t.cloneNode(imported.fnDecl, true) as FunctionDeclaration
  rewritten.id = t.identifier(imported.localName)
  ctx.directFnComponents?.add(imported.localName)
  ctx.directFnComponentParams?.set(imported.localName, imported.params)
  rewriteFnComponent(rewritten, ctx)
  if (nodeContainsIdentifier(rewritten.body, 'd') && !disposerUseIsOnlyEventDelegation(rewritten.body)) return null
  const factoryName = getZeroArgFactoryAlias(rewritten)
  if (factoryName) return { factoryName }
  return { fnDecl: rewritten }
}

function disposerUseIsOnlyEventDelegation(node: any): boolean {
  let ok = true
  const visit = (current: any, parent: any): void => {
    if (!ok || !current || typeof current !== 'object') return
    if (Array.isArray(current)) {
      for (const child of current) visit(child, parent)
      return
    }
    if (t.isIdentifier(current, { name: 'd' })) {
      if (
        !t.isCallExpression(parent) ||
        !t.isIdentifier(parent.callee) ||
        !isEventDelegationHelper(parent.callee.name) ||
        parent.arguments[parent.arguments.length - 1] !== current
      ) {
        ok = false
      }
      return
    }
    for (const key of Object.keys(current)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
      visit(current[key], current)
    }
  }
  visit(node, null)
  return ok
}

function isEventDelegationHelper(name: string): boolean {
  return name === 'delegateClick' || name === 'delegateEventFast' || name === 'delegateEvent'
}

function getDirectFnParams(fnDecl: FunctionDeclaration): DirectFnComponentParams | null {
  const first = fnDecl.params[0]
  if (!first) return { props: [], locals: [] }
  if (!t.isObjectPattern(first)) return null
  const props: string[] = []
  const locals: string[] = []
  for (const prop of first.properties) {
    if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key) || !t.isIdentifier(prop.value)) return null
    props.push(prop.key.name)
    locals.push(prop.value.name)
  }
  return { props, locals }
}

function functionReturnsJsx(fnDecl: FunctionDeclaration): boolean {
  for (const stmt of fnDecl.body.body) {
    if (!t.isReturnStatement(stmt) || !stmt.argument) continue
    if (t.isJSXElement(stmt.argument) || t.isJSXFragment(stmt.argument)) return true
  }
  return false
}

function hasNoTopLevelSideEffects(ast: File): boolean {
  for (const stmt of ast.program.body) {
    if (t.isImportDeclaration(stmt)) {
      if (!isTypeOnlyImport(stmt)) return false
      continue
    }
    if (t.isFunctionDeclaration(stmt)) continue
    if (t.isVariableDeclaration(stmt)) {
      if (!isPureVariableDeclaration(stmt)) return false
      continue
    }
    if (t.isExportNamedDeclaration(stmt)) {
      if (stmt.source) return false
      if (!stmt.declaration) continue
      if (t.isFunctionDeclaration(stmt.declaration)) continue
      if (t.isVariableDeclaration(stmt.declaration) && isPureVariableDeclaration(stmt.declaration)) continue
      if (isTypeDeclaration(stmt.declaration)) continue
      return false
    }
    if (t.isExportDefaultDeclaration(stmt)) {
      if (t.isFunctionDeclaration(stmt.declaration) || t.isIdentifier(stmt.declaration)) continue
      return false
    }
    if (isTypeDeclaration(stmt)) continue
    return false
  }
  return true
}

function collectRootModuleBindings(
  ast: File,
  classDecl: ClassDeclaration,
  directFnComponents?: Set<string>,
): Set<string> {
  const blocked = new Set<string>()
  for (const stmt of ast.program.body) {
    if (t.isVariableDeclaration(stmt)) {
      for (const decl of stmt.declarations) if (t.isIdentifier(decl.id)) blocked.add(decl.id.name)
    } else if (t.isFunctionDeclaration(stmt) && stmt.id && !directFnComponents?.has(stmt.id.name)) {
      blocked.add(stmt.id.name)
    } else if (t.isClassDeclaration(stmt) && stmt !== classDecl && stmt.id) {
      blocked.add(stmt.id.name)
    } else if (t.isExportNamedDeclaration(stmt) && stmt.declaration) {
      if (t.isVariableDeclaration(stmt.declaration)) {
        for (const decl of stmt.declaration.declarations) if (t.isIdentifier(decl.id)) blocked.add(decl.id.name)
      } else if (t.isFunctionDeclaration(stmt.declaration) && stmt.declaration.id) {
        if (!directFnComponents?.has(stmt.declaration.id.name)) blocked.add(stmt.declaration.id.name)
      } else if (t.isClassDeclaration(stmt.declaration) && stmt.declaration !== classDecl && stmt.declaration.id) {
        blocked.add(stmt.declaration.id.name)
      }
    }
  }
  if (classDecl.id) blocked.delete(classDecl.id.name)
  for (const name of directFnComponents ?? []) blocked.delete(name)
  return blocked
}

function collectImportedModuleBindings(ast: File, fnDecl: FunctionDeclaration): Set<string> {
  const blocked = new Set<string>()
  for (const stmt of ast.program.body) {
    if (t.isVariableDeclaration(stmt)) {
      for (const decl of stmt.declarations) if (t.isIdentifier(decl.id)) blocked.add(decl.id.name)
    } else if (t.isFunctionDeclaration(stmt) && stmt !== fnDecl && stmt.id) {
      blocked.add(stmt.id.name)
    } else if (t.isExportNamedDeclaration(stmt) && stmt.declaration) {
      if (t.isVariableDeclaration(stmt.declaration)) {
        for (const decl of stmt.declaration.declarations) if (t.isIdentifier(decl.id)) blocked.add(decl.id.name)
      } else if (t.isFunctionDeclaration(stmt.declaration) && stmt.declaration !== fnDecl && stmt.declaration.id) {
        blocked.add(stmt.declaration.id.name)
      }
    }
  }
  if (fnDecl.id) blocked.delete(fnDecl.id.name)
  for (const paramName of collectParamNames(fnDecl)) blocked.delete(paramName)
  return blocked
}

function collectParamNames(fnDecl: FunctionDeclaration): Set<string> {
  const names = new Set<string>()
  for (const param of fnDecl.params) {
    if (t.isIdentifier(param)) names.add(param.name)
    else if (t.isObjectPattern(param)) {
      for (const prop of param.properties) {
        if (t.isObjectProperty(prop) && t.isIdentifier(prop.value)) names.add(prop.value.name)
      }
    }
  }
  return names
}

function importedDirectFunctionUsesAreSafe(ast: File, names: Set<string>): boolean {
  const counts = new Map<string, number>()
  let safe = true
  const visit = (node: any): void => {
    if (!safe || !node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (t.isJSXElement(node)) {
      const name = node.openingElement.name
      if (t.isJSXIdentifier(name) && names.has(name.name)) {
        counts.set(name.name, (counts.get(name.name) ?? 0) + 1)
        if (!isSafeDirectFnUse(node)) {
          safe = false
          return
        }
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
      visit(node[key])
    }
  }
  visit(ast.program)
  if (!safe) return false
  for (const name of names) if ((counts.get(name) ?? 0) === 0) return false
  return true
}

function isSafeDirectFnUse(node: any): boolean {
  const meaningfulChildren = (node.children ?? []).filter(
    (child: any) => !(t.isJSXText(child) && child.value.trim() === ''),
  )
  if (meaningfulChildren.length > 0) {
    const staticChildren = getStaticTextChildren(meaningfulChildren)
    if (staticChildren == null) return false
    const hasChildrenAttr = (node.openingElement.attributes ?? []).some(
      (attr: any) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: 'children' }),
    )
    if (hasChildrenAttr) return false
    let target = node.openingElement.attributes.find((attr: any) => t.isJSXAttribute(attr))
    if (!target) {
      target = t.jsxAttribute(t.jsxIdentifier('children'), t.stringLiteral(staticChildren))
      node.openingElement.attributes.push(target)
    }
    ;(target as any).extra ??= {}
    ;(target as any).extra.geaStaticChildren = staticChildren
  }
  for (const attr of node.openingElement.attributes ?? []) {
    if (!t.isJSXAttribute(attr)) return false
    if (!attr.value || t.isStringLiteral(attr.value)) continue
    if (!t.isJSXExpressionContainer(attr.value)) return false
    const expr = attr.value.expression
    if (t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr)) {
      if (referencesCurrentTarget(expr)) return false
      continue
    }
    if (t.isStringLiteral(expr) || t.isNumericLiteral(expr) || t.isBooleanLiteral(expr) || t.isNullLiteral(expr)) {
      continue
    }
    return false
  }
  return true
}

function getStaticTextChildren(children: any[]): string | null {
  let out = ''
  for (const child of children) {
    if (t.isJSXText(child)) {
      out += normalizeJsxTextChild(child.value)
      continue
    }
    if (
      t.isJSXExpressionContainer(child) &&
      !t.isJSXEmptyExpression(child.expression) &&
      t.isStringLiteral(child.expression)
    ) {
      out += child.expression.value
      continue
    }
    return null
  }
  return out
}

function normalizeJsxTextChild(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ')
}

function referencesCurrentTarget(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (t.isIdentifier(node, { name: 'currentTarget' })) return true
  if (t.isStringLiteral(node, { value: 'currentTarget' })) return true
  if (Array.isArray(node)) {
    for (const child of node) if (referencesCurrentTarget(child)) return true
    return false
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
    if (referencesCurrentTarget(node[key])) return true
  }
  return false
}

function hasNoRootModuleTopLevelSideEffects(ast: File, classDecl: ClassDeclaration): boolean {
  for (const stmt of ast.program.body) {
    if (t.isImportDeclaration(stmt)) continue
    if (t.isFunctionDeclaration(stmt)) continue
    if (t.isVariableDeclaration(stmt)) {
      if (!isPureVariableDeclaration(stmt)) return false
      continue
    }
    if (t.isClassDeclaration(stmt)) {
      if (!isSideEffectFreeClassDeclaration(stmt)) return false
      continue
    }
    if (t.isExportDefaultDeclaration(stmt)) {
      if (stmt.declaration === classDecl) continue
      if (
        t.isIdentifier(stmt.declaration) &&
        classDecl.id &&
        stmt.declaration.name === classDecl.id.name &&
        isSideEffectFreeClassDeclaration(classDecl)
      ) {
        continue
      }
      return false
    }
    if (t.isExportNamedDeclaration(stmt)) {
      if (stmt.source) return false
      if (!stmt.declaration) continue
      if (t.isFunctionDeclaration(stmt.declaration)) continue
      if (t.isVariableDeclaration(stmt.declaration) && isPureVariableDeclaration(stmt.declaration)) continue
      if (t.isClassDeclaration(stmt.declaration) && isSideEffectFreeClassDeclaration(stmt.declaration)) continue
      if (isTypeDeclaration(stmt.declaration)) continue
      return false
    }
    if (isTypeDeclaration(stmt)) continue
    return false
  }
  return true
}

function isSideEffectFreeClassDeclaration(stmt: ClassDeclaration): boolean {
  for (const member of stmt.body.body) {
    if (t.isStaticBlock(member)) return false
    if (member.static && (t.isClassProperty(member) || t.isClassPrivateProperty(member))) return false
  }
  return true
}

function isPureVariableDeclaration(stmt: any): boolean {
  if (!t.isVariableDeclaration(stmt) || stmt.kind !== 'const') return false
  return stmt.declarations.every((decl: any) => t.isIdentifier(decl.id) && (!decl.init || isPureExpression(decl.init)))
}

function isPureExpression(expr: any): boolean {
  if (
    t.isStringLiteral(expr) ||
    t.isNumericLiteral(expr) ||
    t.isBooleanLiteral(expr) ||
    t.isNullLiteral(expr) ||
    t.isBigIntLiteral(expr) ||
    t.isRegExpLiteral(expr)
  ) {
    return true
  }
  if (t.isIdentifier(expr)) return expr.name === 'undefined'
  if (t.isUnaryExpression(expr)) return isPureExpression(expr.argument)
  if (t.isBinaryExpression(expr) || t.isLogicalExpression(expr)) {
    return isPureExpression(expr.left) && isPureExpression(expr.right)
  }
  if (t.isConditionalExpression(expr)) {
    return isPureExpression(expr.test) && isPureExpression(expr.consequent) && isPureExpression(expr.alternate)
  }
  if (t.isTemplateLiteral(expr)) return expr.expressions.every(isPureExpression)
  if (t.isArrayExpression(expr)) return expr.elements.every((el: any) => !el || isPureExpression(el))
  if (t.isObjectExpression(expr)) {
    return expr.properties.every((prop: any) => {
      if (t.isSpreadElement(prop)) return false
      if (!t.isObjectProperty(prop) || prop.computed || prop.method) return false
      return isPureExpression(prop.value)
    })
  }
  return false
}

function isTypeOnlyImport(stmt: ImportDeclaration): boolean {
  if ((stmt as any).importKind === 'type') return true
  return stmt.specifiers.length > 0 && stmt.specifiers.every(specifierIsTypeOnly)
}

function specifierIsTypeOnly(spec: any): boolean {
  return spec.importKind === 'type' || spec.importKind === 'typeof'
}

function isTypeDeclaration(stmt: any): boolean {
  return t.isTSTypeAliasDeclaration(stmt) || t.isTSInterfaceDeclaration(stmt) || t.isTSDeclareFunction(stmt)
}

function isComponentName(name: string): boolean {
  return !!name && name[0] === name[0].toUpperCase()
}

function getImportedExportName(spec: any): string | null {
  if (t.isImportDefaultSpecifier(spec)) return 'default'
  if (t.isImportSpecifier(spec)) {
    if (t.isIdentifier(spec.imported)) return spec.imported.name
    if (t.isStringLiteral(spec.imported)) return spec.imported.value
  }
  return null
}

function getExportedFunction(ast: File, exportedName: string, _localName: string): FunctionDeclaration | null {
  const named = collectNamedFunctions(ast)
  if (exportedName === 'default') {
    for (const stmt of ast.program.body) {
      if (t.isExportDefaultDeclaration(stmt)) {
        const decl = stmt.declaration
        if (t.isFunctionDeclaration(decl)) return decl
        if (t.isIdentifier(decl)) return named.get(decl.name) ?? null
      } else if (t.isExportNamedDeclaration(stmt)) {
        for (const spec of stmt.specifiers) {
          if (!t.isExportSpecifier(spec)) continue
          const exported = t.isIdentifier(spec.exported) ? spec.exported.name : spec.exported.value
          if (exported !== 'default') continue
          const local = t.isIdentifier(spec.local) ? spec.local.name : spec.local.value
          return named.get(local) ?? null
        }
      }
    }
    return null
  }

  for (const stmt of ast.program.body) {
    if (!t.isExportNamedDeclaration(stmt)) continue
    if (t.isFunctionDeclaration(stmt.declaration) && stmt.declaration.id?.name === exportedName) {
      return stmt.declaration
    }
    for (const spec of stmt.specifiers) {
      if (!t.isExportSpecifier(spec)) continue
      const exported = t.isIdentifier(spec.exported) ? spec.exported.name : spec.exported.value
      if (exported !== exportedName) continue
      const local = t.isIdentifier(spec.local) ? spec.local.name : spec.local.value
      return named.get(local) ?? null
    }
  }
  return null
}

function getExportedClass(ast: File, exportedName: string): ClassDeclaration | null {
  const named = collectNamedClasses(ast)
  if (exportedName === 'default') {
    for (const stmt of ast.program.body) {
      if (t.isExportDefaultDeclaration(stmt)) {
        const decl = stmt.declaration
        if (t.isClassDeclaration(decl)) return decl
        if (t.isIdentifier(decl)) return named.get(decl.name) ?? null
      } else if (t.isExportNamedDeclaration(stmt)) {
        for (const spec of stmt.specifiers) {
          if (!t.isExportSpecifier(spec)) continue
          const exported = t.isIdentifier(spec.exported) ? spec.exported.name : spec.exported.value
          if (exported !== 'default') continue
          const local = t.isIdentifier(spec.local) ? spec.local.name : spec.local.value
          return named.get(local) ?? null
        }
      }
    }
    return null
  }

  for (const stmt of ast.program.body) {
    if (!t.isExportNamedDeclaration(stmt)) continue
    if (t.isClassDeclaration(stmt.declaration) && stmt.declaration.id?.name === exportedName) {
      return stmt.declaration
    }
    for (const spec of stmt.specifiers) {
      if (!t.isExportSpecifier(spec)) continue
      const exported = t.isIdentifier(spec.exported) ? spec.exported.name : spec.exported.value
      if (exported !== exportedName) continue
      const local = t.isIdentifier(spec.local) ? spec.local.name : spec.local.value
      return named.get(local) ?? null
    }
  }
  return null
}

function collectNamedFunctions(ast: File): Map<string, FunctionDeclaration> {
  const named = new Map<string, FunctionDeclaration>()
  for (const stmt of ast.program.body) {
    if (t.isFunctionDeclaration(stmt) && stmt.id) named.set(stmt.id.name, stmt)
    else if (t.isExportNamedDeclaration(stmt) && t.isFunctionDeclaration(stmt.declaration) && stmt.declaration.id) {
      named.set(stmt.declaration.id.name, stmt.declaration)
    }
  }
  return named
}

function collectNamedClasses(ast: File): Map<string, ClassDeclaration> {
  const named = new Map<string, ClassDeclaration>()
  for (const stmt of ast.program.body) {
    if (t.isClassDeclaration(stmt) && stmt.id) named.set(stmt.id.name, stmt)
    else if (t.isExportNamedDeclaration(stmt) && t.isClassDeclaration(stmt.declaration) && stmt.declaration.id) {
      named.set(stmt.declaration.id.name, stmt.declaration)
    }
  }
  return named
}

function getZeroArgFactoryAlias(fnDecl: any): string | null {
  if (!t.isFunctionDeclaration(fnDecl) || fnDecl.params.length !== 0 || !fnDecl.id) return null
  const body = fnDecl.body?.body
  if (!Array.isArray(body) || body.length !== 2) return null
  const [first, second] = body
  if (!t.isVariableDeclaration(first) || first.declarations.length !== 1) return null
  const decl = first.declarations[0]
  if (!t.isIdentifier(decl.id, { name: 'root' })) return null
  if (!t.isCallExpression(decl.init) || !t.isIdentifier(decl.init.callee) || decl.init.arguments.length !== 0) {
    return null
  }
  if (!t.isReturnStatement(second) || !t.isIdentifier(second.argument, { name: 'root' })) return null
  return decl.init.callee.name
}

function findDefaultClassDeclaration(ast: File): ClassDeclaration | null {
  for (const stmt of ast.program.body) {
    if (t.isExportDefaultDeclaration(stmt)) {
      const decl = stmt.declaration
      if (t.isClassDeclaration(decl)) return decl
      if (t.isIdentifier(decl)) {
        for (const candidate of ast.program.body) {
          if (t.isClassDeclaration(candidate) && candidate.id?.name === decl.name) return candidate
        }
      }
    }
  }
  return null
}

function isBuiltinElementRoot(node: unknown): boolean {
  if (!t.isJSXElement(node)) return false
  const name = node.openingElement.name
  if (!t.isJSXIdentifier(name)) return false
  const first = name.name[0]
  return !!first && first === first.toLowerCase()
}

function createAppendStatement(parent: Expression, factory: StaticTemplateFactory): Statement {
  return t.expressionStatement(
    t.callExpression(t.memberExpression(parent, t.identifier('appendChild')), [factory.mountExpression]),
  )
}

function removeDefaultImport(ast: File, localName: string): void {
  ast.program.body = ast.program.body.filter((stmt) => {
    if (!t.isImportDeclaration(stmt)) return true
    if (stmt.specifiers.length === 0) return true
    stmt.specifiers = stmt.specifiers.filter(
      (spec) => !t.isImportDefaultSpecifier(spec) || spec.local.name !== localName,
    )
    return stmt.specifiers.length > 0
  })
}

function insertDeclarationsAfterImports(ast: File, declarations: Statement[]): void {
  let index = 0
  while (index < ast.program.body.length && t.isImportDeclaration(ast.program.body[index])) index++
  ast.program.body.splice(index, 0, ...declarations)
}

function countIdentifier(ast: File, name: string): number {
  let count = 0
  traverse(ast, {
    noScope: true,
    Identifier(path) {
      if (path.node.name === name) count++
    },
  })
  return count
}

function countIdentifierInStatements(statements: Statement[], name: string): number {
  const ast = t.file(t.program(statements.map((stmt) => t.cloneNode(stmt, true) as Statement)))
  return countIdentifier(ast, name)
}

function nodeContainsIdentifier(node: unknown, name: string): boolean {
  if (!node || typeof node !== 'object') return false
  if (t.isIdentifier(node, { name })) return true
  if (Array.isArray(node)) {
    for (const child of node) if (nodeContainsIdentifier(child, name)) return true
    return false
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
    if (nodeContainsIdentifier((node as Record<string, unknown>)[key], name)) return true
  }
  return false
}

function nodeContainsAnyIdentifier(node: unknown, names: Set<string>): boolean {
  if (names.size === 0 || !node || typeof node !== 'object') return false
  if (t.isIdentifier(node) && names.has(node.name)) return true
  if (Array.isArray(node)) {
    for (const child of node) if (nodeContainsAnyIdentifier(child, names)) return true
    return false
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
    if (nodeContainsAnyIdentifier((node as Record<string, unknown>)[key], names)) return true
  }
  return false
}
