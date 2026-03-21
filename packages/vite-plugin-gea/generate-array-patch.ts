import * as t from '@babel/types'
import { appendToBody, id, js, jsMethod } from 'eszter'
import type { NodePath } from '@babel/traverse'
import type { ArrayMapBinding } from './ir.ts'
import { normalizePathParts, pathPartsToString, replacePropRefsInExpression } from './utils.ts'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const traverse = require('@babel/traverse').default

interface PatchEntry {
  childPath: number[]
  type: 'text' | 'className' | 'attribute'
  expression: t.Expression
  attributeName?: string
}

interface PatchPlan {
  entries: PatchEntry[]
  requiresRerender: boolean
}

const EVENT_NAMES = new Set([
  'click',
  'dblclick',
  'mousedown',
  'mouseup',
  'mouseover',
  'mouseout',
  'mousemove',
  'keydown',
  'keyup',
  'keypress',
  'focus',
  'blur',
  'input',
  'change',
  'submit',
  'scroll',
  'touchstart',
  'touchmove',
  'touchend',
  'tap',
  'longTap',
  'swipeRight',
  'swipeUp',
  'swipeLeft',
  'swipeDown',
  'dragstart',
  'dragend',
  'dragover',
  'dragleave',
  'drop',
])

function collectItemTemplateProps(template: t.JSXElement | t.JSXFragment, itemVar: string): string[] {
  const props = new Set<string>()
  const program = t.program([t.expressionStatement(t.cloneNode(template, true))])
  traverse(program, {
    noScope: true,
    MemberExpression(path: NodePath<t.MemberExpression>) {
      if (!t.isIdentifier(path.node.object, { name: itemVar })) return
      if (!t.isIdentifier(path.node.property) || path.node.computed) return
      props.add(path.node.property.name)
    },
  })
  return Array.from(props)
}

export function generatePatchItemMethod(arrayMap: ArrayMapBinding): t.ClassMethod | null {
  void arrayMap
  return null
}

export function collectPatchEntries(arrayMap: ArrayMapBinding): PatchPlan {
  const cloned = t.cloneNode(arrayMap.itemTemplate!, true) as t.JSXElement | t.JSXFragment
  const tempFile = t.file(t.program([t.expressionStatement(cloned)]))

  traverse(tempFile, {
    Identifier(path: NodePath<t.Identifier>) {
      if (path.node.name === arrayMap.itemVariable) path.node.name = 'item'
      else if (arrayMap.indexVariable && path.node.name === arrayMap.indexVariable) path.node.name = '__idx'
    },
  })

  const modified = (tempFile.program.body[0] as t.ExpressionStatement).expression
  const entries: PatchEntry[] = []
  const requiresRerender = templateRequiresRerender(tempFile)
  if (t.isJSXElement(modified)) {
    walkJSXForPatch(modified, [], entries)
  }
  return { entries, requiresRerender }
}

function walkJSXForPatch(node: t.JSXElement, path: number[], entries: PatchEntry[]): void {
  for (const attr of node.openingElement.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue
    const name = attr.name.name

    if (name === 'key' || EVENT_NAMES.has(name)) continue

    if (!t.isJSXExpressionContainer(attr.value) || t.isJSXEmptyExpression(attr.value.expression)) continue

    if (name === 'class' || name === 'className') {
      entries.push({
        childPath: [...path],
        type: 'className',
        expression: t.cloneNode(attr.value.expression as t.Expression, true),
      })
    } else if (name !== 'checked') {
      entries.push({
        childPath: [...path],
        type: 'attribute',
        expression: t.cloneNode(attr.value.expression as t.Expression, true),
        attributeName: name,
      })
    }
  }

  let hasElementChild = false
  const textParts: Array<{ raw: string } | { expr: t.Expression }> = []

  for (const child of node.children) {
    if (t.isJSXElement(child)) {
      hasElementChild = true
    } else if (t.isJSXFragment(child)) {
      hasElementChild = true
    } else if (t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression)) {
      textParts.push({ expr: child.expression as t.Expression })
    } else if (t.isJSXText(child)) {
      const raw = child.value
      if (textParts.length > 0 && 'raw' in textParts[textParts.length - 1]) {
        ;(textParts[textParts.length - 1] as { raw: string }).raw += raw
      } else {
        textParts.push({ raw })
      }
    }
  }

  if (!hasElementChild && textParts.length > 0) {
    const hasExpr = textParts.some((p) => 'expr' in p)
    if (hasExpr) {
      const quasis: t.TemplateElement[] = []
      const expressions: t.Expression[] = []
      let currentRaw = ''
      for (const part of textParts) {
        if ('raw' in part) {
          currentRaw += part.raw
        } else {
          quasis.push(t.templateElement({ raw: currentRaw, cooked: currentRaw }, false))
          currentRaw = ''
          expressions.push(t.cloneNode(part.expr, true) as t.Expression)
        }
      }
      quasis.push(t.templateElement({ raw: currentRaw, cooked: currentRaw }, true))
      const templateExpr =
        expressions.length > 0 ? t.templateLiteral(quasis, expressions) : t.stringLiteral(quasis[0]?.value?.raw ?? '')
      entries.push({
        childPath: [...path],
        type: 'text',
        expression: templateExpr,
      })
    }
    return
  }

  let elementIndex = 0
  for (const child of node.children) {
    if (t.isJSXElement(child)) {
      walkJSXForPatch(child, [...path, elementIndex], entries)
      elementIndex++
    }
  }
}

/**
 * Build a DOM navigation expression using firstElementChild/nextElementSibling
 * to reach the element at the given child path. For example:
 *   [0]    → base.firstElementChild
 *   [1]    → base.firstElementChild.nextElementSibling
 *   [1, 0] → base.firstElementChild.nextElementSibling.firstElementChild
 */
function buildElementNavExpr(base: t.Expression, childPath: number[]): t.Expression {
  let expr = base
  for (const idx of childPath) {
    expr = t.memberExpression(expr, t.identifier('firstElementChild'))
    for (let i = 0; i < idx; i++) {
      expr = t.memberExpression(expr, t.identifier('nextElementSibling'))
    }
  }
  return expr
}

interface HoistedVar {
  varName: string
  expression: t.Expression
}

/**
 * Hoist store property reads out of per-item patch expressions so they are
 * evaluated once per batch instead of once per row.
 */
function hoistStoreReads(
  entries: PatchEntry[],
  storeVar: string | undefined,
): { hoists: HoistedVar[]; patchedEntries: PatchEntry[] } {
  if (!storeVar) return { hoists: [], patchedEntries: entries }

  const hoistMap = new Map<string, HoistedVar>()
  let counter = 0

  function replaceStoreReads(expr: t.Expression): t.Expression {
    const cloned = t.cloneNode(expr, true) as t.Expression
    const program = t.program([t.expressionStatement(cloned)])
    traverse(program, {
      noScope: true,
      MemberExpression(path: NodePath<t.MemberExpression>) {
        if (!t.isIdentifier(path.node.object, { name: storeVar })) return
        if (!t.isIdentifier(path.node.property)) return
        if (path.node.computed) return
        const key = `${storeVar}.${path.node.property.name}`
        let hoist = hoistMap.get(key)
        if (!hoist) {
          hoist = { varName: `__h${counter++}`, expression: t.cloneNode(path.node, true) }
          hoistMap.set(key, hoist)
        }
        path.replaceWith(t.identifier(hoist.varName))
      },
    })
    return (program.body[0] as t.ExpressionStatement).expression
  }

  const patchedEntries = entries.map((entry) => ({
    ...entry,
    expression: replaceStoreReads(entry.expression),
  }))

  return { hoists: Array.from(hoistMap.values()), patchedEntries }
}

export function generateCreateItemMethod(
  arrayMap: ArrayMapBinding,
  templatePropNames?: Set<string>,
  wholeParamName?: string,
  templateSetupContext?: { params: Array<t.Identifier | t.Pattern | t.RestElement>; statements: t.Statement[] },
): t.ClassMethod | null {
  if (!arrayMap.itemTemplate) return null
  const arrayPath = pathPartsToString(arrayMap.arrayPathParts || normalizePathParts((arrayMap as any).arrayPath || ''))
  const arrayName = arrayPath.replace(/\./g, '')
  const capName = arrayName.charAt(0).toUpperCase() + arrayName.slice(1)
  const methodName = `create${capName}Item`
  const renderMethodName = `render${capName}Item`
  const containerProp = `__${arrayPath.replace(/\./g, '_')}_container`
  const itemIdProperty = arrayMap.itemIdProperty
  let { entries, requiresRerender } = collectPatchEntries(arrayMap)

  if (arrayMap.callbackBodyStatements?.length) {
    requiresRerender = true
  }

  if (!requiresRerender && templateSetupContext && templateSetupContext.statements.length > 0) {
    const setupVarNames = new Set<string>()
    for (const stmt of templateSetupContext.statements) {
      if (t.isVariableDeclaration(stmt)) {
        for (const decl of stmt.declarations) {
          if (t.isIdentifier(decl.id)) setupVarNames.add(decl.id.name)
          else if (t.isObjectPattern(decl.id)) {
            for (const prop of decl.id.properties) {
              if (t.isObjectProperty(prop) && t.isIdentifier(prop.value)) setupVarNames.add(prop.value.name)
              else if (t.isRestElement(prop) && t.isIdentifier(prop.argument)) setupVarNames.add(prop.argument.name)
            }
          }
        }
      }
    }
    if (setupVarNames.size > 0) {
      const freeVars = new Set<string>()
      for (const entry of entries) {
        traverse(t.expressionStatement(t.cloneNode(entry.expression, true)), {
          noScope: true,
          Identifier(p: NodePath<t.Identifier>) {
            if (t.isMemberExpression(p.parent) && p.parent.property === p.node && !p.parent.computed) return
            freeVars.add(p.node.name)
          },
        })
      }
      for (const name of setupVarNames) {
        if (freeVars.has(name)) {
          requiresRerender = true
          break
        }
      }
    }
  }

  const propNames = templatePropNames ?? new Set<string>()
  if (propNames.size > 0 || wholeParamName) {
    entries = entries.map((e) => ({
      ...e,
      expression: replacePropRefsInExpression(
        t.cloneNode(e.expression, true) as t.Expression,
        propNames,
        wholeParamName,
      ),
    }))
  }

  if (requiresRerender) {
    const createMethod = jsMethod`${id(methodName)}(item) {}`
    if (arrayMap.indexVariable) createMethod.params.push(t.identifier('__idx'))
    const renderArgs: t.Expression[] = [t.identifier('item')]
    if (arrayMap.indexVariable) renderArgs.push(t.identifier('__idx'))
    return appendToBody(
      createMethod,
      js`var __tw = this.${id(containerProp)}.cloneNode(false);`,
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(t.identifier('__tw'), t.identifier('innerHTML')),
          t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(renderMethodName)), renderArgs),
        ),
      ),
      js`var el = __tw.firstElementChild;`,
      t.returnStatement(t.identifier('el')),
    )
  }

  if (entries.length === 0) return null

  const { hoists, patchedEntries } = hoistStoreReads(entries, arrayMap.storeVar)

  const itemProps = collectItemTemplateProps(arrayMap.itemTemplate!, arrayMap.itemVariable)

  const containerRef = t.memberExpression(t.thisExpression(), t.identifier(containerProp))
  const cVar = t.identifier('__c')
  const elVar = t.identifier('el')

  const body: t.Statement[] = []

  body.push(t.variableDeclaration('var', [t.variableDeclarator(cVar, containerRef)]))

  const isPrimitiveKey = !itemIdProperty
  const dummyItem: t.Expression = isPrimitiveKey
    ? t.stringLiteral('__dummy__')
    : (() => {
        const dummyProps: t.ObjectProperty[] = []
        const seen = new Set<string>()
        for (const prop of [itemIdProperty, ...itemProps]) {
          if (seen.has(prop)) continue
          seen.add(prop)
          dummyProps.push(
            t.objectProperty(t.identifier(prop), prop === itemIdProperty ? t.numericLiteral(0) : t.stringLiteral('')),
          )
        }
        return t.objectExpression(dummyProps)
      })()

  const tplInit: t.Statement[] = [
    t.variableDeclaration('var', [
      t.variableDeclarator(
        t.identifier('__tw'),
        t.callExpression(t.memberExpression(cVar, t.identifier('cloneNode')), [t.booleanLiteral(false)]),
      ),
    ]),
    t.expressionStatement(
      t.assignmentExpression(
        '=',
        t.memberExpression(t.identifier('__tw'), t.identifier('innerHTML')),
        t.callExpression(
          t.memberExpression(t.thisExpression(), t.identifier(renderMethodName)),
          arrayMap.indexVariable ? [dummyItem, t.numericLiteral(0)] : [dummyItem],
        ),
      ),
    ),
    t.expressionStatement(
      t.assignmentExpression(
        '=',
        t.memberExpression(cVar, t.identifier('__geaTpl')),
        t.memberExpression(t.identifier('__tw'), t.identifier('firstElementChild')),
      ),
    ),
  ]
  body.push(
    t.ifStatement(
      t.unaryExpression('!', t.memberExpression(cVar, t.identifier('__geaTpl'))),
      t.blockStatement([t.tryStatement(t.blockStatement(tplInit), t.catchClause(null, t.blockStatement([])))]),
    ),
  )

  if (arrayMap.containerBindingId) {
    body.push(
      t.ifStatement(
        t.unaryExpression('!', t.memberExpression(cVar, t.identifier('__geaIdPfx'))),
        t.expressionStatement(
          t.assignmentExpression(
            '=',
            t.memberExpression(cVar, t.identifier('__geaIdPfx')),
            t.binaryExpression(
              '+',
              t.memberExpression(t.thisExpression(), t.identifier('id_')),
              t.stringLiteral('-' + arrayMap.containerBindingId + '-'),
            ),
          ),
        ),
      ),
    )
  }

  body.push(
    t.ifStatement(
      t.memberExpression(cVar, t.identifier('__geaTpl')),
      t.blockStatement([
        t.variableDeclaration('var', [
          t.variableDeclarator(
            elVar,
            t.callExpression(
              t.memberExpression(t.memberExpression(cVar, t.identifier('__geaTpl')), t.identifier('cloneNode')),
              [t.booleanLiteral(true)],
            ),
          ),
        ]),
      ]),
      t.blockStatement([
        t.variableDeclaration('var', [
          t.variableDeclarator(
            t.identifier('__fw'),
            t.callExpression(t.memberExpression(cVar, t.identifier('cloneNode')), [t.booleanLiteral(false)]),
          ),
        ]),
        t.expressionStatement(
          t.assignmentExpression(
            '=',
            t.memberExpression(t.identifier('__fw'), t.identifier('innerHTML')),
            t.callExpression(
              t.memberExpression(t.thisExpression(), t.identifier(renderMethodName)),
              arrayMap.indexVariable ? [t.identifier('item'), t.identifier('__idx')] : [t.identifier('item')],
            ),
          ),
        ),
        t.variableDeclaration('var', [
          t.variableDeclarator(elVar, t.memberExpression(t.identifier('__fw'), t.identifier('firstElementChild'))),
        ]),
      ]),
    ),
  )

  for (const hoist of hoists) {
    body.push(t.variableDeclaration('var', [t.variableDeclarator(t.identifier(hoist.varName), hoist.expression)]))
  }

  for (const entry of patchedEntries) {
    const navExpr = buildElementNavExpr(elVar, entry.childPath)
    switch (entry.type) {
      case 'className':
        body.push(
          t.expressionStatement(
            t.assignmentExpression('=', t.memberExpression(navExpr, t.identifier('className')), entry.expression),
          ),
        )
        break
      case 'text':
        body.push(
          t.expressionStatement(
            t.assignmentExpression('=', t.memberExpression(navExpr, t.identifier('textContent')), entry.expression),
          ),
        )
        break
      case 'attribute': {
        const attrVal = t.identifier('__av')
        body.push(
          t.variableDeclaration('var', [t.variableDeclarator(attrVal, entry.expression)]),
          t.ifStatement(
            t.logicalExpression(
              '||',
              t.binaryExpression('==', attrVal, t.nullLiteral()),
              t.binaryExpression('===', attrVal, t.booleanLiteral(false)),
            ),
            t.expressionStatement(
              t.callExpression(t.memberExpression(navExpr, t.identifier('removeAttribute')), [
                t.stringLiteral(entry.attributeName!),
              ]),
            ),
            t.expressionStatement(
              t.callExpression(t.memberExpression(navExpr, t.identifier('setAttribute')), [
                t.stringLiteral(entry.attributeName!),
                t.callExpression(t.identifier('String'), [attrVal]),
              ]),
            ),
          ),
        )
        break
      }
    }
  }

  const itemIdExpr = itemIdProperty
    ? t.memberExpression(t.identifier('item'), t.identifier(itemIdProperty))
    : t.callExpression(t.identifier('String'), [t.identifier('item')])
  body.push(
    t.expressionStatement(
      t.callExpression(t.memberExpression(elVar, t.identifier('setAttribute')), [
        t.stringLiteral('data-gea-item-id'),
        itemIdExpr,
      ]),
    ),
  )

  if (arrayMap.containerBindingId) {
    body.push(
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(elVar, t.identifier('id')),
          t.binaryExpression('+', t.memberExpression(cVar, t.identifier('__geaIdPfx')), itemIdExpr),
        ),
      ),
    )
  }

  body.push(
    t.expressionStatement(
      t.assignmentExpression('=', t.memberExpression(elVar, t.identifier('__geaItem')), t.identifier('item')),
    ),
  )

  body.push(t.returnStatement(elVar))

  const createParams: t.Identifier[] = [t.identifier('item')]
  if (arrayMap.indexVariable) createParams.push(t.identifier('__idx'))
  return t.classMethod('method', t.identifier(methodName), createParams, t.blockStatement(body))
}

function templateRequiresRerender(file: t.File): boolean {
  let requiresRerender = false
  traverse(file, {
    noScope: true,
    ConditionalExpression(path: NodePath<t.ConditionalExpression>) {
      if (branchContainsJSX(path.node.consequent) || branchContainsJSX(path.node.alternate)) {
        requiresRerender = true
        path.stop()
      }
    },
    LogicalExpression(path: NodePath<t.LogicalExpression>) {
      if (branchContainsJSX(path.node.left) || branchContainsJSX(path.node.right)) {
        requiresRerender = true
        path.stop()
      }
    },
  })
  return requiresRerender
}

function branchContainsJSX(expr: t.Expression): boolean {
  let containsJSX = false
  const program = t.program([t.expressionStatement(t.cloneNode(expr, true))])
  traverse(program, {
    noScope: true,
    JSXElement(path: NodePath<t.JSXElement>) {
      containsJSX = true
      path.stop()
    },
    JSXFragment(path: NodePath<t.JSXFragment>) {
      containsJSX = true
      path.stop()
    },
  })
  return containsJSX
}
