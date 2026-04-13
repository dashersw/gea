import type { ClassDeclaration, Statement } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

import { collectBindings, compileJsxToBlock, createEmitContext, substituteBindings, type EmitContext } from '../emit.ts'
import { extractTemplateJsx, findTemplateMethod } from '../generator.ts'

export function extendsComponent(classDecl: ClassDeclaration): boolean {
  const sc = classDecl.superClass
  if (!sc) return false
  // Recognize the identifier `Component` directly (common case).
  if (t.isIdentifier(sc, { name: 'Component' })) return true
  // Any class with a `template()` method returning JSX is a gea component, regardless
  // of which intermediate base class it extends (e.g. ZagComponent in gea-ui).
  const templateMethod = findTemplateMethod(classDecl)
  if (!templateMethod) return false
  const jsx = extractTemplateJsx(templateMethod)
  return jsx != null
}

/** Recursive scan: does this Node tree contain any JSXElement or JSXFragment? */
export function bodyContainsJsx(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (t.isJSXElement(node) || t.isJSXFragment(node)) return true
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue
    const v = (node as any)[k]
    if (Array.isArray(v)) {
      for (const x of v) if (bodyContainsJsx(x)) return true
    } else if (v && typeof v === 'object') {
      if (bodyContainsJsx(v)) return true
    }
  }
  return false
}

export function canSkipComponentStoreProxy(classDecl: ClassDeclaration): boolean {
  if (!t.isIdentifier(classDecl.superClass, { name: 'Component' })) return false
  for (const member of classDecl.body.body as any[]) {
    if (member.static) continue
    if (t.isClassProperty(member) || t.isClassPrivateProperty(member)) return false
    if (t.isClassMethod(member) && member.kind === 'constructor') return false
    if (nodeContainsThis(member)) return false
  }
  return true
}

export function canUseStaticCompiledComponent(classDecl: ClassDeclaration): boolean {
  if (!t.isIdentifier(classDecl.superClass, { name: 'Component' })) return false
  for (const member of classDecl.body.body as any[]) {
    if (member.static) continue
    if (t.isClassProperty(member) || t.isClassPrivateProperty(member)) return false
    if (!t.isClassMethod(member)) return false
    if (member.kind !== 'method' || member.computed || member.key?.name !== 'template') return false
    if (member.params.length > 0) return false
    if (nodeContainsThis(member)) return false
  }
  return true
}

export function canUseLeanReactiveComponent(classDecl: ClassDeclaration): boolean {
  if (!t.isIdentifier(classDecl.superClass, { name: 'Component' })) return false
  for (const member of classDecl.body.body as any[]) {
    if (member.static) continue
    if (t.isClassPrivateMethod(member) || t.isClassPrivateProperty(member)) return false
    if (t.isClassProperty(member)) {
      if (member.computed || !t.isIdentifier(member.key)) return false
      if (nodeUsesUnsupportedArrayMutation(member.value)) return false
      continue
    }
    if (t.isClassMethod(member)) {
      if (member.kind === 'constructor' || member.kind === 'set') return false
      if (member.computed) return false
      if (nodeContainsSuper(member)) return false
      if (nodeUsesUnsupportedArrayMutation(member.body)) return false
      continue
    }
    return false
  }
  return true
}

export function canUseTinyReactiveComponent(classDecl: ClassDeclaration): boolean {
  if (!canUseLeanReactiveComponent(classDecl)) return false
  for (const member of classDecl.body.body as any[]) {
    if (t.isClassMethod(member) && t.isIdentifier(member.key)) {
      if (member.key.name === 'created' || member.key.name === 'onAfterRender') return false
    }
    if (nodeContainsThisMember(member, 'id')) return false
    if (nodeContainsThisMember(member, '$')) return false
    if (nodeContainsThisMember(member, '$$')) return false
    if (nodeContainsThisMember(member, 'children')) return false
  }
  return true
}

function nodeContainsThisMember(node: any, name: string): boolean {
  if (!node || typeof node !== 'object') return false
  if (
    t.isMemberExpression(node) &&
    !node.computed &&
    t.isThisExpression(node.object) &&
    t.isIdentifier(node.property, { name })
  ) {
    return true
  }
  if (Array.isArray(node)) {
    for (const child of node) if (nodeContainsThisMember(child, name)) return true
    return false
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
    if (nodeContainsThisMember(node[key], name)) return true
  }
  return false
}

function nodeContainsSuper(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (t.isSuper(node)) return true
  if (Array.isArray(node)) {
    for (const child of node) if (nodeContainsSuper(child)) return true
    return false
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
    if (nodeContainsSuper(node[key])) return true
  }
  return false
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

function nodeContainsThis(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (t.isThisExpression(node)) return true
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue
    const v = node[k]
    if (Array.isArray(v)) {
      for (const x of v) if (nodeContainsThis(x)) return true
    } else if (v && typeof v === 'object') {
      if (nodeContainsThis(v)) return true
    }
  }
  return false
}

function nodeContainsIdentifier(node: any, name: string): boolean {
  if (!node || typeof node !== 'object') return false
  if (t.isIdentifier(node, { name })) return true
  if (Array.isArray(node)) {
    for (const child of node) if (nodeContainsIdentifier(child, name)) return true
    return false
  }
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue
    if (nodeContainsIdentifier(node[k], name)) return true
  }
  return false
}

/** True if the function body returns a JSX expression (PascalCase name + JSX return). */
export function isFunctionComponent(fn: any): boolean {
  if (!fn.id || !t.isIdentifier(fn.id)) return false
  const name = fn.id.name
  if (!name || name[0] !== name[0].toUpperCase()) return false
  // Look for a return <JSX/> in the body
  if (!fn.body || !t.isBlockStatement(fn.body)) return false
  for (const stmt of fn.body.body) {
    if (t.isReturnStatement(stmt) && stmt.argument) {
      if (t.isJSXElement(stmt.argument) || t.isJSXFragment(stmt.argument)) return true
    }
  }
  return false
}

/**
 * Rewrite a function component body so it becomes a `(props, d) => Element`
 * usable by the new runtime's `mount()` (mount calls it with the disposer).
 *
 * Reactive helpers inside the fn body use `props` as the reactive root
 * (since there's no `this`). Uses a per-fn EmitContext with reactiveRoot=props,
 * then merges its templates + imports into the parent ctx.
 */
export function rewriteFnComponent(fnDecl: any, parentCtx: EmitContext): void {
  const body = fnDecl.body.body as Statement[]
  let returnIdx = -1
  for (let i = 0; i < body.length; i++) {
    if (t.isReturnStatement(body[i])) {
      returnIdx = i
      break
    }
  }
  if (returnIdx < 0) return
  const ret = body[returnIdx] as any
  if (!ret.argument || !(t.isJSXElement(ret.argument) || t.isJSXFragment(ret.argument))) return
  const jsxRoot = ret.argument

  const fnCtx = createEmitContext(t.identifier('props'))
  const fnName = t.isIdentifier(fnDecl.id) ? fnDecl.id.name : ''
  fnCtx.oneShotProps = parentCtx.directFnComponents?.has(fnName) === true
  const directParams = fnCtx.oneShotProps ? parentCtx.directFnComponentParams?.get(fnName) : undefined
  // Share the tpl/list counters with the parent so hoisted _tplN names don't collide
  fnCtx.tplCounter = parentCtx.tplCounter
  fnCtx.listCounter = parentCtx.listCounter
  fnCtx.directFnComponents = parentCtx.directFnComponents
  fnCtx.directFnComponentParams = parentCtx.directFnComponentParams
  fnCtx.directFnStringProps = parentCtx.directFnStringProps
  fnCtx.directFnNoDisposer = parentCtx.directFnNoDisposer
  if (fnCtx.oneShotProps) {
    fnCtx._inKeyedListRow = true
    fnCtx._rowEventTypes = new Set()
    fnCtx._rowFastEventTypes = new Set()
  }

  // PROPS DESTRUCTURING — the key fix for fn-component reactivity.
  // If the fn signature is `({ draft, onAdd })` we MUST NOT emit
  // `const { draft, onAdd } = props` because that captures the thunk
  // results once. Instead populate ctx.bindings so every identifier
  // reference in JSX expressions substitutes to `props.<name>` (which
  // hits the live thunk on each read).
  if (directParams) {
    fnDecl.params = directParams.locals.map((name) => t.identifier(name))
    fnCtx.oneShotPropLocals = new Set(directParams.locals)
    const stringProps = parentCtx.directFnStringProps?.get(fnName)
    if (stringProps) {
      fnCtx.oneShotStringPropLocals = new Set(
        directParams.locals.filter((local, index) => stringProps.has(directParams.props[index])),
      )
    }
  } else if (fnDecl.params.length >= 1 && t.isObjectPattern(fnDecl.params[0])) {
    const objPat = fnDecl.params[0] as any
    for (const prop of objPat.properties) {
      if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue
      const local = t.isIdentifier(prop.value) ? prop.value.name : prop.key.name
      fnCtx.bindings.set(local, t.memberExpression(t.identifier('props'), t.identifier(prop.key.name)))
    }
    fnDecl.params[0] = t.identifier('props')
  } else if (fnDecl.params.length === 0) {
    fnDecl.params.push(t.identifier('props'))
  } else if (!t.isIdentifier(fnDecl.params[0], { name: 'props' })) {
    fnDecl.params[0] = t.identifier('props')
  }

  // Collect bindings from preceding `const X = expr` declarations so reactive
  // getters substitute X transitively (X → its RHS → further bindings).
  // Must happen BEFORE compileJsxToBlock so the JSX walker sees the bindings.
  const precedingRaw: Statement[] = []
  for (let i = 0; i < returnIdx; i++) {
    const s = body[i]
    if (t.isVariableDeclaration(s)) {
      const allFromProps = s.declarations.every(
        (d) => t.isObjectPattern(d.id) && t.isIdentifier((d as any).init, { name: 'props' }),
      )
      if (allFromProps) continue
    }
    precedingRaw.push(s)
  }
  // collectBindings is imported from emit.ts
  collectBindings(precedingRaw, fnCtx.bindings)

  const jsxBlock = compileJsxToBlock(jsxRoot, fnCtx)
  if (
    fnCtx.oneShotProps &&
    fnName &&
    ((fnCtx._rowEventTypes?.size ?? 0) > 0 || (fnCtx._rowFastEventTypes?.size ?? 0) > 0)
  ) {
    const directFnEventTypes = parentCtx.directFnEventTypes ?? (parentCtx.directFnEventTypes = new Map())
    directFnEventTypes.set(fnName, {
      eventTypes: new Set(fnCtx._rowEventTypes),
      fastEventTypes: new Set(fnCtx._rowFastEventTypes),
    })
  }
  parentCtx.tplCounter = fnCtx.tplCounter
  parentCtx.listCounter = fnCtx.listCounter
  parentCtx.templateDecls.push(...fnCtx.templateDecls)
  for (const imp of fnCtx.importsNeeded) parentCtx.importsNeeded.add(imp)

  const precedingStmts: Statement[] = precedingRaw.map((s) => substituteBindings(s, fnCtx.bindings))
  const newBody = precedingStmts.concat(jsxBlock.body)
  const usesDisposer = nodeContainsIdentifier(newBody, 'd')
  if (!usesDisposer && fnName) parentCtx.directFnNoDisposer?.add(fnName)

  if (directParams) {
    fnDecl.params = directParams.locals.map((name) => t.identifier(name))
    if (usesDisposer) fnDecl.params.push(t.identifier('d'))
  } else if (usesDisposer) {
    if (fnDecl.params.length < 2) fnDecl.params.push(t.identifier('d'))
    else fnDecl.params[1] = t.identifier('d')
  }

  fnDecl.body.body = newBody
}
