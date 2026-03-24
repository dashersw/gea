import * as t from '@babel/types'
import { id, js, jsBlockBody, jsExpr } from 'eszter'
import type { NodePath } from '@babel/traverse'
import type { ReactiveBinding, TextExpression } from './ir.ts'
import { buildMemberChainFromParts, normalizePathParts } from './utils.ts'
import type { StateRefMeta } from './parse.ts'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const traverse = require('@babel/traverse').default

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

export function buildValueExpression(textExpr: TextExpression, stateRefs: Map<string, StateRefMeta>): t.Expression {
  if (textExpr.expression) {
    return rewriteStateRefs(t.cloneNode(textExpr.expression, true) as t.Expression, stateRefs)
  }
  if (textExpr.isImportedState && textExpr.storeVar) {
    return buildMemberChainFromParts(
      t.memberExpression(
        t.identifier(textExpr.storeVar),
        t.identifier('__store'),
      ),
      textExpr.pathParts,
    )
  }
  return buildMemberChainFromParts(t.thisExpression(), textExpr.pathParts)
}

function rewriteStateRefs(expr: t.Expression, stateRefs: Map<string, StateRefMeta>): t.Expression {
  const prog = t.program([t.expressionStatement(expr)])
  traverse(prog, {
    noScope: true,
    Identifier(path: NodePath<t.Identifier>) {
      if (path.parentPath && t.isMemberExpression(path.parentPath.node) && path.parentPath.node.property === path.node)
        return
      if (!stateRefs.has(path.node.name)) return
      const ref = stateRefs.get(path.node.name)!
      if (ref.kind === 'local') {
        path.replaceWith(t.thisExpression())
      } else {
        path.replaceWith(
          t.memberExpression(
            t.identifier(path.node.name),
            t.identifier('__store'),
          ),
        )
        path.skip()
      }
    },
  })
  return (prog.body[0] as t.ExpressionStatement).expression
}

function buildElementLookup(binding: ReactiveBinding): t.Expression {
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

export function buildSimpleUpdate(
  binding: ReactiveBinding,
  param: t.Expression,
  stateRefs: Map<string, StateRefMeta>,
): t.Statement {
  const el = buildElementLookup(binding)
  const target = buildTargetProp(binding)
  const valueExpr = binding.textTemplate ? buildTextTemplateExpression(binding, stateRefs) || param : param

  if (binding.type === 'class') {
    const pathParts = binding.pathParts || normalizePathParts((binding as any).path || '')
    const cls = binding.classToggleName || pathParts[pathParts.length - 1] || 'active'
    return js`if (${el}) { ${jsExpr`${el}.classList.toggle(${cls}, ${param})`}; }`
  }

  if (binding.textNodeIndex !== undefined && binding.type === 'text') {
    const idx = t.numericLiteral(binding.textNodeIndex)
    return js`if (${el}) { const __tn = ${jsExpr`${el}.childNodes[${idx}]`}; if (__tn && __tn.nodeValue !== ${valueExpr}) __tn.nodeValue = ${valueExpr}; }`
  }

  if (target === 'textContent' && binding.bindingId && binding.bindingId !== '') {
    const suffix = t.stringLiteral(binding.bindingId)
    return js`${jsExpr`this.__updateText(${suffix}, ${valueExpr})`};`
  }

  return js`if (${el}) { ${jsExpr`${el}.${id(target)}`} = ${valueExpr}; }`
}

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

function buildElementUpdate(
  binding: ReactiveBinding,
  param: t.Identifier,
  stateRefs: Map<string, StateRefMeta>,
): t.Expression {
  const el = t.identifier('element')
  const target = buildTargetProp(binding)

  if (binding.type === 'class') {
    const pathParts = binding.pathParts || normalizePathParts((binding as any).path || '')
    const cls = binding.classToggleName || pathParts[pathParts.length - 1] || 'active'
    return t.callExpression(
      t.memberExpression(t.memberExpression(el, t.identifier('classList')), t.identifier('toggle')),
      [t.stringLiteral(cls), param],
    )
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
  return t.assignmentExpression('=', t.memberExpression(targetEl, t.identifier(target)), valueExpr)
}

function buildChildAccessExpr(base: t.Expression, path: number[]): t.Expression {
  let expr = base
  for (const idx of path) {
    expr = t.memberExpression(t.memberExpression(expr, t.identifier('children')), t.numericLiteral(idx), true)
  }
  return expr
}

function buildTargetProp(binding: ReactiveBinding): string {
  switch (binding.type) {
    case 'text':
      return 'textContent'
    case 'value':
      return 'value'
    case 'checked':
      return 'checked'
    default:
      return 'textContent'
  }
}
