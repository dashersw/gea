import type {
  ClassDeclaration,
  Expression,
  File,
  FunctionDeclaration,
  Identifier,
  ObjectPattern,
  ObjectProperty,
  Statement,
  VariableDeclaration,
  VariableDeclarator,
} from '@babel/types'

import { t, traverse } from '../../utils/babel-interop.ts'
import { compilerError } from '../../utils/compile-error.ts'

import {
  collectBindings,
  compileJsxToBlock,
  createEmitContext,
  initializerNeedsLocal,
  substituteBindings,
  type EmitContext,
} from '../emit.ts'
import { extractTemplateJsx, findTemplateMethod } from '../generator.ts'
import { foldConditionalReturn, isConditionalJsxRoot } from './transform-template-methods.ts'

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

export function nodeContainsThisMember(node: any, name: string): boolean {
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

/**
 * True if the function body returns a JSX expression (PascalCase name + JSX
 * return), or picks one with a condition (`c ? <A/> : <B/>`, `c && <A/>`).
 */
export function isFunctionComponent(fn: any): boolean {
  if (!fn.id || !t.isIdentifier(fn.id)) return false
  const name = fn.id.name
  if (!name || name[0] !== name[0].toUpperCase()) return false
  // Look for a return <JSX/> in the body
  if (!fn.body || !t.isBlockStatement(fn.body)) return false
  for (const stmt of fn.body.body) {
    if (t.isReturnStatement(stmt) && isJsxRoot(stmt.argument)) return true
  }
  return false
}

function isJsxRoot(node: any): boolean {
  return t.isJSXElement(node) || t.isJSXFragment(node) || isConditionalJsxRoot(node)
}

/**
 * True if the body keeps a per-instance local (see `initializerNeedsLocal`),
 * e.g. `const store = new CounterStore()`. Reads of such a local must stay
 * reactive, so the component can't be compiled as a one-shot direct factory.
 */
export function fnHasInstanceLocals(fn: any): boolean {
  for (const stmt of fn.body?.body ?? []) {
    if (t.isReturnStatement(stmt)) break
    if (t.isVariableDeclaration(stmt) && stmt.declarations.some((d) => d.init && initializerNeedsLocal(d.init))) {
      return true
    }
  }
  return false
}

/** Value bindings declared at the top level of a module: imports, variables, functions, classes, enums. */
export function collectModuleBindings(ast: File): Set<string> {
  const names = new Set<string>()
  for (const stmt of ast.program.body) {
    if (t.isImportDeclaration(stmt)) {
      if (stmt.importKind === 'type' || stmt.importKind === 'typeof') continue
      for (const spec of stmt.specifiers) {
        if (t.isImportSpecifier(spec) && (spec.importKind === 'type' || spec.importKind === 'typeof')) continue
        names.add(spec.local.name)
      }
      continue
    }
    const decl = t.isExportNamedDeclaration(stmt) || t.isExportDefaultDeclaration(stmt) ? stmt.declaration : stmt
    if (t.isVariableDeclaration(decl) || t.isFunctionDeclaration(decl) || t.isClassDeclaration(decl)) {
      for (const name of Object.keys(t.getOuterBindingIdentifiers(decl))) names.add(name)
    } else if (t.isTSEnumDeclaration(decl)) {
      names.add(decl.id.name)
    }
  }
  return names
}

/**
 * True if the function reads one of `moduleBindings` (see
 * `collectModuleBindings`), e.g. `{counter.count}` for an imported store.
 * A one-shot direct factory would write that read once and never update it.
 * JSX tags don't count: rendering a component isn't a read, and the child
 * keeps its own bindings. Locals that shadow a module name and type
 * annotations don't count either.
 */
export function fnReadsModuleBinding(fn: FunctionDeclaration, moduleBindings: Set<string>): boolean {
  if (moduleBindings.size === 0) return false
  let reads = false
  traverse(t.file(t.program([t.cloneNode(fn, true)])), {
    enter(path) {
      if (isTypeOnlyNode(path.node)) path.skip()
    },
    Identifier(path) {
      const name = path.node.name
      if (!moduleBindings.has(name) || !path.isReferencedIdentifier() || path.scope.getBinding(name)) return
      reads = true
      path.stop()
    },
  })
  return reads
}

function isTypeOnlyNode(node: any): boolean {
  return (
    t.isTSType(node) ||
    t.isTSTypeAnnotation(node) ||
    t.isTSTypeParameterInstantiation(node) ||
    t.isTSTypeParameterDeclaration(node) ||
    t.isTSTypeAliasDeclaration(node) ||
    t.isTSInterfaceDeclaration(node)
  )
}

/**
 * True if the body picks its root with a condition, which `rewriteFnComponent`
 * folds into a `conditional()` reading `props`. A one-shot direct factory has
 * no `props`, so such a component has to be mounted.
 */
export function fnHasConditionalRoot(fn: any): boolean {
  const body: Statement[] = fn.body?.body ?? []
  const returnIdx = body.findIndex((s) => t.isReturnStatement(s))
  if (returnIdx < 0) return false
  if (isConditionalJsxRoot((body[returnIdx] as any).argument)) return true
  return body.slice(0, returnIdx).some((stmt) => findJsxReturn(stmt) !== null)
}

/**
 * Function components have no local state yet: the body runs once per
 * instance and reads of its locals are inlined into the JSX, so a reassigned
 * `let` can never reach the DOM (and used to compile to `0++`). Fail the build
 * with a pointer to the supported alternatives instead.
 */
function assertNoReassignedLocals(fnDecl: any, fnName: string, preceding: Statement[]): void {
  const mutable = new Set<string>()
  for (const stmt of preceding) {
    if (!t.isVariableDeclaration(stmt) || stmt.kind === 'const') continue
    for (const decl of stmt.declarations) {
      for (const name of Object.keys(t.getBindingIdentifiers(decl.id))) mutable.add(name)
    }
  }
  if (mutable.size === 0) return

  let name = ''
  let write: any = null
  const fn = t.cloneNode(fnDecl, true)
  traverse(t.file(t.program([t.isStatement(fn) ? fn : t.expressionStatement(fn)])), {
    Function(path) {
      path.stop()
      for (const local of mutable) {
        const violation = path.scope.getOwnBinding(local)?.constantViolations[0]
        if (violation) {
          name = local
          write = violation.node
          return
        }
      }
    },
  })
  if (!write) return

  throw compilerError(
    `Function component \`${fnName || '<anonymous>'}\` reassigns \`${name}\`.`,
    write,
    `Function components have no local state yet, so the new value would never render. ` +
      `Keep \`${name}\` in a Store or a class component.`,
  )
}

/** A `return` of JSX inside `node`, not counting nested functions. */
function findJsxReturn(node: any): any {
  if (!node || typeof node !== 'object') return null
  if (t.isFunction(node)) return null
  if (t.isReturnStatement(node)) return isJsxRoot(node.argument) ? node : null
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findJsxReturn(child)
      if (found) return found
    }
    return null
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
    const found = findJsxReturn(node[key])
    if (found) return found
  }
  return null
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
  let returnIdx = body.findIndex((s) => t.isReturnStatement(s))
  if (returnIdx < 0 || !isJsxRoot((body[returnIdx] as any).argument)) return

  const fnName = t.isIdentifier(fnDecl.id) ? fnDecl.id.name : ''
  // Checked before folding, which moves locals declared after a guard into
  // the guard's branch.
  assertNoReassignedLocals(fnDecl, fnName, body.slice(0, returnIdx))
  foldConditionalReturn(body)
  returnIdx = body.findIndex((s) => t.isReturnStatement(s))
  const jsxRoot = (body[returnIdx] as any).argument

  const fnCtx = createEmitContext(t.identifier('props'))
  fnCtx.oneShotProps = parentCtx.directFnComponents?.has(fnName) === true
  const directParams = fnCtx.oneShotProps ? parentCtx.directFnComponentParams?.get(fnName) : undefined
  // Share the tpl/list counters with the parent so hoisted _tplN names don't collide
  fnCtx.tplCounter = parentCtx.tplCounter
  fnCtx.listCounter = parentCtx.listCounter
  fnCtx.directFnComponents = parentCtx.directFnComponents
  fnCtx.directFnComponentParams = parentCtx.directFnComponentParams
  fnCtx.directFnStringProps = parentCtx.directFnStringProps
  fnCtx.directFnNoDisposer = parentCtx.directFnNoDisposer
  fnCtx.directClassComponents = parentCtx.directClassComponents
  // Share IR template recording with the parent so functional components also
  // produce an IR template record. Without this, `emit-core.ts` skips the
  // `irTemplates.push(...)` because the function's `fnCtx.currentIrComponent`
  // is unset, and `buildModuleIr` can't find a template record for the function
  // component name in `rewritten`, so the component is silently dropped from
  // the IR. Class components don't have this problem because they share the
  // parent ctx directly.
  if (parentCtx.irTemplates && fnName) {
    fnCtx.irTemplates = parentCtx.irTemplates
    fnCtx.currentIrComponent = fnName
    fnCtx.currentIrRuntimeBase = 'reactive'
  }
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
  // hits the live thunk on each read). `const { … } = props` in the body
  // goes through the same path below.
  const propsLocals: Statement[] = []
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
    propsLocals.push(...bindPropsPattern(fnDecl.params[0], 'let', fnCtx.bindings))
    fnDecl.params[0] = t.identifier('props')
  } else if (fnDecl.params.length === 0) {
    fnDecl.params.push(t.identifier('props'))
  } else if (!t.isIdentifier(fnDecl.params[0], { name: 'props' })) {
    fnDecl.params[0] = t.identifier('props')
  }

  // Collect bindings from preceding `const X = expr` declarations so reactive
  // getters substitute X transitively (X → its RHS → further bindings).
  // Must happen BEFORE compileJsxToBlock so the JSX walker sees the bindings.
  // A guard's branch binds the locals folded into it the same way.
  const precedingRaw: Statement[] = [...propsLocals, ...bindFnLocals(body.slice(0, returnIdx), fnCtx.bindings)]
  fnCtx.bindBranchLocals = bindFnLocals

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

/**
 * Bind the locals a function component declares before its JSX so reads
 * inline through to `props`, and return the statements that stay in the
 * body. `const { … } = props` binds as in `bindPropsPattern`.
 */
function bindFnLocals(stmts: Statement[], bindings: Map<string, Expression>): Statement[] {
  const kept: Statement[] = []
  const propsLocals: Statement[] = []
  for (const s of stmts) {
    if (t.isVariableDeclaration(s) && s.declarations.some(isPropsDestructure)) {
      const others = s.declarations.filter((decl) => !isPropsDestructure(decl))
      for (const decl of s.declarations) {
        if (!isPropsDestructure(decl)) continue
        const locals = bindPropsPattern(decl.id as ObjectPattern, s.kind, bindings)
        kept.push(...locals)
        propsLocals.push(...locals)
      }
      if (others.length > 0) kept.push(t.variableDeclaration(s.kind, others))
      continue
    }
    kept.push(s)
  }
  // Props locals stay real variables, so they must not be inlined as
  // bindings. Locals that construct objects or write state stay real
  // variables too, created once per instance (or per render of a guard's
  // branch); inlining them would re-run the initializer on each read.
  collectBindings(
    kept.filter((s) => !propsLocals.includes(s)),
    bindings,
    initializerNeedsLocal,
  )
  return kept
}

function isPropsDestructure(decl: VariableDeclarator): boolean {
  return t.isObjectPattern(decl.id) && t.isIdentifier(decl.init, { name: 'props' })
}

/**
 * Bind a props destructuring pattern so every name reads through `props` on
 * each access instead of capturing the value once:
 *   `{ title }`       → title = props.title
 *   `{ class: cls }`  → cls = props.class
 *   `{ size = 'md' }` → size = props.size === undefined ? 'md' : props.size
 *   `{ ...rest }`     → a real local whose getters read through to `props`
 * Returns the statements that must stay in the body as real locals. Nested
 * patterns stay a plain destructure of `props`, as does the whole pattern when
 * a computed key makes the rest element's excluded keys unknown.
 */
function bindPropsPattern(
  pattern: ObjectPattern,
  kind: VariableDeclaration['kind'],
  bindings: Map<string, Expression>,
): Statement[] {
  const rest = pattern.properties.find((prop) => t.isRestElement(prop))
  const keys: string[] = []
  for (const prop of pattern.properties) {
    if (t.isRestElement(prop)) continue
    const key = staticPropKey(prop)
    if (key !== null) keys.push(key)
    else if (rest) return [t.variableDeclaration(kind, [t.variableDeclarator(pattern, t.identifier('props'))])]
  }

  const locals: Statement[] = []
  const nested: ObjectProperty[] = []
  for (const prop of pattern.properties) {
    if (t.isRestElement(prop)) continue
    const key = staticPropKey(prop)
    const value = prop.value
    if (key === null || !(t.isIdentifier(value) || (t.isAssignmentPattern(value) && t.isIdentifier(value.left)))) {
      nested.push(prop)
      continue
    }
    const read = () =>
      t.isValidIdentifier(key, false)
        ? t.memberExpression(t.identifier('props'), t.identifier(key))
        : t.memberExpression(t.identifier('props'), t.stringLiteral(key), true)
    if (t.isIdentifier(value)) {
      bindings.set(value.name, read())
    } else {
      bindings.set(
        (value.left as Identifier).name,
        t.conditionalExpression(
          t.binaryExpression('===', read(), t.identifier('undefined')),
          t.cloneNode(value.right, true),
          read(),
        ),
      )
    }
  }
  if (nested.length > 0) {
    locals.push(t.variableDeclaration(kind, [t.variableDeclarator(t.objectPattern(nested), t.identifier('props'))]))
  }

  if (rest && t.isIdentifier(rest.argument)) {
    // Same shape as the direct factory props object in emit-mount.ts: one
    // enumerable getter per remaining prop, so reads stay live.
    const restId = t.identifier(rest.argument.name)
    const keyId = t.identifier('__restKey')
    const define = t.expressionStatement(
      t.callExpression(t.memberExpression(t.identifier('Object'), t.identifier('defineProperty')), [
        t.cloneNode(restId),
        t.cloneNode(keyId),
        t.objectExpression([
          t.objectProperty(t.identifier('enumerable'), t.booleanLiteral(true)),
          t.objectProperty(t.identifier('configurable'), t.booleanLiteral(true)),
          t.objectProperty(
            t.identifier('get'),
            t.arrowFunctionExpression([], t.memberExpression(t.identifier('props'), t.cloneNode(keyId), true)),
          ),
        ]),
      ]),
    )
    const excluded = keys.map((key) => t.binaryExpression('!==', t.cloneNode(keyId), t.stringLiteral(key)))
    const test = excluded.reduce<Expression | null>(
      (acc, cur) => (acc ? t.logicalExpression('&&', acc, cur) : cur),
      null,
    )
    locals.push(
      t.variableDeclaration(kind, [t.variableDeclarator(restId, t.objectExpression([]))]),
      t.forInStatement(
        t.variableDeclaration('const', [t.variableDeclarator(keyId)]),
        t.identifier('props'),
        test ? t.ifStatement(test, define) : define,
      ),
    )
  }
  return locals
}

function staticPropKey(prop: ObjectProperty): string | null {
  if (!prop.computed && t.isIdentifier(prop.key)) return prop.key.name
  if (t.isStringLiteral(prop.key)) return prop.key.value
  if (t.isNumericLiteral(prop.key)) return String(prop.key.value)
  return null
}
