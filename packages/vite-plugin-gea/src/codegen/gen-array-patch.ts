/**
 * Array item patch and create method generation for the Gea compiler codegen.
 *
 * Generates patchXxxItem and createXxxItem class methods that handle
 * incremental DOM updates for array-mapped list items. Also provides
 * the collectPatchEntries walker and templateRequiresRerender detector.
 */
import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '@babel/traverse'
import { appendToBody, id, js, jsMethod } from 'eszter'
import type { ArrayMapBinding } from '../ir/types.ts'
import {
  buildOptionalMemberChain,
  buildTrimmedClassValueExpression,
  camelToKebab,
  getJSXTagName,
  isComponentTag,
  loggingCatchClause,
  normalizePathParts,
  optionalizeMemberChainsAfterComputedItemKey,
  pathPartsToString,
  replacePropRefsInExpression,
} from './ast-helpers.ts'
import { ITEM_IS_KEY } from '../analyze/helpers.ts'

// ─── Patch entry types ─────────────────────────────────────────────

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

// ─── Event name set ────────────────────────────────────────────────

const EVENT_NAMES = new Set([
  'click', 'dblclick',
  'mousedown', 'mouseup', 'mouseover', 'mouseout', 'mousemove',
  'keydown', 'keyup', 'keypress',
  'focus', 'blur', 'input', 'change', 'submit', 'scroll',
  'touchstart', 'touchmove', 'touchend',
  'tap', 'longTap',
  'swipeRight', 'swipeUp', 'swipeLeft', 'swipeDown',
  'dragstart', 'dragend', 'dragover', 'dragleave', 'drop',
])

// ─── Dummy prop tree ───────────────────────────────────────────────

interface DummyPropTree {
  [key: string]: DummyPropTree | true
}

function ensureDummyTreePath(tree: DummyPropTree, path: string): void {
  const parts = normalizePathParts(path)
  if (parts.length === 0) return
  let cursor = tree
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i]
    if (i === parts.length - 1) {
      if (!(key in cursor)) cursor[key] = true
      return
    }
    if (!(key in cursor) || cursor[key] === true) cursor[key] = {}
    cursor = cursor[key] as DummyPropTree
  }
}

function collectItemTemplatePropTree(template: t.JSXElement | t.JSXFragment, itemVar: string): DummyPropTree {
  const tree: DummyPropTree = {}
  const program = t.program([t.expressionStatement(t.cloneNode(template, true))])
  traverse(program, {
    noScope: true,
    MemberExpression(path: NodePath<t.MemberExpression>) {
      const chain: string[] = []
      let node: t.Expression = path.node
      while (t.isMemberExpression(node) && !node.computed && t.isIdentifier(node.property)) {
        chain.unshift(node.property.name)
        node = node.object
      }
      if (!t.isIdentifier(node, { name: itemVar }) || chain.length === 0) return
      let cursor: DummyPropTree = tree
      for (let i = 0; i < chain.length; i++) {
        const key = chain[i]
        if (i === chain.length - 1) {
          if (!(key in cursor)) cursor[key] = true
        } else {
          if (!(key in cursor) || cursor[key] === true) cursor[key] = {}
          cursor = cursor[key] as DummyPropTree
        }
      }
    },
  })
  return tree
}

function buildDummyFromTree(tree: DummyPropTree, keyPathParts: string[] | null): t.ObjectExpression {
  const props: t.ObjectProperty[] = []
  for (const [key, value] of Object.entries(tree)) {
    const matchesKeyPath = keyPathParts && keyPathParts.length > 0 && keyPathParts[0] === key
    if (matchesKeyPath && keyPathParts!.length === 1) {
      props.push(t.objectProperty(t.identifier(key), t.numericLiteral(0)))
    } else if (matchesKeyPath) {
      props.push(
        t.objectProperty(t.identifier(key), buildDummyFromTree(value === true ? {} : value, keyPathParts!.slice(1))),
      )
    } else if (value === true) {
      props.push(t.objectProperty(t.identifier(key), t.stringLiteral(' ')))
    } else {
      props.push(t.objectProperty(t.identifier(key), buildDummyFromTree(value, null)))
    }
  }
  return t.objectExpression(props)
}

// ─── Patch item method ─────────────────────────────────────────────

export function generatePatchItemMethod(
  arrayMap: ArrayMapBinding,
  templatePropNames?: Set<string>,
  wholeParamName?: string,
  templateSetupContext?: { params: Array<t.Identifier | t.Pattern | t.RestElement>; statements: t.Statement[] },
): { method: t.ClassMethod | null; privateFields: string[] } {
  if (!arrayMap.itemTemplate) return { method: null, privateFields: [] }
  const arrayPath = pathPartsToString(arrayMap.arrayPathParts || normalizePathParts((arrayMap as any).arrayPath || ''))
  const arrayName = arrayPath.replace(/\./g, '')
  const capName = arrayName.charAt(0).toUpperCase() + arrayName.slice(1)
  const methodName = `patch${capName}Item`
  const itemIdProperty = arrayMap.itemIdProperty

  const itemTemplateRootIsComponent =
    t.isJSXElement(arrayMap.itemTemplate) && isComponentTag(getJSXTagName(arrayMap.itemTemplate.openingElement.name))
  if (itemTemplateRootIsComponent) return { method: null, privateFields: [] }

  let { entries, requiresRerender } = collectPatchEntries(arrayMap)
  if (arrayMap.callbackBodyStatements?.length) requiresRerender = true

  if (!requiresRerender && templateSetupContext && templateSetupContext.statements.length > 0) {
    const setupVarNames = new Set<string>()
    for (const stmt of templateSetupContext.statements) {
      if (!t.isVariableDeclaration(stmt)) continue
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

  if (requiresRerender || entries.length === 0) return { method: null, privateFields: [] }

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

  const { hoists, patchedEntries } = hoistStoreReads(entries, arrayMap.storeVar)
  const elVar = t.identifier('row')
  const body: t.Statement[] = [t.ifStatement(t.unaryExpression('!', elVar), t.returnStatement())]

  for (const hoist of hoists) {
    body.push(t.variableDeclaration('var', [t.variableDeclarator(t.identifier(hoist.varName), hoist.expression)]))
  }

  const refMap = new Map<string, t.Expression>()
  for (const entry of patchedEntries) {
    if (entry.childPath.length === 0) continue
    const key = entry.childPath.join('_')
    if (refMap.has(key)) continue
    const refName = childPathRefName(entry.childPath)
    const refExpr = t.memberExpression(elVar, t.identifier(refName))
    const navExpr = buildElementNavExpr(elVar, entry.childPath)
    body.push(
      t.ifStatement(
        t.unaryExpression('!', refExpr),
        t.expressionStatement(t.assignmentExpression('=', refExpr, navExpr)),
      ),
    )
    refMap.set(key, refExpr)
  }

  for (const entry of patchedEntries) {
    const navExpr =
      entry.childPath.length > 0
        ? refMap.get(entry.childPath.join('_')) || buildElementNavExpr(elVar, entry.childPath)
        : elVar
    switch (entry.type) {
      case 'className': {
        const classVal = t.identifier('__cn')
        body.push(
          t.variableDeclaration('var', [
            t.variableDeclarator(
              classVal,
              buildTrimmedClassValueExpression(t.cloneNode(entry.expression, true) as t.Expression),
            ),
          ]),
          t.ifStatement(
            t.binaryExpression('!==', t.memberExpression(navExpr, t.identifier('className')), classVal),
            t.expressionStatement(
              t.assignmentExpression(
                '=',
                t.memberExpression(t.cloneNode(navExpr, true), t.identifier('className')),
                classVal,
              ),
            ),
          ),
        )
        break
      }
      case 'text':
        body.push(
          t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(t.memberExpression(navExpr, t.identifier('firstChild')), t.identifier('nodeValue')),
              entry.expression,
            ),
          ),
        )
        break
      case 'attribute': {
        const attrVal = t.identifier('__av')
        if (entry.attributeName === 'style') {
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
                  t.stringLiteral('style'),
                ]),
              ),
              t.expressionStatement(
                t.assignmentExpression(
                  '=',
                  t.memberExpression(t.memberExpression(navExpr, t.identifier('style')), t.identifier('cssText')),
                  t.conditionalExpression(
                    t.binaryExpression('===', t.unaryExpression('typeof', attrVal), t.stringLiteral('object')),
                    t.callExpression(
                      t.memberExpression(
                        t.callExpression(
                          t.memberExpression(
                            t.callExpression(t.memberExpression(t.identifier('Object'), t.identifier('entries')), [
                              attrVal,
                            ]),
                            t.identifier('map'),
                          ),
                          [
                            t.arrowFunctionExpression(
                              [t.arrayPattern([t.identifier('k'), t.identifier('v')])],
                              t.binaryExpression(
                                '+',
                                t.binaryExpression(
                                  '+',
                                  t.callExpression(t.memberExpression(t.identifier('k'), t.identifier('replace')), [
                                    t.regExpLiteral('[A-Z]', 'g'),
                                    t.stringLiteral('-$&'),
                                  ]),
                                  t.stringLiteral(': '),
                                ),
                                t.identifier('v'),
                              ),
                            ),
                          ],
                        ),
                        t.identifier('join'),
                      ),
                      [t.stringLiteral('; ')],
                    ),
                    t.callExpression(t.identifier('String'), [attrVal]),
                  ),
                ),
              ),
            ),
          )
        } else {
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
              t.blockStatement([
                t.variableDeclaration('const', [
                  t.variableDeclarator(t.identifier('__newAttr'), t.callExpression(t.identifier('String'), [attrVal])),
                ]),
                t.ifStatement(
                  t.binaryExpression(
                    '!==',
                    t.callExpression(
                      t.memberExpression(t.cloneNode(navExpr, true), t.identifier('getAttribute')),
                      [t.stringLiteral(entry.attributeName!)],
                    ),
                    t.identifier('__newAttr'),
                  ),
                  t.expressionStatement(
                    t.callExpression(
                      t.memberExpression(t.cloneNode(navExpr, true), t.identifier('setAttribute')),
                      [t.stringLiteral(entry.attributeName!), t.identifier('__newAttr')],
                    ),
                  ),
                ),
              ]),
            ),
          )
        }
        break
      }
    }
  }

  const rawItemIdExpr =
    itemIdProperty && itemIdProperty !== ITEM_IS_KEY
      ? t.logicalExpression('??', buildOptionalMemberChain(t.identifier('item'), itemIdProperty), t.identifier('item'))
      : t.identifier('item')
  const itemIdExpr = t.callExpression(t.identifier('String'), [rawItemIdExpr])
  body.push(
    t.expressionStatement(t.assignmentExpression('=', t.memberExpression(elVar, t.identifier('__geaKey')), itemIdExpr)),
  )

  const rowElsProp = `__rowEls_${arrayMap.containerBindingId ?? 'list'}`
  const privateElsRef = t.memberExpression(t.thisExpression(), t.privateName(t.identifier(rowElsProp)))
  body.push(
    t.expressionStatement(
      t.assignmentExpression(
        '=',
        t.memberExpression(
          t.logicalExpression(
            '||',
            t.cloneNode(privateElsRef),
            t.assignmentExpression('=', t.cloneNode(privateElsRef), t.objectExpression([])),
          ),
          t.cloneNode(itemIdExpr, true),
          true,
        ),
        elVar,
      ),
    ),
  )

  const patchPrivateFields: string[] = [rowElsProp]

  body.push(
    t.expressionStatement(
      t.assignmentExpression('=', t.memberExpression(elVar, t.identifier('__geaItem')), t.identifier('item')),
    ),
  )

  const params: t.Identifier[] = [t.identifier('row'), t.identifier('item'), t.identifier('__prevItem')]
  if (arrayMap.indexVariable) params.push(t.identifier('__idx'))
  return {
    method: t.classMethod('method', t.identifier(methodName), params, t.blockStatement(body)),
    privateFields: patchPrivateFields,
  }
}

// ─── Collect patch entries ─────────────────────────────────────────

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
    const rootTagName = getJSXTagName(modified.openingElement.name)
    const rootIsComponent = isComponentTag(rootTagName)
    walkJSXForPatch(modified, [], entries, rootIsComponent)
  }
  for (const ent of entries) {
    ent.expression = optionalizeMemberChainsAfterComputedItemKey(ent.expression, 'item')
  }
  return { entries, requiresRerender }
}

// ─── Walk JSX tree for patch entries ───────────────────────────────

function walkJSXForPatch(node: t.JSXElement, path: number[], entries: PatchEntry[], rootIsComponent = false): void {
  const isRootLevel = path.length === 0 && rootIsComponent

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
        attributeName: isRootLevel ? `data-prop-${camelToKebab(name)}` : name,
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

// ─── DOM navigation expression builder ─────────────────────────────

/**
 * Build a DOM navigation expression using firstElementChild/nextElementSibling
 * to reach the element at the given child path. For example:
 *   [0]    -> base.firstElementChild
 *   [1]    -> base.firstElementChild.nextElementSibling
 *   [1, 0] -> base.firstElementChild.nextElementSibling.firstElementChild
 */
export function buildElementNavExpr(base: t.Expression, childPath: number[]): t.Expression {
  let expr = base
  for (const idx of childPath) {
    expr = t.memberExpression(expr, t.identifier('firstElementChild'))
    for (let i = 0; i < idx; i++) {
      expr = t.memberExpression(expr, t.identifier('nextElementSibling'))
    }
  }
  return expr
}

export function childPathRefName(path: number[]): string {
  return `__ref_${path.join('_')}`
}

// ─── Store read hoisting ───────────────────────────────────────────

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

// ─── Create item method ────────────────────────────────────────────

export function generateCreateItemMethod(
  arrayMap: ArrayMapBinding,
  templatePropNames?: Set<string>,
  wholeParamName?: string,
  templateSetupContext?: { params: Array<t.Identifier | t.Pattern | t.RestElement>; statements: t.Statement[] },
): { method: t.ClassMethod | null; needsRawStoreCache: boolean; privateFields: string[] } {
  if (!arrayMap.itemTemplate) return { method: null, needsRawStoreCache: false, privateFields: [] }
  const arrayPath = pathPartsToString(arrayMap.arrayPathParts || normalizePathParts((arrayMap as any).arrayPath || ''))
  const arrayName = arrayPath.replace(/\./g, '')
  const capName = arrayName.charAt(0).toUpperCase() + arrayName.slice(1)
  const methodName = `create${capName}Item`
  const renderMethodName = `render${capName}Item`
  const containerProp = `__${arrayPath.replace(/\./g, '_')}_container`
  const itemIdProperty = arrayMap.itemIdProperty

  // Detect if the map item template root is a component (PascalCase tag)
  const itemTemplateRootIsComponent =
    t.isJSXElement(arrayMap.itemTemplate) && isComponentTag(getJSXTagName(arrayMap.itemTemplate.openingElement.name))

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
    const rerenderBody: t.Statement[] = [
      js`var __tw = document.createElement('template');`,
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(t.identifier('__tw'), t.identifier('innerHTML')),
          t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(renderMethodName)), renderArgs),
        ),
      ),
      js`var el = __tw.content.firstElementChild;`,
    ]

    // For component-root map items, set __geaProps with actual JS values
    if (itemTemplateRootIsComponent && t.isJSXElement(arrayMap.itemTemplate)) {
      const propsProperties: t.ObjectProperty[] = []
      const cloned = t.cloneNode(arrayMap.itemTemplate, true) as t.JSXElement
      for (const attr of cloned.openingElement.attributes) {
        if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue
        const propName = attr.name.name
        if (propName === 'key' || EVENT_NAMES.has(propName)) continue
        if (!t.isJSXExpressionContainer(attr.value) || t.isJSXEmptyExpression(attr.value.expression)) continue
        const exprClone = t.cloneNode(attr.value.expression as t.Expression, true)
        const tempProg = t.file(t.program([t.expressionStatement(exprClone)]))
        traverse(tempProg, {
          Identifier(path: NodePath<t.Identifier>) {
            if (path.node.name === arrayMap.itemVariable) path.node.name = 'item'
            else if (arrayMap.indexVariable && path.node.name === arrayMap.indexVariable) path.node.name = '__idx'
          },
        })
        const rewrittenExpr = (tempProg.program.body[0] as t.ExpressionStatement).expression
        propsProperties.push(t.objectProperty(t.identifier(propName), rewrittenExpr))
      }
      if (propsProperties.length > 0) {
        // Include template setup statements if __geaProps references template-local variables
        if (templateSetupContext && templateSetupContext.statements.length > 0) {
          const setupVarNames = new Set<string>()
          for (const stmt of templateSetupContext.statements) {
            if (t.isVariableDeclaration(stmt)) {
              for (const decl of stmt.declarations) {
                if (t.isIdentifier(decl.id)) setupVarNames.add(decl.id.name)
                else if (t.isObjectPattern(decl.id)) {
                  for (const prop of decl.id.properties) {
                    if (t.isObjectProperty(prop) && t.isIdentifier(prop.value)) setupVarNames.add(prop.value.name)
                    else if (t.isRestElement(prop) && t.isIdentifier(prop.argument))
                      setupVarNames.add(prop.argument.name)
                  }
                }
              }
            }
          }
          const propsRefsFreeVars = new Set<string>()
          for (const prop of propsProperties) {
            traverse(t.expressionStatement(t.cloneNode(prop.value as t.Expression, true)), {
              noScope: true,
              Identifier(p: NodePath<t.Identifier>) {
                if (t.isMemberExpression(p.parent) && p.parent.property === p.node && !p.parent.computed) return
                propsRefsFreeVars.add(p.node.name)
              },
            })
          }
          let needsSetup = false
          for (const name of setupVarNames) {
            if (propsRefsFreeVars.has(name)) {
              needsSetup = true
              break
            }
          }
          if (needsSetup) {
            const propRefsNames = propNames ?? new Set<string>()
            for (const stmt of templateSetupContext.statements) {
              let clonedStmt = t.cloneNode(stmt, true) as t.Statement
              if (propRefsNames.size > 0 || wholeParamName) {
                clonedStmt = replacePropRefsInExpression(
                  clonedStmt as any,
                  propRefsNames,
                  wholeParamName,
                ) as any as t.Statement
              }
              rerenderBody.push(clonedStmt)
            }
          }
        }
        rerenderBody.push(
          t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(t.identifier('el'), t.identifier('__geaProps')),
              t.objectExpression(propsProperties),
            ),
          ),
        )
      }
    }

    rerenderBody.push(t.returnStatement(t.identifier('el')))
    return { method: appendToBody(createMethod, ...rerenderBody), needsRawStoreCache: false, privateFields: [] }
  }

  if (entries.length === 0) return { method: null, needsRawStoreCache: false, privateFields: [] }

  const { hoists, patchedEntries } = hoistStoreReads(entries, arrayMap.storeVar)

  const useRawStoreCache = hoists.length > 0 && !!arrayMap.storeVar

  if (useRawStoreCache) {
    for (const hoist of hoists) {
      if (
        t.isMemberExpression(hoist.expression) &&
        t.isIdentifier(hoist.expression.object) &&
        hoist.expression.object.name === arrayMap.storeVar
      ) {
        hoist.expression.object = t.identifier('__rs')
      }
    }
  }

  const propTree = collectItemTemplatePropTree(arrayMap.itemTemplate!, arrayMap.itemVariable)

  const containerRef = t.memberExpression(t.thisExpression(), t.identifier(containerProp))
  const privateDcField = t.memberExpression(t.thisExpression(), t.privateName(t.identifier('__dc')))
  const cVar = t.identifier('__c')
  const elVar = t.identifier('el')
  const privateFields: string[] = ['__dc']

  const body: t.Statement[] = []

  if (useRawStoreCache) {
    const privateRsField = t.memberExpression(t.thisExpression(), t.privateName(t.identifier('__rs')))
    body.push(
      t.variableDeclaration('var', [
        t.variableDeclarator(
          t.identifier('__rs'),
          t.logicalExpression(
            '||',
            t.cloneNode(privateRsField),
            t.assignmentExpression(
              '=',
              t.cloneNode(privateRsField),
              t.memberExpression(t.identifier(arrayMap.storeVar!), t.identifier('__raw')),
            ),
          ),
        ),
      ]),
    )
  }

  body.push(
    t.variableDeclaration('var', [
      t.variableDeclarator(
        cVar,
        t.logicalExpression(
          '||',
          t.cloneNode(privateDcField),
          t.assignmentExpression('=', t.cloneNode(privateDcField), containerRef),
        ),
      ),
    ]),
  )

  const isPrimitiveKey = !itemIdProperty || itemIdProperty === ITEM_IS_KEY
  const dummyItem: t.Expression = isPrimitiveKey
    ? t.stringLiteral('__dummy__')
    : (() => {
        if (itemIdProperty) ensureDummyTreePath(propTree, itemIdProperty)
        return buildDummyFromTree(propTree, itemIdProperty ? normalizePathParts(itemIdProperty) : null)
      })()

  const hasRootClassNamePatch = patchedEntries.some((e) => e.type === 'className' && e.childPath.length === 0)

  const tplInit: t.Statement[] = [
    t.variableDeclaration('var', [
      t.variableDeclarator(
        t.identifier('__tw'),
        t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('createElement')), [
          t.stringLiteral('template'),
        ]),
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
        t.memberExpression(
          t.memberExpression(t.identifier('__tw'), t.identifier('content')),
          t.identifier('firstElementChild'),
        ),
      ),
    ),
    t.expressionStatement(
      t.optionalCallExpression(
        t.optionalMemberExpression(
          t.memberExpression(cVar, t.identifier('__geaTpl')),
          t.identifier('removeAttribute'),
          false,
          true,
        ),
        [t.stringLiteral('data-gea-item-id')],
        false,
      ),
    ),
  ]

  if (hasRootClassNamePatch) {
    tplInit.push(
      t.ifStatement(
        t.logicalExpression(
          '&&',
          t.memberExpression(cVar, t.identifier('__geaTpl')),
          t.memberExpression(t.memberExpression(cVar, t.identifier('__geaTpl')), t.identifier('className')),
        ),
        t.expressionStatement(
          t.assignmentExpression(
            '=',
            t.memberExpression(t.memberExpression(cVar, t.identifier('__geaTpl')), t.identifier('className')),
            t.stringLiteral(''),
          ),
        ),
      ),
    )
  }
  body.push(
    t.ifStatement(
      t.unaryExpression('!', t.memberExpression(cVar, t.identifier('__geaTpl'))),
      t.blockStatement([t.tryStatement(t.blockStatement(tplInit), loggingCatchClause())]),
    ),
  )

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
            t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('createElement')), [
              t.stringLiteral('template'),
            ]),
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
          t.variableDeclarator(
            elVar,
            t.memberExpression(
              t.memberExpression(t.identifier('__fw'), t.identifier('content')),
              t.identifier('firstElementChild'),
            ),
          ),
        ]),
      ]),
    ),
  )

  for (const hoist of hoists) {
    body.push(t.variableDeclaration('var', [t.variableDeclarator(t.identifier(hoist.varName), hoist.expression)]))
  }

  // Precompute and cache DOM element refs for childPaths used by propPatchers
  const refMap = new Map<string, t.Expression>()
  for (const entry of patchedEntries) {
    if (entry.childPath.length === 0) continue
    const key = entry.childPath.join('_')
    if (refMap.has(key)) continue
    const refName = childPathRefName(entry.childPath)
    const navExpr = buildElementNavExpr(elVar, entry.childPath)
    body.push(
      t.expressionStatement(t.assignmentExpression('=', t.memberExpression(elVar, t.identifier(refName)), navExpr)),
    )
    refMap.set(key, t.memberExpression(elVar, t.identifier(refName)))
  }

  for (const entry of patchedEntries) {
    const navExpr =
      entry.childPath.length > 0
        ? refMap.get(entry.childPath.join('_')) || buildElementNavExpr(elVar, entry.childPath)
        : elVar
    switch (entry.type) {
      case 'className': {
        const classExpr = t.cloneNode(entry.expression, true) as t.Expression
        if (
          t.isConditionalExpression(classExpr) &&
          t.isStringLiteral(classExpr.alternate) &&
          classExpr.alternate.value === ''
        ) {
          body.push(
            t.ifStatement(
              classExpr.test,
              t.expressionStatement(
                t.assignmentExpression(
                  '=',
                  t.memberExpression(navExpr, t.identifier('className')),
                  buildTrimmedClassValueExpression(classExpr.consequent),
                ),
              ),
            ),
          )
        } else {
          body.push(
            t.expressionStatement(
              t.assignmentExpression(
                '=',
                t.memberExpression(navExpr, t.identifier('className')),
                buildTrimmedClassValueExpression(classExpr),
              ),
            ),
          )
        }
        break
      }
      case 'text':
        body.push(
          t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(t.memberExpression(navExpr, t.identifier('firstChild')), t.identifier('nodeValue')),
              entry.expression,
            ),
          ),
        )
        break
      case 'attribute': {
        const attrVal = t.identifier('__av')
        if (entry.attributeName === 'style') {
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
                  t.stringLiteral('style'),
                ]),
              ),
              t.expressionStatement(
                t.assignmentExpression(
                  '=',
                  t.memberExpression(t.memberExpression(navExpr, t.identifier('style')), t.identifier('cssText')),
                  t.conditionalExpression(
                    t.binaryExpression('===', t.unaryExpression('typeof', attrVal), t.stringLiteral('object')),
                    t.callExpression(
                      t.memberExpression(
                        t.callExpression(
                          t.memberExpression(
                            t.callExpression(t.memberExpression(t.identifier('Object'), t.identifier('entries')), [
                              attrVal,
                            ]),
                            t.identifier('map'),
                          ),
                          [
                            t.arrowFunctionExpression(
                              [t.arrayPattern([t.identifier('k'), t.identifier('v')])],
                              t.binaryExpression(
                                '+',
                                t.binaryExpression(
                                  '+',
                                  t.callExpression(t.memberExpression(t.identifier('k'), t.identifier('replace')), [
                                    t.regExpLiteral('[A-Z]', 'g'),
                                    t.stringLiteral('-$&'),
                                  ]),
                                  t.stringLiteral(': '),
                                ),
                                t.identifier('v'),
                              ),
                            ),
                          ],
                        ),
                        t.identifier('join'),
                      ),
                      [t.stringLiteral('; ')],
                    ),
                    t.callExpression(t.identifier('String'), [attrVal]),
                  ),
                ),
              ),
            ),
          )
        } else {
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
              t.blockStatement([
                t.variableDeclaration('const', [
                  t.variableDeclarator(t.identifier('__newAttr'), t.callExpression(t.identifier('String'), [attrVal])),
                ]),
                t.ifStatement(
                  t.binaryExpression(
                    '!==',
                    t.callExpression(
                      t.memberExpression(t.cloneNode(navExpr, true), t.identifier('getAttribute')),
                      [t.stringLiteral(entry.attributeName!)],
                    ),
                    t.identifier('__newAttr'),
                  ),
                  t.expressionStatement(
                    t.callExpression(
                      t.memberExpression(t.cloneNode(navExpr, true), t.identifier('setAttribute')),
                      [t.stringLiteral(entry.attributeName!), t.identifier('__newAttr')],
                    ),
                  ),
                ),
              ]),
            ),
          )
        }
        break
      }
    }
  }

  const rawPatchItemIdExpr =
    itemIdProperty && itemIdProperty !== ITEM_IS_KEY
      ? t.logicalExpression('??', buildOptionalMemberChain(t.identifier('item'), itemIdProperty), t.identifier('item'))
      : t.identifier('item')
  const patchItemIdExpr = t.callExpression(t.identifier('String'), [rawPatchItemIdExpr])
  body.push(
    t.expressionStatement(
      t.assignmentExpression('=', t.memberExpression(elVar, t.identifier('__geaKey')), patchItemIdExpr),
    ),
  )

  body.push(
    t.expressionStatement(
      t.assignmentExpression('=', t.memberExpression(elVar, t.identifier('__geaItem')), t.identifier('item')),
    ),
  )

  // For component-root map items, set __geaProps with actual JS values
  // so extractComponentProps_ can use them instead of stringified HTML attributes
  if (itemTemplateRootIsComponent && t.isJSXElement(arrayMap.itemTemplate)) {
    const propsProperties: t.ObjectProperty[] = []
    const cloned = t.cloneNode(arrayMap.itemTemplate, true) as t.JSXElement
    for (const attr of cloned.openingElement.attributes) {
      if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue
      const name = attr.name.name
      if (name === 'key' || EVENT_NAMES.has(name)) continue
      if (!t.isJSXExpressionContainer(attr.value) || t.isJSXEmptyExpression(attr.value.expression)) continue
      // Rewrite itemVariable references to 'item'
      const exprClone = t.cloneNode(attr.value.expression as t.Expression, true)
      const tempProg = t.file(t.program([t.expressionStatement(exprClone)]))
      traverse(tempProg, {
        Identifier(path: NodePath<t.Identifier>) {
          if (path.node.name === arrayMap.itemVariable) path.node.name = 'item'
          else if (arrayMap.indexVariable && path.node.name === arrayMap.indexVariable) path.node.name = '__idx'
        },
      })
      let rewrittenExpr = (tempProg.program.body[0] as t.ExpressionStatement).expression
      if (propNames.size > 0 || wholeParamName) {
        rewrittenExpr = replacePropRefsInExpression(
          t.cloneNode(rewrittenExpr, true) as t.Expression,
          propNames,
          wholeParamName,
        )
      }
      propsProperties.push(t.objectProperty(t.identifier(name), rewrittenExpr))
    }
    if (propsProperties.length > 0) {
      body.push(
        t.expressionStatement(
          t.assignmentExpression(
            '=',
            t.memberExpression(elVar, t.identifier('__geaProps')),
            t.objectExpression(propsProperties),
          ),
        ),
      )
    }
  }

  body.push(t.returnStatement(elVar))

  const createParams: t.Identifier[] = [t.identifier('item')]
  if (arrayMap.indexVariable) createParams.push(t.identifier('__idx'))
  return {
    method: t.classMethod('method', t.identifier(methodName), createParams, t.blockStatement(body)),
    needsRawStoreCache: useRawStoreCache,
    privateFields,
  }
}

// ─── Template requires rerender ────────────────────────────────────

export function templateRequiresRerender(file: t.File): boolean {
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
