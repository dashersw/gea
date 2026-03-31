/**
 * Shared AST utilities for the Gea compiler codegen.
 *
 * Consolidates helper functions for JSX tag inspection, selector generation,
 * member-chain building, observe-key computation, prop-ref rewriting,
 * dead-code pruning, and post-processing optimizations.
 */
import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '@babel/traverse'
import { id, jsImport } from 'eszter'
import type { PathParts } from '../ir.ts'
import type { StateRefMeta } from '../parse.ts'

// ─── JSX tag helpers ────────────────────────────────────────────────

export function getJSXTagName(
  name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
): string {
  if (t.isJSXIdentifier(name)) return name.name
  if (t.isJSXMemberExpression(name))
    return `${getJSXTagName(name.object)}.${name.property.name}`
  if (t.isJSXNamespacedName(name))
    return `${name.namespace.name}:${name.name.name}`
  return ''
}

export function isUpperCase(char: string): boolean {
  return char >= 'A' && char <= 'Z'
}

export function isComponentTag(tagName: string): boolean {
  return tagName.length > 0 && isUpperCase(tagName[0])
}

export function camelToKebab(name: string): string {
  return name.replace(/([A-Z])/g, '-$1').toLowerCase()
}

// ─── String-expression analysis ─────────────────────────────────────

export function isAlwaysStringExpression(expr: t.Expression): boolean {
  if (t.isStringLiteral(expr)) return true
  if (t.isTemplateLiteral(expr)) return true
  if (t.isConditionalExpression(expr)) {
    return (
      isAlwaysStringExpression(expr.consequent as t.Expression) &&
      isAlwaysStringExpression(expr.alternate as t.Expression)
    )
  }
  if (t.isLogicalExpression(expr) && expr.operator === '??') {
    return isAlwaysStringExpression(expr.right as t.Expression)
  }
  return false
}

export function isWhitespaceFree(expr: t.Expression): boolean {
  if (t.isStringLiteral(expr)) return expr.value === expr.value.trim()
  if (t.isConditionalExpression(expr)) {
    return (
      isWhitespaceFree(expr.consequent as t.Expression) &&
      isWhitespaceFree(expr.alternate as t.Expression)
    )
  }
  return false
}

// ─── Class-value expression builders ────────────────────────────────

export function buildTrimmedClassValueExpression(
  expr: t.Expression,
): t.Expression {
  if (isAlwaysStringExpression(expr) && isWhitespaceFree(expr)) return expr

  if (isAlwaysStringExpression(expr)) {
    return t.callExpression(
      t.memberExpression(t.cloneNode(expr, true), t.identifier('trim')),
      [],
    )
  }

  const forCompare = t.cloneNode(expr, true) as t.Expression
  const forString = t.cloneNode(expr, true) as t.Expression
  const coerced = t.conditionalExpression(
    t.binaryExpression('!=', forCompare, t.nullLiteral()),
    t.callExpression(t.identifier('String'), [forString]),
    t.stringLiteral(''),
  )
  return t.callExpression(
    t.memberExpression(
      t.parenthesizedExpression(coerced),
      t.identifier('trim'),
    ),
    [],
  )
}

export function buildTrimmedClassJoinedExpression(
  expr: t.Expression,
): t.Expression {
  return t.callExpression(
    t.memberExpression(t.cloneNode(expr, true), t.identifier('trim')),
    [],
  )
}

// ─── Selector generation ────────────────────────────────────────────

export function generateSelector(selectorPath: string[]): string {
  if (selectorPath.length === 0) return ':scope'
  return `:scope > ${selectorPath.join(' > ')}`
}

// ─── Direct child elements ──────────────────────────────────────────

export function getDirectChildElements(
  children:
    | readonly t.JSXText[]
    | readonly (
        | t.JSXText
        | t.JSXExpressionContainer
        | t.JSXSpreadChild
        | t.JSXElement
        | t.JSXFragment
      )[],
) {
  const directChildren: t.JSXElement[] = []

  const pushChildren = (
    nodes: readonly (
      | t.JSXText
      | t.JSXExpressionContainer
      | t.JSXSpreadChild
      | t.JSXElement
      | t.JSXFragment
    )[],
  ) => {
    nodes.forEach((child) => {
      if (t.isJSXElement(child)) {
        directChildren.push(child)
      } else if (t.isJSXFragment(child)) {
        pushChildren(child.children)
      } else if (
        t.isJSXExpressionContainer(child) &&
        !t.isJSXEmptyExpression(child.expression)
      ) {
        if (t.isJSXElement(child.expression)) {
          directChildren.push(child.expression)
        } else if (t.isJSXFragment(child.expression)) {
          pushChildren(child.expression.children)
        }
      }
    })
  }

  pushChildren(
    children as readonly (
      | t.JSXText
      | t.JSXExpressionContainer
      | t.JSXSpreadChild
      | t.JSXElement
      | t.JSXFragment
    )[],
  )

  const perTagCounts = new Map<string, number>()
  return directChildren.map((node) => {
    const tagName = getJSXTagName(node.openingElement.name) || 'div'
    const tagCount = (perTagCounts.get(tagName) || 0) + 1
    perTagCounts.set(tagName, tagCount)
    return {
      node,
      selectorSegment: `${tagName}:nth-of-type(${tagCount})`,
    }
  })
}

// ─── Import management ──────────────────────────────────────────────

export function ensureImport(
  ast: t.File,
  source: string,
  specifier: string,
  isDefault = false,
): boolean {
  const program = ast.program

  const buildSpecifier = () =>
    isDefault
      ? t.importDefaultSpecifier(t.identifier(specifier))
      : t.importSpecifier(t.identifier(specifier), t.identifier(specifier))

  if (isDefault) {
    const alreadyHasDefault = program.body.some(
      (node) =>
        t.isImportDeclaration(node) &&
        node.source.value === source &&
        node.specifiers.some((s) => t.isImportDefaultSpecifier(s)),
    )
    if (alreadyHasDefault) return false
    const insertIndex = Math.max(
      0,
      program.body.reduce(
        (idx, node, i) => (t.isImportDeclaration(node) ? i + 1 : idx),
        0,
      ),
    )
    program.body.splice(
      insertIndex,
      0,
      isDefault
        ? (jsImport`import ${id(specifier)} from ${source};`)
        : (jsImport`import { ${id(specifier)} } from ${source};`),
    )
    return true
  }

  const declaration = program.body.find(
    (node) => t.isImportDeclaration(node) && node.source.value === source,
  ) as t.ImportDeclaration | undefined

  if (!declaration) {
    const insertIndex = Math.max(
      0,
      program.body.reduce(
        (idx, node, i) => (t.isImportDeclaration(node) ? i + 1 : idx),
        0,
      ),
    )
    program.body.splice(
      insertIndex,
      0,
      jsImport`import { ${id(specifier)} } from ${source};`,
    )
    return true
  }

  const exists = declaration.specifiers.some(
    (s) =>
      t.isImportSpecifier(s) &&
      t.isIdentifier(s.local) &&
      s.local.name === specifier,
  )

  if (!exists) {
    declaration.specifiers.push(buildSpecifier())
    return true
  }

  return false
}

// ─── Member-chain builders ──────────────────────────────────────────

export function buildMemberChain(
  base: t.Expression,
  path: string,
): t.Expression {
  return buildMemberChainFromParts(base, path ? path.split('.') : [])
}

export function buildMemberChainFromParts(
  base: t.Expression,
  parts: PathParts,
): t.Expression {
  if (parts.length === 0) return base
  return parts.reduce<t.Expression>((acc, prop) => {
    const isIndex = /^\d+$/.test(prop)
    return t.memberExpression(
      acc,
      isIndex ? t.numericLiteral(Number(prop)) : t.identifier(prop),
      isIndex,
    )
  }, base)
}

export function buildOptionalMemberChain(
  base: t.Expression,
  path: string,
): t.Expression {
  return buildOptionalMemberChainFromParts(base, path ? path.split('.') : [])
}

export function buildOptionalMemberChainFromParts(
  base: t.Expression,
  parts: PathParts,
): t.Expression {
  if (parts.length === 0) return base
  return parts.reduce<t.Expression>((acc, prop) => {
    const isIndex = /^\d+$/.test(prop)
    return t.optionalMemberExpression(
      acc,
      isIndex ? t.numericLiteral(Number(prop)) : t.identifier(prop),
      isIndex,
      true,
    )
  }, base)
}

// ─── Observe key/method names ───────────────────────────────────────

function sanitizeObserveName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_$]/g, '_')
}

export function normalizePathParts(path: string | PathParts): PathParts {
  return Array.isArray(path) ? path : path ? path.split('.') : []
}

export function pathPartsToString(parts: string | PathParts): string {
  return normalizePathParts(parts).join('.')
}

export function buildObserveKey(
  parts: string | PathParts,
  storeVar?: string,
): string {
  return JSON.stringify({
    storeVar: storeVar || null,
    parts: normalizePathParts(parts),
  })
}

export function parseObserveKey(
  key: string,
): { parts: PathParts; storeVar?: string } {
  const parsed = JSON.parse(key) as {
    storeVar: string | null
    parts: PathParts
  }
  return {
    parts: parsed.parts,
    ...(parsed.storeVar ? { storeVar: parsed.storeVar } : {}),
  }
}

export function getObserveMethodName(
  parts: string | PathParts,
  storeVar?: string,
): string {
  const owner = sanitizeObserveName(storeVar || 'local')
  const normalized = normalizePathParts(parts)
  const observePath = sanitizeObserveName(
    normalized.length > 0 ? normalized.join('__') : 'root',
  )
  return `__observe_${owner}_${observePath}`
}

// ─── Path resolution ────────────────────────────────────────────────

export function resolvePath(
  expr:
    | t.MemberExpression
    | t.Identifier
    | t.ThisExpression
    | t.CallExpression,
  stateRefs: Map<string, StateRefMeta>,
  context: { inMap?: boolean; mapItemVar?: string } = {},
): {
  parts: PathParts | null
  isImportedState?: boolean
  storeVar?: string
} | null {
  if (t.isIdentifier(expr)) {
    if (context.inMap && context.mapItemVar === expr.name) {
      return { parts: null }
    }
    if (stateRefs.has(expr.name)) {
      const ref = stateRefs.get(expr.name)!
      if (ref.kind === 'derived') return { parts: null }
      if (ref.kind === 'local-destructured' && ref.propName) {
        return { parts: [ref.propName] }
      }
      if (ref.kind === 'store-alias' && ref.storeVar && ref.propName) {
        return {
          parts: [ref.propName],
          isImportedState: true,
          storeVar: ref.storeVar,
        }
      }
      if (
        ref.kind === 'imported-destructured' &&
        ref.storeVar &&
        ref.propName
      ) {
        return {
          parts: [ref.propName],
          isImportedState: true,
          storeVar: ref.storeVar,
        }
      }
      return {
        parts: [],
        isImportedState: ref.kind === 'imported',
        storeVar: ref.kind === 'imported' ? expr.name : undefined,
      }
    }
    return { parts: null }
  }

  if (t.isThisExpression(expr)) return { parts: [] }

  if (t.isCallExpression(expr) && t.isMemberExpression(expr.callee)) {
    return resolvePath(
      expr.callee.object as
        | t.MemberExpression
        | t.Identifier
        | t.ThisExpression,
      stateRefs,
      context,
    )
  }

  if (t.isMemberExpression(expr)) {
    const objectResult = resolvePath(
      expr.object as t.MemberExpression | t.Identifier | t.ThisExpression,
      stateRefs,
      context,
    )
    if (!objectResult || !objectResult.parts) {
      if (
        context.inMap &&
        t.isIdentifier(expr.object) &&
        expr.object.name === context.mapItemVar
      ) {
        if (t.isIdentifier(expr.property)) {
          return { parts: [expr.property.name] }
        }
      }
      return { parts: null }
    }

    if (
      objectResult.isImportedState &&
      objectResult.storeVar &&
      objectResult.parts.length === 0 &&
      t.isIdentifier(expr.property)
    ) {
      const ref = stateRefs.get(objectResult.storeVar)
      const propName = expr.property.name
      if (ref?.reactiveFields) {
        if (
          ref.reactiveFields.has(propName) ||
          ref.getterDeps?.has(propName)
        ) {
          return {
            parts: [propName],
            isImportedState: true,
            storeVar: objectResult.storeVar,
          }
        }
        return null
      }
      return {
        parts: [propName],
        isImportedState: true,
        storeVar: objectResult.storeVar,
      }
    }

    if (t.isIdentifier(expr.property)) {
      return {
        parts: [...objectResult.parts, expr.property.name],
        isImportedState: objectResult.isImportedState,
        storeVar: objectResult.storeVar,
      }
    } else if (t.isNumericLiteral(expr.property)) {
      return {
        parts: [...objectResult.parts, String(expr.property.value)],
        isImportedState: objectResult.isImportedState,
        storeVar: objectResult.storeVar,
      }
    }
  }

  return { parts: null }
}

// ─── Handler body extraction ────────────────────────────────────────

export function extractHandlerBody(
  handlerExpression: t.Expression,
  propNames?: Set<string>,
): t.Statement[] {
  if (t.isArrowFunctionExpression(handlerExpression)) {
    let body: t.Statement[]
    if (t.isBlockStatement(handlerExpression.body)) {
      body = handlerExpression.body.body
    } else {
      body = [t.expressionStatement(handlerExpression.body)]
    }
    return propNames?.size ? replacePropRefsInStatements(body, propNames) : body
  }
  if (t.isFunctionExpression(handlerExpression)) {
    const body = handlerExpression.body.body
    return propNames?.size ? replacePropRefsInStatements(body, propNames) : body
  }
  const callee = t.isIdentifier(handlerExpression)
    ? t.memberExpression(
        t.memberExpression(t.thisExpression(), t.identifier('props')),
        t.cloneNode(handlerExpression),
      )
    : handlerExpression
  return [t.expressionStatement(t.callExpression(callee, [t.identifier('e')]))]
}

// ─── Prop-ref rewriting ─────────────────────────────────────────────

export function replacePropRefsInStatements(
  statements: t.Statement[],
  propNames: Set<string>,
  wholeParamName?: string,
  propDefaults?: Map<string, t.Expression>,
): t.Statement[] {
  return statements.map(
    (stmt) =>
      replacePropRefsInNode(
        stmt,
        propNames,
        wholeParamName,
        propDefaults,
      ) as t.Statement,
  )
}

export function replacePropRefsInExpression(
  expr: t.Expression,
  propNames: Set<string>,
  wholeParamName?: string,
  propDefaults?: Map<string, t.Expression>,
): t.Expression {
  return replacePropRefsInNode(
    expr,
    propNames,
    wholeParamName,
    propDefaults,
  ) as t.Expression
}

function isThisPropsMember(node: t.Node): boolean {
  return (
    t.isMemberExpression(node) &&
    !node.computed &&
    t.isThisExpression(node.object) &&
    t.isIdentifier(node.property, { name: 'props' })
  )
}

export function replaceThisPropsRootWithValueParam(
  expr: t.Expression,
  propName: string,
): t.Expression {
  const visit = (e: t.Expression): t.Expression => {
    if (
      t.isMemberExpression(e) &&
      !e.computed &&
      isThisPropsMember(e.object) &&
      t.isIdentifier(e.property, { name: propName })
    ) {
      return t.identifier('value')
    }
    if (t.isMemberExpression(e))
      return t.memberExpression(
        visit(e.object as t.Expression),
        e.property,
        e.computed,
      )
    if (t.isOptionalMemberExpression(e))
      return t.optionalMemberExpression(
        visit(e.object as t.Expression),
        e.property as t.Expression,
        e.computed,
        e.optional,
      )
    if (t.isOptionalCallExpression(e))
      return t.optionalCallExpression(
        visit(e.callee as t.Expression),
        e.arguments.map((a) =>
          (t.isExpression(a) ? visit(a) : a) as t.Expression,
        ),
        e.optional,
      )
    if (t.isCallExpression(e))
      return t.callExpression(
        visit(e.callee as t.Expression),
        e.arguments.map((a) =>
          (t.isExpression(a) ? visit(a) : a) as t.Expression,
        ),
      )
    if (t.isConditionalExpression(e))
      return t.conditionalExpression(
        visit(e.test),
        visit(e.consequent),
        visit(e.alternate),
      )
    if (t.isLogicalExpression(e))
      return t.logicalExpression(
        e.operator,
        visit(e.left as t.Expression),
        visit(e.right as t.Expression),
      )
    if (t.isBinaryExpression(e))
      return t.binaryExpression(
        e.operator,
        visit(e.left as t.Expression),
        visit(e.right as t.Expression),
      )
    if (t.isUnaryExpression(e))
      return t.unaryExpression(
        e.operator,
        visit(e.argument as t.Expression),
        e.prefix,
      )
    if (t.isSequenceExpression(e))
      return t.sequenceExpression(
        e.expressions.map((x) => visit(x as t.Expression)),
      )
    if (t.isAssignmentExpression(e))
      return t.assignmentExpression(
        e.operator,
        e.left as t.LVal,
        visit(e.right as t.Expression),
      )
    if (t.isArrayExpression(e))
      return t.arrayExpression(
        e.elements.map((el) => {
          if (el === null) return null
          if (t.isSpreadElement(el)) return t.spreadElement(visit(el.argument))
          return visit(el as t.Expression)
        }),
      )
    if (t.isObjectExpression(e))
      return t.objectExpression(
        e.properties.map((p) => {
          if (t.isSpreadElement(p)) return t.spreadElement(visit(p.argument))
          if (t.isObjectProperty(p))
            return t.objectProperty(
              p.computed
                ? (visit(p.key as t.Expression) as
                    | t.Expression
                    | t.Identifier
                    | t.StringLiteral)
                : p.key,
              visit(p.value as t.Expression),
              p.computed,
              p.shorthand,
            )
          return p
        }),
      )
    if (t.isTemplateLiteral(e))
      return t.templateLiteral(
        e.quasis,
        e.expressions.map((x) => visit(x as t.Expression)),
      )
    if (t.isTaggedTemplateExpression(e))
      return t.taggedTemplateExpression(
        visit(e.tag as t.Expression),
        visit(e.quasi) as t.TemplateLiteral,
      )
    if (t.isNewExpression(e))
      return t.newExpression(
        visit(e.callee as t.Expression),
        e.arguments.map((a) =>
          (t.isExpression(a) ? visit(a) : a) as t.Expression,
        ),
      )
    return e
  }
  return visit(expr)
}

export function derivedExprGuardsValueWhenNullish(
  expr: t.Expression,
): boolean {
  if (!t.isConditionalExpression(expr)) return false
  return testBranchesOnValueNullish(expr.test)
}

function testBranchesOnValueNullish(test: t.Expression): boolean {
  if (t.isIdentifier(test, { name: 'value' })) return true
  if (
    t.isBinaryExpression(test) &&
    ['==', '===', '!=', '!=='].includes(test.operator)
  ) {
    const isValue = (e: t.Expression) => t.isIdentifier(e, { name: 'value' })
    const isNullishLit = (e: t.Expression) =>
      t.isNullLiteral(e) || (t.isIdentifier(e) && e.name === 'undefined')
    return (
      (isValue(test.left) && isNullishLit(test.right)) ||
      (isValue(test.right) && isNullishLit(test.left))
    )
  }
  if (
    t.isUnaryExpression(test) &&
    test.operator === '!' &&
    t.isIdentifier(test.argument, { name: 'value' })
  )
    return true
  if (t.isLogicalExpression(test)) {
    return (
      testBranchesOnValueNullish(test.left) ||
      testBranchesOnValueNullish(test.right)
    )
  }
  return false
}

export function expressionAccessesValueProperties(
  expr: t.Expression | null | undefined,
  setupStmts: readonly t.Statement[] | null | undefined,
  valueId = 'value',
): boolean {
  const body: t.Statement[] = [...(setupStmts ?? [])]
  if (expr) body.push(t.expressionStatement(expr))
  const program = t.program([t.blockStatement(body)])
  let found = false
  traverse(program, {
    noScope: true,
    MemberExpression(path: NodePath<t.MemberExpression>) {
      if (found) return
      let obj: t.Expression = path.node.object as t.Expression
      while (t.isParenthesizedExpression(obj)) obj = obj.expression
      while (t.isTSAsExpression(obj) || t.isTSSatisfiesExpression(obj))
        obj = obj.expression
      if (t.isIdentifier(obj, { name: valueId })) {
        found = true
        path.stop()
      }
    },
  })
  return found
}

// ─── Pruning helpers ────────────────────────────────────────────────

export function pruneDeadParamDestructuring(
  statements: t.Statement[],
  additionalNodes?: t.Node[],
): t.Statement[] {
  return statements.filter((stmt, i) => {
    if (!t.isVariableDeclaration(stmt)) return true
    const decl = stmt.declarations[0]
    if (!decl || !t.isObjectPattern(decl.id)) return true
    if (
      !t.isMemberExpression(decl.init) ||
      !t.isThisExpression(decl.init.object) ||
      !t.isIdentifier(decl.init.property, { name: 'props' })
    )
      return true

    const boundNames = new Set<string>()
    for (const prop of decl.id.properties) {
      if (t.isObjectProperty(prop) && t.isIdentifier(prop.value))
        boundNames.add(prop.value.name)
      else if (t.isRestElement(prop) && t.isIdentifier(prop.argument))
        boundNames.add(prop.argument.name)
    }

    const referencedInRest = collectAllIdentifierNames(
      statements,
      i + 1,
      additionalNodes,
    )

    const usedNames = [...boundNames].filter((n) => referencedInRest.has(n))
    if (usedNames.length === 0) return false

    decl.id.properties = decl.id.properties.filter((prop) => {
      if (t.isRestElement(prop)) return true
      if (t.isObjectProperty(prop)) {
        const key = t.isIdentifier(prop.key)
          ? prop.key.name
          : t.isStringLiteral(prop.key)
            ? prop.key.value
            : null
        return key ? referencedInRest.has(key) : true
      }
      return true
    })
    return decl.id.properties.length > 0
  })
}

function collectAllIdentifierNames(
  statements: t.Statement[],
  fromIndex: number,
  additionalNodes?: t.Node[],
): Set<string> {
  const names = new Set<string>()
  const walk = (node: t.Node | null | undefined): void => {
    if (!node || typeof node !== 'object' || !('type' in node)) return
    if (t.isIdentifier(node)) {
      names.add(node.name)
      return
    }
    if (
      (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) &&
      !node.computed
    ) {
      walk(node.object)
      return
    }
    if (t.isVariableDeclarator(node)) {
      walk(node.init)
      return
    }
    for (const key of t.VISITOR_KEYS[node.type] || []) {
      const child = (node as any)[key]
      if (Array.isArray(child)) {
        for (const c of child)
          if (c && typeof c === 'object' && 'type' in c) walk(c as t.Node)
      } else if (child && typeof child === 'object' && 'type' in child) {
        walk(child as t.Node)
      }
    }
  }
  for (let j = fromIndex; j < statements.length; j++) walk(statements[j])
  if (additionalNodes) for (const node of additionalNodes) walk(node)
  return names
}

export function pruneUnusedSetupDestructuring(
  setupStatements: t.Statement[],
  bodyNodes: t.Node[],
): t.Statement[] {
  return setupStatements.filter((stmt, i) => {
    if (!t.isVariableDeclaration(stmt)) return true
    const decl = stmt.declarations[0]
    if (!decl) return true

    const usedNames = collectAllIdentifierNames(
      setupStatements,
      i + 1,
      bodyNodes,
    )

    if (t.isObjectPattern(decl.id)) {
      decl.id.properties = decl.id.properties.filter((prop) => {
        if (t.isRestElement(prop)) return true
        if (t.isObjectProperty(prop)) {
          const valueName = t.isIdentifier(prop.value)
            ? prop.value.name
            : null
          return valueName ? usedNames.has(valueName) : true
        }
        return true
      })
      return decl.id.properties.length > 0
    }

    if (t.isIdentifier(decl.id)) {
      return usedNames.has(decl.id.name)
    }

    return true
  })
}

// ─── Early-return guard helpers ─────────────────────────────────────

export function earlyReturnFalsyBindingName(
  guard: t.Expression,
): string | null {
  if (
    t.isUnaryExpression(guard) &&
    guard.operator === '!' &&
    t.isIdentifier(guard.argument)
  )
    return guard.argument.name
  if (
    t.isBinaryExpression(guard) &&
    (guard.operator === '==' || guard.operator === '===')
  ) {
    const nullish = (e: t.Expression) =>
      t.isNullLiteral(e) || (t.isIdentifier(e) && e.name === 'undefined')
    if (t.isIdentifier(guard.left) && nullish(guard.right))
      return guard.left.name
    if (t.isIdentifier(guard.right) && nullish(guard.left))
      return guard.right.name
  }
  if (t.isLogicalExpression(guard) && guard.operator === '||') {
    return (
      earlyReturnFalsyBindingName(guard.left) ||
      earlyReturnFalsyBindingName(guard.right)
    )
  }
  return null
}

// ─── Optionalize member chains ──────────────────────────────────────

export function optionalizeMemberChainsFromBindingRoot(
  expr: t.Expression,
  rootName: string,
): t.Expression {
  const visit = (e: t.Expression): t.Expression => {
    if (t.isMemberExpression(e) && !e.computed) {
      const obj = visit(e.object as t.Expression)
      if (t.isIdentifier(e.object, { name: rootName }))
        return t.optionalMemberExpression(
          e.object,
          e.property as t.Identifier,
          false,
          true,
        )
      if (t.isOptionalMemberExpression(obj))
        return t.optionalMemberExpression(
          obj,
          e.property as t.Identifier,
          false,
          true,
        )
      return t.memberExpression(obj, e.property, false)
    }
    if (t.isOptionalMemberExpression(e))
      return t.optionalMemberExpression(
        visit(e.object as t.Expression),
        e.property as t.Expression,
        e.computed,
        e.optional,
      )
    if (t.isOptionalCallExpression(e))
      return t.optionalCallExpression(
        visit(e.callee as t.Expression),
        e.arguments.map((a) =>
          (t.isExpression(a) ? visit(a) : a) as t.Expression,
        ),
        e.optional,
      )
    if (t.isCallExpression(e))
      return t.callExpression(
        visit(e.callee as t.Expression),
        e.arguments.map((a) =>
          (t.isExpression(a) ? visit(a) : a) as t.Expression,
        ),
      )
    if (t.isConditionalExpression(e))
      return t.conditionalExpression(
        visit(e.test),
        visit(e.consequent),
        visit(e.alternate),
      )
    if (t.isLogicalExpression(e))
      return t.logicalExpression(
        e.operator,
        visit(e.left as t.Expression),
        visit(e.right as t.Expression),
      )
    if (t.isBinaryExpression(e))
      return t.binaryExpression(
        e.operator,
        visit(e.left as t.Expression),
        visit(e.right as t.Expression),
      )
    if (t.isUnaryExpression(e))
      return t.unaryExpression(
        e.operator,
        visit(e.argument as t.Expression),
        e.prefix,
      )
    if (t.isSequenceExpression(e))
      return t.sequenceExpression(
        e.expressions.map((x) => visit(x as t.Expression)),
      )
    if (t.isAssignmentExpression(e))
      return t.assignmentExpression(
        e.operator,
        e.left as t.LVal,
        visit(e.right as t.Expression),
      )
    if (t.isArrayExpression(e))
      return t.arrayExpression(
        e.elements.map((el) => {
          if (el === null) return null
          if (t.isSpreadElement(el)) return t.spreadElement(visit(el.argument))
          return visit(el as t.Expression)
        }),
      )
    if (t.isObjectExpression(e))
      return t.objectExpression(
        e.properties.map((p) => {
          if (t.isSpreadElement(p)) return t.spreadElement(visit(p.argument))
          if (t.isObjectProperty(p))
            return t.objectProperty(
              p.computed
                ? (visit(p.key as t.Expression) as
                    | t.Expression
                    | t.Identifier
                    | t.StringLiteral)
                : p.key,
              visit(p.value as t.Expression),
              p.computed,
              p.shorthand,
            )
          return p
        }),
      )
    if (t.isTemplateLiteral(e))
      return t.templateLiteral(
        e.quasis,
        e.expressions.map((x) => visit(x as t.Expression)),
      )
    if (t.isTaggedTemplateExpression(e))
      return t.taggedTemplateExpression(
        visit(e.tag as t.Expression),
        visit(e.quasi) as t.TemplateLiteral,
      )
    if (t.isNewExpression(e))
      return t.newExpression(
        visit(e.callee as t.Expression),
        e.arguments.map((a) =>
          (t.isExpression(a) ? visit(a) : a) as t.Expression,
        ),
      )
    return e
  }
  return visit(expr)
}

export function optionalizeBindingRootInStatements(
  stmts: t.Statement[],
  rootName: string,
): t.Statement[] {
  const mapStmt = (s: t.Statement): t.Statement => {
    if (t.isVariableDeclaration(s))
      return t.variableDeclaration(
        s.kind,
        s.declarations.map((d) =>
          t.variableDeclarator(
            d.id,
            d.init
              ? optionalizeMemberChainsFromBindingRoot(d.init, rootName)
              : null,
          ),
        ),
      )
    if (t.isExpressionStatement(s))
      return t.expressionStatement(
        optionalizeMemberChainsFromBindingRoot(s.expression, rootName),
      )
    if (t.isReturnStatement(s))
      return t.returnStatement(
        s.argument
          ? optionalizeMemberChainsFromBindingRoot(s.argument, rootName)
          : null,
      )
    if (t.isBlockStatement(s)) return t.blockStatement(s.body.map(mapStmt))
    if (t.isIfStatement(s))
      return t.ifStatement(
        optionalizeMemberChainsFromBindingRoot(s.test, rootName),
        mapStmt(s.consequent) as t.Statement,
        s.alternate ? (mapStmt(s.alternate) as t.Statement) : null,
      )
    return s
  }
  return stmts.map((s) => mapStmt(t.cloneNode(s, true) as t.Statement))
}

export function optionalizeMemberChainsAfterComputedItemKey(
  expr: t.Expression,
  itemKeyName: string,
): t.Expression {
  const visit = (e: t.Expression): t.Expression => {
    if (t.isMemberExpression(e) && !e.computed) {
      const origObj = e.object as t.Expression
      const inner = visit(origObj)
      if (
        t.isMemberExpression(origObj) &&
        origObj.computed &&
        t.isIdentifier(origObj.property, { name: itemKeyName })
      ) {
        return t.optionalMemberExpression(
          inner,
          e.property as t.Identifier,
          false,
          true,
        )
      }
      if (t.isOptionalMemberExpression(inner))
        return t.optionalMemberExpression(
          inner,
          e.property as t.Identifier,
          false,
          true,
        )
      return t.memberExpression(inner, e.property, false)
    }
    if (t.isMemberExpression(e) && e.computed)
      return t.memberExpression(
        visit(e.object as t.Expression),
        visit(e.property as t.Expression) as t.Expression,
        true,
      )
    if (t.isOptionalMemberExpression(e))
      return t.optionalMemberExpression(
        visit(e.object as t.Expression),
        e.property as t.Expression,
        e.computed,
        e.optional,
      )
    if (t.isOptionalCallExpression(e))
      return t.optionalCallExpression(
        visit(e.callee as t.Expression),
        e.arguments.map((a) =>
          (t.isExpression(a) ? visit(a) : a) as t.Expression,
        ),
        e.optional,
      )
    if (t.isCallExpression(e))
      return t.callExpression(
        visit(e.callee as t.Expression),
        e.arguments.map((a) =>
          (t.isExpression(a) ? visit(a) : a) as t.Expression,
        ),
      )
    if (t.isConditionalExpression(e))
      return t.conditionalExpression(
        visit(e.test),
        visit(e.consequent),
        visit(e.alternate),
      )
    if (t.isLogicalExpression(e))
      return t.logicalExpression(
        e.operator,
        visit(e.left as t.Expression),
        visit(e.right as t.Expression),
      )
    if (t.isBinaryExpression(e))
      return t.binaryExpression(
        e.operator,
        visit(e.left as t.Expression),
        visit(e.right as t.Expression),
      )
    if (t.isUnaryExpression(e))
      return t.unaryExpression(
        e.operator,
        visit(e.argument as t.Expression),
        e.prefix,
      )
    if (t.isSequenceExpression(e))
      return t.sequenceExpression(
        e.expressions.map((x) => visit(x as t.Expression)),
      )
    if (t.isAssignmentExpression(e))
      return t.assignmentExpression(
        e.operator,
        e.left as t.LVal,
        visit(e.right as t.Expression),
      )
    if (t.isArrayExpression(e))
      return t.arrayExpression(
        e.elements.map((el) => {
          if (el === null) return null
          if (t.isSpreadElement(el)) return t.spreadElement(visit(el.argument))
          return visit(el as t.Expression)
        }),
      )
    if (t.isObjectExpression(e))
      return t.objectExpression(
        e.properties.map((p) => {
          if (t.isSpreadElement(p)) return t.spreadElement(visit(p.argument))
          if (t.isObjectProperty(p))
            return t.objectProperty(
              p.computed
                ? (visit(p.key as t.Expression) as
                    | t.Expression
                    | t.Identifier
                    | t.StringLiteral)
                : p.key,
              visit(p.value as t.Expression),
              p.computed,
              p.shorthand,
            )
          return p
        }),
      )
    if (t.isTemplateLiteral(e))
      return t.templateLiteral(
        e.quasis,
        e.expressions.map((x) => visit(x as t.Expression)),
      )
    if (t.isTaggedTemplateExpression(e))
      return t.taggedTemplateExpression(
        visit(e.tag as t.Expression),
        visit(e.quasi) as t.TemplateLiteral,
      )
    if (t.isNewExpression(e))
      return t.newExpression(
        visit(e.callee as t.Expression),
        e.arguments.map((a) =>
          (t.isExpression(a) ? visit(a) : a) as t.Expression,
        ),
      )
    if (t.isParenthesizedExpression(e))
      return t.parenthesizedExpression(visit(e.expression))
    return e
  }
  return visit(expr)
}

export function optionalizeComputedItemKeyInStatements(
  stmts: t.Statement[],
  itemKeyName: string,
): t.Statement[] {
  const mapStmt = (s: t.Statement): t.Statement => {
    if (t.isVariableDeclaration(s))
      return t.variableDeclaration(
        s.kind,
        s.declarations.map((d) =>
          t.variableDeclarator(
            d.id,
            d.init
              ? optionalizeMemberChainsAfterComputedItemKey(d.init, itemKeyName)
              : null,
          ),
        ),
      )
    if (t.isExpressionStatement(s))
      return t.expressionStatement(
        optionalizeMemberChainsAfterComputedItemKey(s.expression, itemKeyName),
      )
    if (t.isReturnStatement(s))
      return t.returnStatement(
        s.argument
          ? optionalizeMemberChainsAfterComputedItemKey(s.argument, itemKeyName)
          : null,
      )
    if (t.isBlockStatement(s)) return t.blockStatement(s.body.map(mapStmt))
    if (t.isIfStatement(s))
      return t.ifStatement(
        optionalizeMemberChainsAfterComputedItemKey(s.test, itemKeyName),
        mapStmt(s.consequent) as t.Statement,
        s.alternate ? (mapStmt(s.alternate) as t.Statement) : null,
      )
    return s
  }
  return stmts.map((s) => mapStmt(t.cloneNode(s, true) as t.Statement))
}

// ─── Post-processing: this.id caching ───────────────────────────────

export function cacheThisIdInMethod(method: t.ClassMethod): boolean {
  let found = false
  const replaceIn = (node: t.Node): void => {
    if (!node || typeof node !== 'object') return
    const keys = t.VISITOR_KEYS[node.type]
    if (!keys) return
    for (const key of keys) {
      const child = (node as any)[key]
      if (Array.isArray(child)) {
        for (let i = 0; i < child.length; i++) {
          const c = child[i]
          if (isThisIdMember(c)) {
            child[i] = t.identifier('__id')
            found = true
          } else {
            replaceIn(c)
          }
        }
      } else if (child && typeof child === 'object' && child.type) {
        if (isThisIdMember(child)) {
          ;(node as any)[key] = t.identifier('__id')
          found = true
        } else {
          replaceIn(child)
        }
      }
    }
  }
  replaceIn(method.body)
  if (found) {
    method.body.body.unshift(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier('__id'),
          t.memberExpression(t.thisExpression(), t.identifier('id')),
        ),
      ]),
    )
  }
  return found
}

function isThisIdMember(node: t.Node): boolean {
  return (
    t.isMemberExpression(node) &&
    t.isThisExpression(node.object) &&
    t.isIdentifier(node.property, { name: 'id' }) &&
    !node.computed
  )
}

// ─── Post-processing: events getter cache ───────────────────────────

export function wrapEventsGetterWithCache(getter: t.ClassMethod): void {
  const body = getter.body.body
  const returnStmt = body.find(
    (s): s is t.ReturnStatement =>
      t.isReturnStatement(s) && s.argument !== null,
  )
  if (!returnStmt?.argument) return

  const cachedProp = t.memberExpression(
    t.thisExpression(),
    t.identifier('__evts'),
  )
  const elementProp = t.memberExpression(
    t.thisExpression(),
    t.identifier('element_'),
  )
  const tmpId = t.identifier('__geaEvtsResult')
  const objectExpr = returnStmt.argument as t.Expression

  const returnIndex = body.indexOf(returnStmt)
  body.splice(
    returnIndex,
    1,
    t.variableDeclaration('const', [t.variableDeclarator(tmpId, objectExpr)]),
    t.ifStatement(
      elementProp,
      t.expressionStatement(
        t.assignmentExpression('=', cachedProp, t.cloneNode(tmpId, true)),
      ),
    ),
    t.returnStatement(t.cloneNode(tmpId, true)),
  )

  body.unshift(
    t.ifStatement(
      t.logicalExpression('&&', cachedProp, elementProp),
      t.returnStatement(t.cloneNode(cachedProp, true)),
    ),
  )
}

// ─── Post-processing: subpath cache guards ──────────────────────────

function serializeKeyGuardForSubpath(
  test: t.Expression,
): string | null {
  if (
    t.isBinaryExpression(test) &&
    test.operator === '===' &&
    t.isIdentifier(test.left, { name: 'key' }) &&
    t.isStringLiteral(test.right)
  )
    return test.right.value
  if (t.isLogicalExpression(test) && test.operator === '||') {
    const parts: string[] = []
    const collect = (node: t.Expression): boolean => {
      if (t.isLogicalExpression(node) && node.operator === '||')
        return collect(node.left) && collect(node.right)
      if (
        t.isBinaryExpression(node) &&
        node.operator === '===' &&
        t.isIdentifier(node.left, { name: 'key' }) &&
        t.isStringLiteral(node.right)
      ) {
        parts.push(node.right.value)
        return true
      }
      return false
    }
    if (collect(test) && parts.length > 0) return parts.sort().join('|')
  }
  return null
}

function isPropKeyGuardTest(test: t.Expression): boolean {
  return serializeKeyGuardForSubpath(test) !== null
}

function isValueNullishGuard(test: t.Expression): boolean {
  if (!t.isUnaryExpression(test) || test.operator !== '!') return false
  const arg = test.argument
  if (!t.isLogicalExpression(arg) || arg.operator !== '||') return false
  const { left, right } = arg
  const isNullCheck =
    t.isBinaryExpression(left) &&
    left.operator === '===' &&
    t.isIdentifier(left.left, { name: 'value' }) &&
    t.isNullLiteral(left.right)
  const isUndefCheck =
    t.isBinaryExpression(right) &&
    right.operator === '===' &&
    t.isIdentifier(right.left, { name: 'value' }) &&
    t.isIdentifier(right.right, { name: 'undefined' })
  return isNullCheck && isUndefCheck
}

export function collectValueSubpaths(node: t.Node): Set<string> {
  const set = new Set<string>()
  const visit = (n: t.Node | null | undefined): void => {
    if (!n || typeof n !== 'object') return
    if (t.isMemberExpression(n) && !n.computed) {
      if (
        t.isIdentifier(n.object, { name: 'value' }) &&
        t.isIdentifier(n.property)
      )
        set.add(n.property.name)
    }
    if (t.isOptionalMemberExpression(n) && !n.computed) {
      if (
        t.isIdentifier(n.object, { name: 'value' }) &&
        t.isIdentifier(n.property)
      )
        set.add(n.property.name)
    }
    const keys = t.VISITOR_KEYS[n.type]
    if (!keys) return
    for (const key of keys) {
      const child = (n as any)[key]
      if (Array.isArray(child))
        child.forEach((c: any) => c?.type && visit(c))
      else if (child?.type) visit(child)
    }
  }
  visit(node)
  return set
}

function unwrapNullGuardBlock(
  block: t.BlockStatement,
): { inner: t.BlockStatement; hadNullGuard: boolean } {
  if (
    block.body.length === 1 &&
    t.isIfStatement(block.body[0]) &&
    isValueNullishGuard(block.body[0].test) &&
    !block.body[0].alternate
  ) {
    const inner = block.body[0].consequent
    if (t.isBlockStatement(inner)) return { inner, hadNullGuard: true }
    return { inner: t.blockStatement([inner]), hadNullGuard: true }
  }
  return { inner: block, hadNullGuard: false }
}

function replaceValueSubpropRoots(
  node: t.Node,
  subProp: string,
  local: string,
): t.Node {
  const cloned = t.cloneNode(node, true)
  replaceInPlace(cloned, subProp, local)
  return cloned
}

function replaceInPlace(
  node: t.Node,
  subProp: string,
  local: string,
): void {
  const keys = t.VISITOR_KEYS[node.type]
  if (!keys) return
  for (const key of keys) {
    const child = (node as any)[key]
    if (Array.isArray(child)) {
      for (let i = 0; i < child.length; i++) {
        const c = child[i]
        if (!c || typeof c !== 'object' || !c.type) continue
        if (isValueSubpropMatch(c, subProp)) {
          child[i] = t.identifier(local)
        } else {
          replaceInPlace(c, subProp, local)
        }
      }
    } else if (child && typeof child === 'object' && child.type) {
      if (isValueSubpropMatch(child, subProp)) {
        ;(node as any)[key] = t.identifier(local)
      } else {
        replaceInPlace(child, subProp, local)
      }
    }
  }
}

function isValueSubpropMatch(node: t.Node, subProp: string): boolean {
  if (t.isMemberExpression(node) && !node.computed)
    return (
      t.isIdentifier(node.object, { name: 'value' }) &&
      t.isIdentifier(node.property, { name: subProp })
    )
  if (t.isOptionalMemberExpression(node) && !node.computed)
    return (
      t.isIdentifier(node.object, { name: 'value' }) &&
      t.isIdentifier(node.property, { name: subProp })
    )
  return false
}

function isValueSubprop(node: t.Node): boolean {
  return (
    t.isMemberExpression(node) &&
    !node.computed &&
    t.isIdentifier(node.object, { name: 'value' }) &&
    t.isIdentifier(node.property)
  )
}

function hoistDuplicateValueSubprops(block: t.BlockStatement): void {
  const counts = new Map<string, number>()
  const collectSubprops = (node: t.Node): void => {
    if (!node || typeof node !== 'object') return
    if (isValueSubprop(node)) {
      const name = (node as t.MemberExpression).property as t.Identifier
      counts.set(name.name, (counts.get(name.name) || 0) + 1)
      return
    }
    if (
      t.isOptionalMemberExpression(node) &&
      !node.computed &&
      t.isIdentifier(node.object, { name: 'value' }) &&
      t.isIdentifier(node.property)
    ) {
      counts.set(
        node.property.name,
        (counts.get(node.property.name) || 0) + 1,
      )
      return
    }
    const keys = t.VISITOR_KEYS[node.type]
    if (!keys) return
    for (const key of keys) {
      const child = (node as any)[key]
      if (Array.isArray(child))
        child.forEach((c: any) => c?.type && collectSubprops(c))
      else if (child?.type) collectSubprops(child)
    }
  }
  collectSubprops(block)

  const duplicates = new Map<string, string>()
  for (const [name, count] of counts) {
    if (count > 1) duplicates.set(name, `__${name}`)
  }
  if (duplicates.size === 0) return

  const replaceSubprops = (node: t.Node): void => {
    if (!node || typeof node !== 'object') return
    const keys = t.VISITOR_KEYS[node.type]
    if (!keys) return
    for (const key of keys) {
      const child = (node as any)[key]
      if (Array.isArray(child)) {
        for (let i = 0; i < child.length; i++) {
          if (isValueSubprop(child[i])) {
            const propName = (
              (child[i] as t.MemberExpression).property as t.Identifier
            ).name
            const local = duplicates.get(propName)
            if (local) child[i] = t.identifier(local)
          } else if (
            t.isOptionalMemberExpression(child[i]) &&
            !child[i].computed &&
            t.isIdentifier(child[i].object, { name: 'value' }) &&
            t.isIdentifier(child[i].property)
          ) {
            const propName = (
              (child[i] as t.OptionalMemberExpression)
                .property as t.Identifier
            ).name
            const local = duplicates.get(propName)
            if (local) child[i] = t.identifier(local)
          } else {
            replaceSubprops(child[i])
          }
        }
      } else if (child?.type) {
        if (isValueSubprop(child)) {
          const propName = (
            (child as t.MemberExpression).property as t.Identifier
          ).name
          const local = duplicates.get(propName)
          if (local) (node as any)[key] = t.identifier(local)
        } else if (
          t.isOptionalMemberExpression(child) &&
          !child.computed &&
          t.isIdentifier(child.object, { name: 'value' }) &&
          t.isIdentifier(child.property)
        ) {
          const propName = child.property.name
          const local = duplicates.get(propName)
          if (local) (node as any)[key] = t.identifier(local)
        } else {
          replaceSubprops(child)
        }
      }
    }
  }
  replaceSubprops(block)

  const decls = [...duplicates].map(([subProp, local]) =>
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(local),
        t.optionalMemberExpression(
          t.identifier('value'),
          t.identifier(subProp),
          false,
          true,
        ),
      ),
    ]),
  )
  block.body.unshift(...decls)
}

// ─── Subpath chunk types ────────────────────────────────────────────

type SubpathChunk =
  | { kind: 'single'; subProp: string; stmts: t.Statement[] }
  | { kind: 'always'; stmts: t.Statement[] }

function containsPropRefreshCall(node: t.Node): boolean {
  if (t.isMemberExpression(node) && t.isIdentifier(node.property)) {
    if (
      node.property.name === '__geaUpdateProps' ||
      node.property.name.startsWith('__refresh')
    )
      return true
  }
  const keys = t.VISITOR_KEYS[node.type]
  if (!keys) return false
  for (const key of keys) {
    const child = (node as any)[key]
    if (Array.isArray(child)) {
      for (const c of child)
        if (c && typeof c === 'object' && c.type && containsPropRefreshCall(c))
          return true
    } else if (child && typeof child === 'object' && child.type) {
      if (containsPropRefreshCall(child)) return true
    }
  }
  return false
}

function zeroPathShouldMergeIntoPrevSingle(stmt: t.Statement): boolean {
  if (containsPropRefreshCall(stmt)) return false
  return true
}

function chunkStatementsInOrder(stmts: t.Statement[]): SubpathChunk[] {
  const chunks: SubpathChunk[] = []
  let currentSingle: { subProp: string; stmts: t.Statement[] } | null = null

  const flushSingle = (): void => {
    if (!currentSingle) return
    chunks.push({
      kind: 'single',
      subProp: currentSingle.subProp,
      stmts: currentSingle.stmts,
    })
    currentSingle = null
  }

  for (const stmt of stmts) {
    const paths = collectValueSubpaths(stmt)
    if (paths.size === 0) {
      if (currentSingle && zeroPathShouldMergeIntoPrevSingle(stmt)) {
        currentSingle.stmts.push(stmt)
      } else {
        flushSingle()
        chunks.push({ kind: 'always', stmts: [stmt] })
      }
      continue
    }
    if (paths.size === 1) {
      const k = [...paths][0]!
      if (currentSingle && currentSingle.subProp !== k) flushSingle()
      if (!currentSingle) {
        currentSingle = { subProp: k, stmts: [stmt] }
      } else {
        currentSingle.stmts.push(stmt)
      }
      continue
    }
    flushSingle()
    chunks.push({ kind: 'always', stmts: [stmt] })
  }
  flushSingle()
  return chunks
}

function stripPerStatementNullGuards(
  stmts: t.Statement[],
): { stmts: t.Statement[]; allHadGuards: boolean } {
  const result: t.Statement[] = []
  let guardCount = 0
  for (const stmt of stmts) {
    const stripped = stripNullGuardPreservingBlock(stmt)
    if (stripped) {
      result.push(stripped)
      guardCount++
    } else {
      result.push(stmt)
    }
  }
  return {
    stmts: result,
    allHadGuards: stmts.length > 0 && guardCount === stmts.length,
  }
}

function stripNullGuardPreservingBlock(
  stmt: t.Statement,
): t.Statement | null {
  if (
    t.isBlockStatement(stmt) &&
    stmt.body.length === 1 &&
    t.isIfStatement(stmt.body[0])
  ) {
    const ifStmt = stmt.body[0]
    if (ifStmt.alternate || !isValueNullishGuard(ifStmt.test)) return null
    const body = t.isBlockStatement(ifStmt.consequent)
      ? ifStmt.consequent.body
      : [ifStmt.consequent]
    return t.blockStatement(body)
  }
  if (
    t.isIfStatement(stmt) &&
    !stmt.alternate &&
    isValueNullishGuard(stmt.test)
  ) {
    const body = t.isBlockStatement(stmt.consequent)
      ? stmt.consequent.body
      : [stmt.consequent]
    return t.blockStatement(body)
  }
  return null
}

function countIdentifierRefs(node: t.Node, name: string): number {
  let count = 0
  const visit = (n: t.Node | null | undefined): void => {
    if (!n || typeof n !== 'object') return
    if (t.isIdentifier(n) && n.name === name) count++
    const keys = t.VISITOR_KEYS[n.type]
    if (!keys) return
    for (const key of keys) {
      const child = (n as any)[key]
      if (Array.isArray(child))
        child.forEach((c: any) => c?.type && visit(c))
      else if (child?.type) visit(child)
    }
  }
  visit(node)
  return count
}

function isPureExpression(expr: t.Expression): boolean {
  if (t.isLiteral(expr)) return true
  if (t.isIdentifier(expr)) return true
  if (t.isMemberExpression(expr))
    return (
      isPureExpression(expr.object as t.Expression) &&
      (!expr.computed || isPureExpression(expr.property as t.Expression))
    )
  if (t.isOptionalMemberExpression(expr))
    return (
      isPureExpression(expr.object as t.Expression) &&
      (!expr.computed || isPureExpression(expr.property as t.Expression))
    )
  if (t.isConditionalExpression(expr))
    return (
      isPureExpression(expr.test) &&
      isPureExpression(expr.consequent as t.Expression) &&
      isPureExpression(expr.alternate as t.Expression)
    )
  if (t.isBinaryExpression(expr) || t.isLogicalExpression(expr))
    return isPureExpression(expr.left) && isPureExpression(expr.right)
  if (t.isUnaryExpression(expr)) return isPureExpression(expr.argument)
  if (t.isArrayExpression(expr))
    return expr.elements.every(
      (e) => e == null || (t.isExpression(e) && isPureExpression(e)),
    )
  if (t.isObjectExpression(expr))
    return expr.properties.every((p) => {
      if (t.isObjectProperty(p) && !p.computed)
        return t.isExpression(p.value) && isPureExpression(p.value)
      if (t.isSpreadElement(p)) return isPureExpression(p.argument)
      return false
    })
  if (t.isTemplateLiteral(expr))
    return expr.expressions.every((e) => isPureExpression(e))
  if (t.isSequenceExpression(expr))
    return expr.expressions.every((e) => isPureExpression(e))
  return false
}

function replaceIdentifierWithClonedExpr(
  node: t.Node,
  name: string,
  expr: t.Expression,
): void {
  const keys = t.VISITOR_KEYS[node.type]
  if (!keys) return
  for (const key of keys) {
    const child = (node as any)[key]
    if (Array.isArray(child)) {
      for (let i = 0; i < child.length; i++) {
        const c = child[i]
        if (c && t.isIdentifier(c) && c.name === name) {
          child[i] = t.cloneNode(expr, true)
        } else if (c?.type) replaceIdentifierWithClonedExpr(c, name, expr)
      }
    } else if (child && typeof child === 'object' && child.type) {
      if (t.isIdentifier(child) && child.name === name) {
        ;(node as any)[key] = t.cloneNode(expr, true)
      } else {
        replaceIdentifierWithClonedExpr(child, name, expr)
      }
    }
  }
}

function renameIdentifier(node: t.Node, from: string, to: string): void {
  if (t.isIdentifier(node) && node.name === from) {
    node.name = to
    return
  }
  const keys = t.VISITOR_KEYS[node.type]
  if (!keys) return
  for (const key of keys) {
    const child = (node as any)[key]
    if (Array.isArray(child)) {
      for (const c of child)
        if (c && typeof c === 'object' && c.type) renameIdentifier(c, from, to)
    } else if (child && typeof child === 'object' && child.type) {
      renameIdentifier(child, from, to)
    }
  }
}

function optimizeBoundValueAliasesInSequence(
  stmts: t.Statement[],
): t.Statement[] {
  const out = [...stmts]
  let changed = true
  while (changed) {
    changed = false
    const idx = out.findIndex(
      (s) =>
        t.isVariableDeclaration(s) &&
        s.declarations.length === 1 &&
        t.isIdentifier(s.declarations[0].id, { name: '__boundValue' }),
    )
    if (idx === -1) break

    const decl = out[idx] as t.VariableDeclaration
    const init = decl.declarations[0].init
    if (!init) break

    if (t.isIdentifier(init)) {
      const aliasedName = init.name
      out.splice(idx, 1)
      const blk = t.blockStatement(out)
      renameIdentifier(blk, '__boundValue', aliasedName)
      out.length = 0
      out.push(...blk.body)
      changed = true
      continue
    }

    if (!t.isExpression(init) || !isPureExpression(init)) break

    const probe = t.blockStatement([
      ...out.slice(0, idx),
      ...out.slice(idx + 1),
    ])
    if (countIdentifierRefs(probe, '__boundValue') !== 1) break

    out.splice(idx, 1)
    const blk = t.blockStatement(out)
    replaceIdentifierWithClonedExpr(blk, '__boundValue', init)
    out.length = 0
    out.push(...blk.body)
    changed = true
  }
  return out
}

function eliminateDeadBoundValueAlias(stmt: t.Statement): t.Statement {
  if (!t.isBlockStatement(stmt) && !t.isIfStatement(stmt)) return stmt
  const stmts = t.isBlockStatement(stmt)
    ? stmt.body
    : t.isBlockStatement(stmt.consequent)
      ? stmt.consequent.body
      : null
  if (!stmts) return stmt

  const declIdxIdent = stmts.findIndex(
    (s) =>
      t.isVariableDeclaration(s) &&
      s.declarations.length === 1 &&
      t.isIdentifier(s.declarations[0].id, { name: '__boundValue' }) &&
      t.isIdentifier(s.declarations[0].init),
  )
  if (declIdxIdent !== -1) {
    const decl = stmts[declIdxIdent] as t.VariableDeclaration
    const aliasedName = (decl.declarations[0].init as t.Identifier).name
    stmts.splice(declIdxIdent, 1)
    renameIdentifier(stmt, '__boundValue', aliasedName)
    return stmt
  }

  const declIdx = stmts.findIndex(
    (s) =>
      t.isVariableDeclaration(s) &&
      s.declarations.length === 1 &&
      t.isIdentifier(s.declarations[0].id, { name: '__boundValue' }) &&
      s.declarations[0].init != null &&
      t.isExpression(s.declarations[0].init as t.Node),
  )
  if (declIdx === -1) return stmt

  const decl = stmts[declIdx] as t.VariableDeclaration
  const init = decl.declarations[0].init as t.Expression
  if (!isPureExpression(init)) return stmt

  const tmpBody = [...stmts.slice(0, declIdx), ...stmts.slice(declIdx + 1)]
  const probe = t.blockStatement(tmpBody)
  if (countIdentifierRefs(probe, '__boundValue') !== 1) return stmt

  stmts.splice(declIdx, 1)
  replaceIdentifierWithClonedExpr(stmt, '__boundValue', init)

  return stmt
}

export function wrapSubpathCacheGuards(
  method: t.ClassMethod,
  pcCounter: { value: number },
  classBody?: t.ClassBody,
): void {
  for (const stmt of method.body.body) {
    if (!t.isIfStatement(stmt) || !isPropKeyGuardTest(stmt.test)) continue
    const block = t.isBlockStatement(stmt.consequent)
      ? stmt.consequent
      : null
    if (!block) continue

    const { inner, hadNullGuard } = unwrapNullGuardBlock(block)

    if (hadNullGuard) {
      hoistDuplicateValueSubprops(block)
      continue
    }

    const { stmts: stripped, allHadGuards } = stripPerStatementNullGuards(
      inner.body,
    )
    const chunks = chunkStatementsInOrder(stripped)

    const singleSubProps = new Set(
      chunks
        .filter(
          (c): c is Extract<SubpathChunk, { kind: 'single' }> =>
            c.kind === 'single',
        )
        .map((c) => c.subProp),
    )
    const hasAlwaysChunk = chunks.some((c) => c.kind === 'always')
    const shouldWrap =
      singleSubProps.size > 0 && (singleSubProps.size >= 2 || hasAlwaysChunk)

    if (!shouldWrap) {
      hoistDuplicateValueSubprops(block)
      continue
    }

    const newInnerBody: t.Statement[] = []
    const pendingCacheFields: string[] = []
    for (const ch of chunks) {
      if (ch.kind === 'always') {
        newInnerBody.push(...ch.stmts)
        continue
      }
      const { subProp, stmts } = ch
      const idx = pcCounter.value++
      const cacheId = `__pc${idx}`
      const local = `__${subProp}_${idx}`
      const cacheMember = t.memberExpression(
        t.thisExpression(),
        t.identifier(cacheId),
      )

      if (classBody) pendingCacheFields.push(cacheId)

      newInnerBody.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier(local),
            allHadGuards
              ? t.memberExpression(
                  t.identifier('value'),
                  t.identifier(subProp),
                )
              : t.optionalMemberExpression(
                  t.identifier('value'),
                  t.identifier(subProp),
                  false,
                  true,
                ),
          ),
        ]),
      )

      let patched = stmts.map(
        (s) => replaceValueSubpropRoots(s, subProp, local) as t.Statement,
      )
      patched = optimizeBoundValueAliasesInSequence(patched)
      patched = patched.map(eliminateDeadBoundValueAlias)

      const cacheTest = classBody
        ? t.binaryExpression('!==', cacheMember, t.identifier(local))
        : t.logicalExpression(
            '||',
            t.unaryExpression(
              '!',
              t.callExpression(
                t.memberExpression(
                  t.identifier('Object'),
                  t.identifier('hasOwn'),
                ),
                [t.thisExpression(), t.stringLiteral(cacheId)],
              ),
            ),
            t.unaryExpression(
              '!',
              t.callExpression(
                t.memberExpression(
                  t.identifier('Object'),
                  t.identifier('is'),
                ),
                [cacheMember, t.identifier(local)],
              ),
            ),
          )

      newInnerBody.push(
        t.ifStatement(
          cacheTest,
          t.blockStatement([
            t.expressionStatement(
              t.assignmentExpression('=', cacheMember, t.identifier(local)),
            ),
            ...patched,
          ]),
        ),
      )
    }

    if (allHadGuards) {
      block.body = [
        t.ifStatement(
          t.binaryExpression('!=', t.identifier('value'), t.nullLiteral()),
          t.blockStatement(newInnerBody),
        ),
      ]
    } else {
      inner.body = newInnerBody
    }

    for (const cacheId of pendingCacheFields) {
      classBody!.body.push(
        t.classProperty(t.identifier(cacheId), t.objectExpression([])),
      )
    }
  }
}

// ─── Logging catch clause ───────────────────────────────────────────

export function loggingCatchClause(
  extra: t.Statement[] = [],
): t.CatchClause {
  return t.catchClause(
    t.identifier('__err'),
    t.blockStatement([
      t.expressionStatement(
        t.callExpression(
          t.memberExpression(t.identifier('console'), t.identifier('error')),
          [t.identifier('__err')],
        ),
      ),
      ...extra,
    ]),
  )
}

// ─── Prop-ref rewriting (internal) ──────────────────────────────────

function replacePropRefsInNode(
  node: t.Node,
  propNames: Set<string>,
  wholeParamName?: string,
  propDefaults?: Map<string, t.Expression>,
): t.Node {
  if (t.isIdentifier(node) && wholeParamName && node.name === wholeParamName)
    return t.memberExpression(t.thisExpression(), t.identifier('props'))
  if (t.isIdentifier(node) && propNames.has(node.name)) {
    const member = t.memberExpression(
      t.memberExpression(t.thisExpression(), t.identifier('props')),
      t.identifier(node.name),
    )
    const def = propDefaults?.get(node.name)
    if (def)
      return t.logicalExpression(
        '??',
        member,
        t.cloneNode(def, true) as t.Expression,
      )
    return member
  }
  const r = (n: t.Node) =>
    replacePropRefsInNode(n, propNames, wholeParamName, propDefaults)
  if (t.isExpressionStatement(node))
    return t.expressionStatement(r(node.expression) as t.Expression)
  if (t.isBlockStatement(node))
    return t.blockStatement(node.body.map((s) => r(s) as t.Statement))
  if (t.isIfStatement(node))
    return t.ifStatement(
      r(node.test) as t.Expression,
      r(node.consequent) as t.Statement,
      node.alternate ? (r(node.alternate) as t.Statement) : null,
    )
  if (t.isReturnStatement(node))
    return t.returnStatement(
      node.argument ? (r(node.argument) as t.Expression) : null,
    )
  if (t.isCallExpression(node))
    return t.callExpression(
      r(node.callee) as t.Expression,
      node.arguments.map((a) =>
        (t.isExpression(a) ? r(a) : a) as t.Expression,
      ),
    )
  if (t.isMemberExpression(node))
    return t.memberExpression(
      r(node.object) as t.Expression,
      node.property,
      node.computed,
    )
  if (t.isOptionalMemberExpression(node))
    return t.optionalMemberExpression(
      r(node.object) as t.Expression,
      node.property as t.Expression,
      node.computed,
      node.optional,
    )
  if (t.isOptionalCallExpression(node))
    return t.optionalCallExpression(
      r(node.callee) as t.Expression,
      node.arguments.map((a) =>
        (t.isExpression(a) ? r(a) : a) as t.Expression,
      ),
      node.optional,
    )
  if (t.isConditionalExpression(node))
    return t.conditionalExpression(
      r(node.test) as t.Expression,
      r(node.consequent) as t.Expression,
      r(node.alternate) as t.Expression,
    )
  if (t.isLogicalExpression(node))
    return t.logicalExpression(
      node.operator,
      r(node.left) as t.Expression,
      r(node.right) as t.Expression,
    )
  if (t.isBinaryExpression(node))
    return t.binaryExpression(
      node.operator,
      r(node.left) as t.Expression,
      r(node.right) as t.Expression,
    )
  if (t.isUnaryExpression(node))
    return t.unaryExpression(
      node.operator,
      r(node.argument) as t.Expression,
      node.prefix,
    )
  if (t.isSequenceExpression(node))
    return t.sequenceExpression(
      node.expressions.map((e) => r(e) as t.Expression),
    )
  if (t.isAssignmentExpression(node))
    return t.assignmentExpression(
      node.operator,
      r(node.left) as t.LVal,
      r(node.right) as t.Expression,
    )
  if (t.isVariableDeclaration(node))
    return t.variableDeclaration(
      node.kind,
      node.declarations.map((d) =>
        t.variableDeclarator(
          d.id,
          d.init ? (r(d.init) as t.Expression) : null,
        ),
      ),
    )
  if (t.isArrowFunctionExpression(node)) {
    const body = t.isBlockStatement(node.body)
      ? t.blockStatement(node.body.body.map((s) => r(s) as t.Statement))
      : (r(node.body) as t.Expression)
    return t.arrowFunctionExpression(node.params, body, node.async)
  }
  if (t.isFunctionExpression(node)) {
    const body = t.blockStatement(
      node.body.body.map((s) => r(s) as t.Statement),
    )
    return t.functionExpression(
      node.id,
      node.params,
      body,
      node.generator,
      node.async,
    )
  }
  if (t.isTemplateLiteral(node))
    return t.templateLiteral(
      node.quasis,
      node.expressions.map((e) => r(e) as t.Expression),
    )
  if (t.isTaggedTemplateExpression(node))
    return t.taggedTemplateExpression(
      r(node.tag) as t.Expression,
      r(node.quasi) as t.TemplateLiteral,
    )
  if (t.isArrayExpression(node))
    return t.arrayExpression(
      node.elements.map((e) =>
        e === null
          ? null
          : t.isSpreadElement(e)
            ? (r(e) as t.SpreadElement)
            : (r(e) as t.Expression),
      ),
    )
  if (t.isObjectExpression(node))
    return t.objectExpression(
      node.properties.map((p) => {
        if (t.isSpreadElement(p)) return r(p) as t.SpreadElement
        if (t.isObjectProperty(p))
          return t.objectProperty(
            p.computed ? (r(p.key) as t.Expression) : p.key,
            r(p.value) as t.Expression,
            p.computed,
            p.shorthand,
          )
        return p
      }),
    )
  if (t.isSpreadElement(node))
    return t.spreadElement(r(node.argument) as t.Expression)
  if (t.isNewExpression(node))
    return t.newExpression(
      r(node.callee) as t.Expression,
      node.arguments.map((a) =>
        (t.isExpression(a) ? r(a) : a) as t.Expression,
      ),
    )
  if (t.isTryStatement(node)) {
    const block = t.blockStatement(
      node.block.body.map((s) => r(s) as t.Statement),
    )
    const handler = node.handler
      ? t.catchClause(
          node.handler.param,
          t.blockStatement(
            node.handler.body.body.map((s) => r(s) as t.Statement),
          ),
        )
      : null
    const finalizer = node.finalizer
      ? t.blockStatement(
          node.finalizer.body.map((s) => r(s) as t.Statement),
        )
      : null
    return t.tryStatement(block, handler, finalizer)
  }
  if (t.isThrowStatement(node))
    return t.throwStatement(r(node.argument) as t.Expression)
  return node
}
