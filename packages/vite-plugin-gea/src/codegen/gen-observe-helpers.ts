/**
 * Observer update helpers for the Gea compiler codegen.
 *
 * Builds simple (direct) and wildcard (array-item) DOM update statements
 * for observe handler methods, plus text template expression construction.
 */
import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '@babel/traverse'
import { id, js, jsBlockBody, jsExpr, jsMethod } from 'eszter'
import type { ReactiveBinding, TextExpression } from '../ir/types.ts'
import {
  buildMemberChainFromParts,
  buildObserveKey,
  getObserveMethodName,
  normalizePathParts,
} from './member-chain.ts'
import type { StateRefMeta } from '../parse/state-refs.ts'
import { emitPatch, emitMount } from '../emit/registry.ts'

// ─── Path-parts equality test ──────────────────────────────────────

function buildPathPartsEquals(expr: t.Expression, parts: string[]): t.Expression {
  return parts.reduce<t.Expression>(
    (acc, part, index) =>
      t.logicalExpression(
        '&&',
        acc,
        t.binaryExpression(
          '===',
          t.memberExpression(t.cloneNode(expr), t.numericLiteral(index), true),
          t.stringLiteral(part),
        ),
      ),
    t.logicalExpression(
      '&&',
      t.cloneNode(expr),
      t.binaryExpression(
        '===',
        t.memberExpression(t.cloneNode(expr), t.identifier('length')),
        t.numericLiteral(parts.length),
      ),
    ),
  )
}

// ─── Text template expression ──────────────────────────────────────

export function buildTextTemplateExpression(
  binding: ReactiveBinding,
  stateRefs: Map<string, StateRefMeta>,
): t.TemplateLiteral | null {
  if (!binding.textTemplate || !binding.textExpressions?.length) return null

  const templateParts = binding.textTemplate.split(/\$\{(\d+)\}/g)
  const strings: t.TemplateElement[] = []
  const expressions: t.Expression[] = []

  for (let i = 0; i < templateParts.length; i++) {
    if (i % 2 === 0) {
      const raw = templateParts[i]
      strings.push(t.templateElement({ raw, cooked: raw }, i === templateParts.length - 1))
    } else {
      const idx = parseInt(templateParts[i], 10)
      const textExpr = binding.textExpressions[idx]
      if (textExpr) expressions.push(buildValueExpression(textExpr, stateRefs))
    }
  }

  return t.templateLiteral(strings, expressions)
}

// ─── Value expression builder ──────────────────────────────────────

export function buildValueExpression(textExpr: TextExpression, stateRefs: Map<string, StateRefMeta>): t.Expression {
  if (textExpr.expression) {
    return rewriteStateRefs(t.cloneNode(textExpr.expression, true) as t.Expression, stateRefs)
  }
  if (textExpr.isImportedState && textExpr.storeVar) {
    return buildMemberChainFromParts(
      t.memberExpression(t.identifier(textExpr.storeVar), id('GEA_STORE_ROOT'), true),
      textExpr.pathParts,
    )
  }
  return buildMemberChainFromParts(t.thisExpression(), textExpr.pathParts)
}

// ─── State ref rewriting ───────────────────────────────────────────

function rewriteStateRefs(expr: t.Expression, stateRefs: Map<string, StateRefMeta>): t.Expression {
  const prog = t.program([t.expressionStatement(expr)])
  traverse(prog, {
    noScope: true,
    Identifier(path: NodePath<t.Identifier>) {
      if (
        path.parentPath &&
        t.isMemberExpression(path.parentPath.node) &&
        path.parentPath.node.property === path.node &&
        !path.parentPath.node.computed
      )
        return
      if (!stateRefs.has(path.node.name)) return
      const ref = stateRefs.get(path.node.name)!
      if (ref.kind === 'derived' && ref.initExpression) {
        const inlined = rewriteStateRefs(t.cloneNode(ref.initExpression, true), stateRefs)
        path.replaceWith(inlined)
        path.skip()
      } else if (ref.kind === 'local') {
        path.replaceWith(t.thisExpression())
      } else if ((ref.kind === 'imported-destructured' || ref.kind === 'store-alias') && ref.storeVar && ref.propName) {
        path.replaceWith(
          t.memberExpression(
            t.memberExpression(t.identifier(ref.storeVar), id('GEA_STORE_ROOT'), true),
            t.identifier(ref.propName),
          ),
        )
        path.skip()
      } else if (ref.kind === 'local-destructured' && ref.propName) {
        // Destructured local vars like `const { x } = this`
        // must be rewritten to `this.x` in observer methods.
        path.replaceWith(t.memberExpression(t.thisExpression(), t.identifier(ref.propName)))
        path.skip()
      } else {
        path.replaceWith(t.memberExpression(t.identifier(path.node.name), id('GEA_STORE_ROOT'), true))
        path.skip()
      }
    },
  })
  return (prog.body[0] as t.ExpressionStatement).expression
}

// ─── Element lookup ────────────────────────────────────────────────

function buildElementLookup(binding: ReactiveBinding, stateRefs?: Map<string, StateRefMeta>): t.Expression {
  if (binding.userIdExpr) {
    let idExpr = t.cloneNode(binding.userIdExpr, true) as t.Expression
    if (stateRefs && !t.isStringLiteral(idExpr)) {
      idExpr = rewriteStateRefs(idExpr, stateRefs)
    }
    return t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('getElementById')), [idExpr])
  }
  if (binding.bindingId === undefined) {
    return t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('$')), [
      t.stringLiteral(binding.selector),
    ])
  }
  if (binding.bindingId === '') {
    return t.memberExpression(t.thisExpression(), t.identifier('el'))
  }
  const idExpr = t.binaryExpression(
    '+',
    t.memberExpression(t.thisExpression(), t.identifier('id')),
    t.stringLiteral('-' + binding.bindingId),
  )
  return t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('getElementById')), [idExpr])
}

// ─── Simple (direct) update ────────────────────────────────────────

export function buildSimpleUpdate(
  binding: ReactiveBinding,
  param: t.Expression,
  stateRefs: Map<string, StateRefMeta>,
): t.Statement {
  const el = buildElementLookup(binding, stateRefs)
  const valueExpr = binding.textTemplate ? buildTextTemplateExpression(binding, stateRefs) || param : param

  // __updateText shortcut for text bindings with a known bindingId
  if (binding.type === 'text' && binding.textNodeIndex === undefined && binding.bindingId && binding.bindingId !== '' && !binding.userIdExpr) {
    const suffix = t.stringLiteral(binding.bindingId)
    return js`${jsExpr`this[${id('GEA_UPDATE_TEXT')}](${suffix}, ${valueExpr})`};`
  }

  const emitterOpts = {
    attributeName: binding.attributeName,
    classToggleName: binding.classToggleName || (binding.type === 'class'
      ? (binding.pathParts || normalizePathParts((binding as any).path || '')).at(-1) || 'active'
      : undefined),
    textNodeIndex: binding.textNodeIndex,
    isObjectClass: binding.isObjectClass,
    isBooleanAttr: binding.isBooleanAttr,
    isUrlAttr: binding.isUrlAttr,
    isChildrenProp: binding.isChildrenProp,
  }

  const stmts = emitPatch(binding.type, el, binding.type === 'class' ? param : valueExpr, emitterOpts)
  if (stmts.length === 0) return js`if (${el}) { ${jsExpr`${el}.textContent`} = ${valueExpr}; }`

  // Wrap emitter output in an if(el) null-guard
  const body = stmts.length === 1 ? stmts[0] : t.blockStatement(stmts)
  return t.ifStatement(el, body)
}

// ─── Wildcard (array-item) update ──────────────────────────────────

export function buildWildcardUpdate(
  binding: ReactiveBinding,
  param: t.Expression,
  stateRefs: Map<string, StateRefMeta>,
): t.Statement {
  const bindingPathParts = binding.pathParts || normalizePathParts((binding as any).path || '')
  const wildcardIndex = bindingPathParts.indexOf('*')
  const arrayPathParts = bindingPathParts.slice(0, wildcardIndex)
  const propParts = bindingPathParts.slice(wildcardIndex + 1)
  const arrayPath = arrayPathParts.join('.')

  const containerName = `__${arrayPath.replace(/\./g, '_')}_container`
  const containerRef = t.memberExpression(t.thisExpression(), t.identifier(containerName))
  const updateExpr = buildElementUpdate(binding, param as t.Identifier, stateRefs)
  const indexExpr = t.conditionalExpression(
    t.logicalExpression(
      '&&',
      t.logicalExpression(
        '&&',
        t.memberExpression(t.identifier('change'), t.identifier('isArrayItemPropUpdate')),
        buildPathPartsEquals(
          t.memberExpression(t.identifier('change'), t.identifier('arrayPathParts')),
          arrayPathParts,
        ),
      ),
      t.logicalExpression(
        '&&',
        buildPathPartsEquals(t.memberExpression(t.identifier('change'), t.identifier('leafPathParts')), propParts),
        t.binaryExpression(
          '!==',
          t.memberExpression(t.identifier('change'), t.identifier('arrayIndex')),
          t.identifier('undefined'),
        ),
      ),
    ),
    t.memberExpression(t.identifier('change'), t.identifier('arrayIndex')),
    t.nullLiteral(),
  )
  const elementExpr = jsExpr`${containerRef}.children[index]`
  return t.blockStatement(
    jsBlockBody`
      const index = ${indexExpr};
      const element = index !== null ? ${elementExpr} : null;
      if (element) { ${updateExpr}; }
    `,
  )
}

// ─── Element update (for wildcard) ─────────────────────────────────

function buildElementUpdate(
  binding: ReactiveBinding,
  param: t.Identifier,
  stateRefs: Map<string, StateRefMeta>,
): t.Expression {
  const el = t.identifier('element')

  if (binding.type === 'class') {
    const cls = binding.classToggleName || (binding.pathParts || normalizePathParts((binding as any).path || '')).at(-1) || 'active'
    const stmts = emitMount('class', el, param, { classToggleName: cls })
    // emitMount returns an expressionStatement; unwrap to expression for this context
    return (stmts[0] as t.ExpressionStatement).expression
  }

  let targetEl: t.Expression
  if (binding.childPath && binding.childPath.length > 0) {
    targetEl = buildChildAccessExpr(el, binding.childPath)
  } else if (binding.selector === ':scope') {
    targetEl = t.cloneNode(el, true)
  } else {
    throw new Error(
      `buildElementUpdate: childPath required when selector is not :scope (got "${binding.selector}"). ` +
        'Ensure wildcard bindings have childPath from analysis.',
    )
  }

  const valueExpr = binding.textTemplate ? buildTextTemplateExpression(binding, stateRefs) || param : param
  const stmts = emitMount(binding.type, targetEl, valueExpr, {
    attributeName: binding.attributeName,
    textNodeIndex: binding.textNodeIndex,
    isObjectClass: binding.isObjectClass,
    isBooleanAttr: binding.isBooleanAttr,
    isUrlAttr: binding.isUrlAttr,
    isChildrenProp: binding.isChildrenProp,
  })
  // For non-class wildcard updates, extract the expression from the first statement
  if (stmts.length > 0) return (stmts[0] as t.ExpressionStatement).expression
  // Fallback: simple property assignment
  return t.assignmentExpression('=', t.memberExpression(targetEl, t.identifier('textContent')), valueExpr)
}

// ─── Child access expression ───────────────────────────────────────

function buildChildAccessExpr(base: t.Expression, path: number[]): t.Expression {
  let expr = base
  for (const idx of path) {
    expr = t.memberExpression(t.memberExpression(expr, t.identifier('children')), t.numericLiteral(idx), true)
  }
  return expr
}

// ─── Observer method generation ───────────────────────────────────

export function generateObserveHandler(
  binding: ReactiveBinding,
  stateRefs: Map<string, StateRefMeta>,
  methodName = getObserveMethodName(
    binding.pathParts || normalizePathParts((binding as any).path || ''),
    binding.storeVar,
  ),
  observePathOverride?: string[],
): t.ClassMethod {
  const bindingPath = binding.pathParts || normalizePathParts((binding as any).path || '')
  const observePath = observePathOverride || bindingPath
  const paramName = observePath[observePath.length - 1] || 'value'
  const param = t.identifier(paramName)
  const changeParam = t.identifier('change')

  let valueExpr: t.Expression = param
  if (observePathOverride && bindingPath.length > observePathOverride.length) {
    const suffix = bindingPath.slice(observePathOverride.length)
    valueExpr = suffix.reduce<t.Expression>((expr, part) => t.memberExpression(expr, t.identifier(part)), param)
  }

  const isWildcard = observePath.includes('*')
  const body = isWildcard
    ? buildWildcardUpdate(binding, valueExpr, stateRefs)
    : buildSimpleUpdate(binding, valueExpr, stateRefs)

  const method = jsMethod`${id(methodName)}(${param}, ${changeParam}) {}`
  method.body.body.push(...(Array.isArray(body) ? body : [body]))
  return method
}

export function mergeObserveHandlers(
  bindings: ReactiveBinding[],
  stateRefs: Map<string, StateRefMeta>,
): Map<string, t.ClassMethod> {
  const byPath = new Map<string, t.ClassMethod>()

  bindings.forEach((binding) => {
    const pathParts = binding.pathParts || normalizePathParts((binding as any).path || '')
    let observeParts = pathParts
    if (observeParts.length >= 2 && observeParts[observeParts.length - 1] === 'length') {
      observeParts = observeParts.slice(0, -1)
    }
    const observeKey = buildObserveKey(observeParts, binding.storeVar)
    const methodName = getObserveMethodName(observeParts, binding.storeVar)
    const observePathOverride = observeParts !== pathParts ? observeParts : undefined
    const handler = generateObserveHandler(binding, stateRefs, methodName, observePathOverride)

    if (!byPath.has(observeKey)) {
      byPath.set(observeKey, handler)
    } else {
      const existing = byPath.get(observeKey)!
      if (t.isBlockStatement(existing.body) && t.isBlockStatement(handler.body)) {
        existing.body.body.push(...handler.body.body)
      }
    }
  })

  return byPath
}
