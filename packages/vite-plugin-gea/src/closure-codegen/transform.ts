/**
 * transform — file-level transformer.
 */

import { parse } from '@babel/parser'
import type { ClassDeclaration, File } from '@babel/types'

import { generate, t } from '../utils/babel-interop.ts'

import type { DirectFnComponentParams } from './emit.ts'
import { buildCreateTemplateMethod, createEmitContext, lowerJsxInStatement } from './emit.ts'
import { extractTemplateJsx, findTemplateMethod } from './generator.ts'
import {
  componentIrId,
  sourceSpan,
  type GeaIrComponent,
  type GeaIrModule,
  type GeaIrRuntimeBase,
} from './ir.ts'
import {
  bodyContainsJsx,
  canSkipComponentStoreProxy,
  canUseLeanReactiveComponent,
  canUseStaticCompiledComponent,
  canUseTinyReactiveComponent,
  extendsComponent,
  isFunctionComponent,
  rewriteFnComponent,
} from './transform/transform-components.ts'
import { ensureCoreImports, injectTemplateDecls } from './transform/transform-imports.ts'
import { extractPrecedingStatements, foldEarlyReturnGuards } from './transform/transform-template-methods.ts'

export interface TransformResult {
  code: string
  map?: any
  /** true if any component class was rewritten */
  changed: boolean
  /** names of Component subclasses that were rewritten (diagnostics) */
  rewritten: string[]
  /** used compiler-runtime helper names (for diagnostics) */
  importsNeeded: string[]
  /** gea compiler IR for rewritten components in this module */
  ir?: {
    module: GeaIrModule
    components: GeaIrComponent[]
  }
}

export interface TransformFileOptions {
  directClassComponents?: Set<string>
  directFactoryComponents?: Set<string>
  enableTinyReactiveComponents?: boolean
}

export function transformFile(source: string, _filename?: string, options: TransformFileOptions = {}): TransformResult {
  // Skip quickly if not JSX-bearing
  if (!source.includes('<') || !source.includes('>')) {
    return { code: source, changed: false, rewritten: [], importsNeeded: [] }
  }

  let ast: File
  try {
    ast = parse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'classProperties', 'classPrivateProperties', 'classPrivateMethods'],
      errorRecovery: false,
    })
  } catch {
    return { code: source, changed: false, rewritten: [], importsNeeded: [] }
  }

  const ctx = createEmitContext()
  ctx.irTemplates = []
  ctx.directFnComponents = collectDirectFnComponents(ast)
  ctx.directFnComponentParams = collectDirectFnComponentParams(ast, ctx.directFnComponents)
  ctx.directFnStringProps = collectDirectFnStringProps(ast, ctx.directFnComponents)
  ctx.directFnNoDisposer = new Set()
  ctx.directClassComponents = collectLocalClassComponents(ast)
  for (const name of options.directClassComponents ?? []) ctx.directClassComponents.add(name)
  ctx.directFactoryComponents = new Set(options.directFactoryComponents)
  const rewritten: string[] = []
  let firstClassIdx = -1

  // Walk top-level declarations for components (class + function).
  for (let i = 0; i < ast.program.body.length; i++) {
    const node = ast.program.body[i]
    let classDecl: ClassDeclaration | null = null
    let fnDecl: any = null
    if (t.isClassDeclaration(node)) classDecl = node
    else if (t.isFunctionDeclaration(node)) fnDecl = node
    else if (t.isExportDefaultDeclaration(node)) {
      if (t.isClassDeclaration(node.declaration)) classDecl = node.declaration
      else if (t.isFunctionDeclaration(node.declaration)) fnDecl = node.declaration
    } else if (t.isExportNamedDeclaration(node)) {
      if (t.isClassDeclaration(node.declaration)) classDecl = node.declaration
      else if (t.isFunctionDeclaration(node.declaration)) fnDecl = node.declaration
    }

    if (classDecl) {
      if (firstClassIdx < 0) firstClassIdx = i
      // Collect `get`-accessor names from the class — expressionToPathOrGetter
      // forces getter-form for `this.X` when X is a derived getter.
      ctx.classGetters.clear()
      for (const m of classDecl.body.body) {
        if (t.isClassMethod(m) && m.kind === 'get' && t.isIdentifier(m.key) && !m.computed && !m.static) {
          ctx.classGetters.add(m.key.name)
        }
      }
      // Any method whose body contains JSX is a template the compiler must
      // lower. The canonical `template()` is one of them; any sibling method
      // (e.g. gea-mobile's `template_items`, `template_views`) is compiled too.
      const templateMethod = findTemplateMethod(classDecl)
      if (templateMethod) foldEarlyReturnGuards(templateMethod)
      const methodsWithJsx: any[] = []
      for (const m of classDecl.body.body) {
        if (!t.isClassMethod(m) || m.computed || m.static) continue
        if (m === templateMethod) continue
        if (bodyContainsJsx(m.body)) methodsWithJsx.push(m)
      }
      if (!templateMethod && methodsWithJsx.length === 0) continue
      if (templateMethod && !extendsComponent(classDecl)) continue
      const jsx = templateMethod ? extractTemplateJsx(templateMethod) : null
      if (templateMethod && !jsx) continue
      const useStaticCompiledComponent = canUseStaticCompiledComponent(classDecl)
      const useCompiledComponent = !useStaticCompiledComponent && canSkipComponentStoreProxy(classDecl)
      const useTinyReactiveComponent =
        options.enableTinyReactiveComponents !== false &&
        !useStaticCompiledComponent &&
        !useCompiledComponent &&
        canUseTinyReactiveComponent(classDecl)
      const useLeanReactiveComponent =
        !useStaticCompiledComponent &&
        !useCompiledComponent &&
        !useTinyReactiveComponent &&
        canUseLeanReactiveComponent(classDecl)
      const hasAfterRenderAsyncHook = hasOwnInstanceMethod(classDecl, 'onAfterRenderAsync')
      const className = (classDecl.id && classDecl.id.name) || '<anonymous>'
      const runtimeBase = runtimeBaseForComponent({
        useStaticCompiledComponent,
        useCompiledComponent,
        useTinyReactiveComponent,
        useLeanReactiveComponent,
      })

      // Lower JSX in every non-template method body that contains JSX.
      // This runs regardless of whether the class has a `template()` method.
      ctx.currentIrComponent = className
      ctx.currentIrRuntimeBase = runtimeBase
      for (const m of methodsWithJsx) {
        m.body.body = m.body.body.map((s: any) => lowerJsxInStatement(s, ctx))
      }

      if (!templateMethod) {
        rewritten.push(className)
        ctx.currentIrComponent = undefined
        ctx.currentIrRuntimeBase = undefined
        continue
      }

      // `template({ count, user })` param destructure → bindings to this.props.<name>
      const paramBindings: string[] = []
      if (templateMethod.params.length >= 1 && t.isObjectPattern(templateMethod.params[0])) {
        for (const prop of (templateMethod.params[0] as any).properties) {
          if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue
          const local = t.isIdentifier(prop.value) ? prop.value.name : prop.key.name
          ctx.bindings.set(
            local,
            t.memberExpression(
              t.memberExpression(t.thisExpression(), t.identifier('props')),
              t.identifier(prop.key.name),
            ),
          )
          paramBindings.push(local)
        }
      }
      // `template(props)` plain parameter → bind `props` → this.props
      let plainPropsParamName: string | null = null
      if (templateMethod.params.length >= 1 && t.isIdentifier(templateMethod.params[0])) {
        plainPropsParamName = templateMethod.params[0].name
        ctx.bindings.set(plainPropsParamName, t.memberExpression(t.thisExpression(), t.identifier('props')))
      }

      const preceding = extractPrecedingStatements(templateMethod)
      const templateSymbol = useStaticCompiledComponent ? 'GEA_STATIC_TEMPLATE' : 'GEA_CREATE_TEMPLATE'
      ctx.importsNeeded.add(templateSymbol)
      const method = buildCreateTemplateMethod(jsx, ctx, preceding, templateSymbol)
      const useStaticElementComponent =
        useStaticCompiledComponent && isStaticBuiltinElementRoot(jsx) && !nodeContainsIdentifier(method.body, 'd')
      if (useStaticElementComponent && ctx.irTemplates) {
        for (const template of ctx.irTemplates) {
          if (template.component === className) template.runtimeBase = 'static-element'
        }
      }
      if (useStaticElementComponent) method.params = []
      if (plainPropsParamName) ctx.bindings.delete(plainPropsParamName)
      // Clear per-template bindings so they don't leak to the next class
      for (const k of paramBindings) ctx.bindings.delete(k)

      const bodyItems = classDecl.body.body
      const templateIdx = bodyItems.indexOf(templateMethod)
      if (templateIdx >= 0) bodyItems[templateIdx] = method
      let usesCompiledRuntimeBase = false
      if (useStaticElementComponent) {
        ctx.importsNeeded.add('CompiledStaticElementComponent')
        classDecl.superClass = t.identifier('CompiledStaticElementComponent')
        usesCompiledRuntimeBase = true
      } else if (useStaticCompiledComponent) {
        ctx.importsNeeded.add('CompiledStaticComponent')
        classDecl.superClass = t.identifier('CompiledStaticComponent')
        usesCompiledRuntimeBase = true
      } else if (useCompiledComponent) {
        ctx.importsNeeded.add('CompiledComponent')
        classDecl.superClass = t.identifier('CompiledComponent')
        usesCompiledRuntimeBase = true
      } else if (useTinyReactiveComponent) {
        ctx.importsNeeded.add('CompiledTinyReactiveComponent')
        classDecl.superClass = t.identifier('CompiledTinyReactiveComponent')
        usesCompiledRuntimeBase = true
      } else if (useLeanReactiveComponent) {
        ctx.importsNeeded.add('CompiledLeanReactiveComponent')
        classDecl.superClass = t.identifier('CompiledLeanReactiveComponent')
        usesCompiledRuntimeBase = true
      } else if (t.isIdentifier(classDecl.superClass, { name: 'Component' })) {
        ctx.importsNeeded.add('CompiledReactiveComponent')
        classDecl.superClass = t.identifier('CompiledReactiveComponent')
        usesCompiledRuntimeBase = true
      }
      if (usesCompiledRuntimeBase && hasAfterRenderAsyncHook && !hasOwnInstanceMethod(classDecl, 'render')) {
        ctx.importsNeeded.add('scheduleAfterRenderAsync')
        classDecl.body.body.push(buildAfterRenderAsyncRenderMethod())
      }
      rewritten.push(className)
      ctx.currentIrComponent = undefined
      ctx.currentIrRuntimeBase = undefined
      continue
    }

    if (fnDecl && isFunctionComponent(fnDecl)) {
      if (firstClassIdx < 0) firstClassIdx = i
      rewriteFnComponent(fnDecl, ctx)
      rewritten.push((fnDecl.id && fnDecl.id.name) || '<anonymous>')
    }
  }

  if (rewritten.length === 0) {
    return { code: source, changed: false, rewritten: [], importsNeeded: [] }
  }

  // Inject template decls + ensure public core and private compiler-runtime imports
  injectTemplateDecls(ast, firstClassIdx, ctx.templateDecls)
  ensureCoreImports(ast, ctx.importsNeeded)

  const out = generate(ast, { retainLines: false, compact: false, jsescOption: { minimal: true } })
  return {
    code: out.code,
    map: (out as any).map,
    changed: true,
    rewritten,
    importsNeeded: Array.from(ctx.importsNeeded),
    ir: buildModuleIr(_filename ?? '<unknown>', rewritten, ctx.irTemplates ?? [], ast),
  }
}

function runtimeBaseForComponent(options: {
  useStaticCompiledComponent: boolean
  useCompiledComponent: boolean
  useTinyReactiveComponent: boolean
  useLeanReactiveComponent: boolean
}): GeaIrRuntimeBase {
  if (options.useStaticCompiledComponent) return 'static'
  if (options.useCompiledComponent) return 'compiled'
  if (options.useTinyReactiveComponent) return 'tiny-reactive'
  if (options.useLeanReactiveComponent) return 'lean-reactive'
  return 'reactive'
}

function buildModuleIr(
  moduleId: string,
  rewritten: string[],
  templates: NonNullable<ReturnType<typeof createEmitContext>['irTemplates']>,
  ast: File,
): { module: GeaIrModule; components: GeaIrComponent[] } {
  const components: GeaIrComponent[] = []
  for (const name of rewritten) {
    const record = templates.find((template) => template.component === name)
    if (!record) continue
    const declaration = findClassDeclarationByName(ast, name)
    components.push({
      id: componentIrId(moduleId, name),
      module: moduleId,
      exportName: name,
      runtimeBase: record.runtimeBase,
      template: record.template,
      ...(declaration ? { sourceSpan: sourceSpan(declaration) } : {}),
    })
  }
  return {
    module: {
      id: moduleId,
      file: moduleId,
      components: components.map((component) => component.id),
      stores: [],
    },
    components,
  }
}

function findClassDeclarationByName(ast: File, name: string): ClassDeclaration | null {
  for (const node of ast.program.body) {
    if (t.isClassDeclaration(node) && node.id?.name === name) return node
    if (t.isExportDefaultDeclaration(node) && t.isClassDeclaration(node.declaration) && node.declaration.id?.name === name) {
      return node.declaration
    }
    if (t.isExportNamedDeclaration(node) && t.isClassDeclaration(node.declaration) && node.declaration.id?.name === name) {
      return node.declaration
    }
  }
  return null
}

function collectLocalClassComponents(ast: File): Set<string> {
  const names = new Set<string>()
  for (const node of ast.program.body) {
    let classDecl: ClassDeclaration | null = null
    if (t.isClassDeclaration(node)) classDecl = node
    else if (t.isExportDefaultDeclaration(node) && t.isClassDeclaration(node.declaration)) classDecl = node.declaration
    else if (t.isExportNamedDeclaration(node) && t.isClassDeclaration(node.declaration)) classDecl = node.declaration
    if (!classDecl || !classDecl.id || !extendsComponent(classDecl)) continue
    names.add(classDecl.id.name)
  }
  return names
}

function isStaticBuiltinElementRoot(jsx: any): boolean {
  if (!t.isJSXElement(jsx)) return false
  const name = jsx.openingElement.name
  if (!t.isJSXIdentifier(name)) return false
  const first = name.name[0]
  return !!first && first === first.toLowerCase()
}

function nodeContainsIdentifier(node: any, name: string): boolean {
  if (!node || typeof node !== 'object') return false
  if (t.isIdentifier(node, { name })) return true
  if (Array.isArray(node)) {
    for (const child of node) if (nodeContainsIdentifier(child, name)) return true
    return false
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
    if (nodeContainsIdentifier(node[key], name)) return true
  }
  return false
}

function hasOwnInstanceMethod(classDecl: ClassDeclaration, name: string): boolean {
  for (const member of classDecl.body.body) {
    if (!t.isClassMethod(member) || member.static || member.computed) continue
    if (t.isIdentifier(member.key, { name })) return true
  }
  return false
}

function buildAfterRenderAsyncRenderMethod(): any {
  const parent = t.identifier('parent')
  const index = t.identifier('_index')
  return t.classMethod(
    'method',
    t.identifier('render'),
    [parent, index],
    t.blockStatement([
      t.expressionStatement(
        t.callExpression(t.memberExpression(t.super(), t.identifier('render')), [
          t.identifier('parent'),
          t.identifier('_index'),
        ]),
      ),
      t.expressionStatement(t.callExpression(t.identifier('scheduleAfterRenderAsync'), [t.thisExpression()])),
    ]),
  )
}

export function collectDirectFnComponents(ast: File): Set<string> {
  const candidates = new Set<string>()
  for (const node of ast.program.body) {
    if (t.isFunctionDeclaration(node) && node.id && isFunctionComponent(node)) candidates.add(node.id.name)
  }
  if (candidates.size === 0) return candidates

  const counts = new Map<string, number>()
  const disqualified = new Set<string>()
  const visit = (node: any): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (t.isJSXElement(node)) {
      const name = node.openingElement.name
      if (t.isJSXIdentifier(name) && candidates.has(name.name)) {
        counts.set(name.name, (counts.get(name.name) ?? 0) + 1)
        if (!isDirectFnUse(node)) disqualified.add(name.name)
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
      visit(node[key])
    }
  }
  visit(ast.program)

  for (const name of candidates) {
    if ((counts.get(name) ?? 0) === 0 || disqualified.has(name)) candidates.delete(name)
  }
  return candidates
}

export function collectDirectFnComponentParams(ast: File, names: Set<string>): Map<string, DirectFnComponentParams> {
  const params = new Map<string, DirectFnComponentParams>()
  if (names.size === 0) return params

  for (const node of ast.program.body) {
    if (!t.isFunctionDeclaration(node) || !node.id || !names.has(node.id.name)) continue
    const first = node.params[0]
    if (!first) {
      params.set(node.id.name, { props: [], locals: [] })
      continue
    }
    if (!t.isObjectPattern(first)) continue
    const props: string[] = []
    const locals: string[] = []
    let simple = true
    for (const prop of first.properties) {
      if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key) || !t.isIdentifier(prop.value)) {
        simple = false
        break
      }
      props.push(prop.key.name)
      locals.push(prop.value.name)
    }
    if (simple) params.set(node.id.name, { props, locals })
  }

  return params
}

export function collectDirectFnStringProps(ast: File, names: Set<string>): Map<string, Set<string>> {
  const useCounts = new Map<string, number>()
  const stringCounts = new Map<string, Map<string, number>>()
  const nonStringProps = new Map<string, Set<string>>()
  if (names.size === 0) return new Map()

  const visit = (node: any): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (t.isJSXElement(node)) {
      const name = node.openingElement.name
      if (t.isJSXIdentifier(name) && names.has(name.name)) {
        useCounts.set(name.name, (useCounts.get(name.name) ?? 0) + 1)
        for (const attr of node.openingElement.attributes ?? []) {
          if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue
          const propName = attr.name.name
          if (isStringAttrValue(attr.value)) {
            let counts = stringCounts.get(name.name)
            if (!counts) {
              counts = new Map()
              stringCounts.set(name.name, counts)
            }
            counts.set(propName, (counts.get(propName) ?? 0) + 1)
          } else {
            let props = nonStringProps.get(name.name)
            if (!props) {
              props = new Set()
              nonStringProps.set(name.name, props)
            }
            props.add(propName)
          }
        }
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
      visit(node[key])
    }
  }
  visit(ast.program)

  const result = new Map<string, Set<string>>()
  for (const [name, count] of useCounts) {
    const strings = stringCounts.get(name)
    if (!strings) continue
    const blocked = nonStringProps.get(name)
    const props = new Set<string>()
    for (const [propName, propCount] of strings) {
      if (propCount === count && !blocked?.has(propName)) props.add(propName)
    }
    if (props.size > 0) result.set(name, props)
  }
  return result
}

function isStringAttrValue(value: any): boolean {
  if (t.isStringLiteral(value)) return true
  if (!t.isJSXExpressionContainer(value)) return false
  return t.isStringLiteral(value.expression)
}

function isDirectFnUse(node: any): boolean {
  const meaningfulChildren = (node.children ?? []).filter(
    (child: any) => !(t.isJSXText(child) && child.value.trim() === ''),
  )
  if (meaningfulChildren.length > 0) return false
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
