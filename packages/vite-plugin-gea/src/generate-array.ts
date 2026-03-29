import * as t from '@babel/types'
import { appendToBody, id, js, jsBlockBody, jsExpr, jsMethod } from 'eszter'
import type { ArrayMapBinding, ConditionalMapBinding, RelationalMapBinding } from './ir.ts'
import { ITEM_IS_KEY } from './analyze-helpers.ts'
import {
  buildOptionalMemberChain,
  buildMemberChain,
  buildTrimmedClassValueExpression,
  getJSXTagName,
  isComponentTag,
  normalizePathParts,
  pathPartsToString,
} from './utils.ts'
import { collectPatchEntries, childPathRefName, buildElementNavExpr } from './generate-array-patch.ts'
import type { NodePath } from '@babel/traverse'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const traverse = require('@babel/traverse').default

function getArrayPathParts(arrayMap: ArrayMapBinding): string[] {
  return arrayMap.arrayPathParts || normalizePathParts((arrayMap as any).arrayPath || '')
}

function getArrayPath(arrayMap: ArrayMapBinding): string {
  return pathPartsToString(getArrayPathParts(arrayMap))
}

function getArrayCapName(arrayMap: ArrayMapBinding): string {
  const arrayPath = getArrayPath(arrayMap)
  return arrayPath.charAt(0).toUpperCase() + arrayPath.slice(1).replace(/\./g, '')
}

function getArrayConfigPropName(arrayMap: ArrayMapBinding): string {
  const arrayPath = getArrayPath(arrayMap)
  return `__${arrayPath.replace(/\./g, '_')}ListConfig`
}

function getArrayCreateMethodName(arrayMap: ArrayMapBinding): string {
  return `create${getArrayCapName(arrayMap)}Item`
}

function getArrayRenderMethodName(arrayMap: ArrayMapBinding): string {
  return `render${getArrayCapName(arrayMap)}Item`
}

function getArrayPatchMethodName(arrayMap: ArrayMapBinding): string {
  return `patch${getArrayCapName(arrayMap)}Item`
}

function getPropPatcherTargetExpr(
  binding: { selector: string; childPath?: number[] },
  rowExpr: t.Expression,
): t.Expression {
  if (binding.childPath && binding.childPath.length > 0) {
    return buildChildAccessExpr(rowExpr, binding.childPath)
  }
  if (binding.selector === ':scope') {
    return t.cloneNode(rowExpr, true)
  }
  throw new Error(
    `getPropPatcherTargetExpr: childPath required when selector is not :scope (got "${binding.selector}"). ` +
      'Ensure map item bindings have childPath from analysis.',
  )
}

function buildPropPatcherFunction(
  binding: { type: string; selector: string; classToggleName?: string; childPath?: number[]; attributeName?: string },
  propName: string,
): t.Expression {
  const row = t.identifier('row')
  const value = t.identifier('value')
  const target = t.identifier('__target')
  const targetExpr = getPropPatcherTargetExpr(binding, row)

  if (binding.type === 'class') {
    return t.arrowFunctionExpression(
      [row, value],
      t.callExpression(t.memberExpression(t.memberExpression(row, t.identifier('classList')), t.identifier('toggle')), [
        t.stringLiteral(binding.classToggleName || propName),
        value,
      ]),
    )
  }

  if (binding.type === 'checked' || binding.type === 'value') {
    return t.arrowFunctionExpression(
      [row, value],
      t.blockStatement([
        t.variableDeclaration('const', [t.variableDeclarator(target, targetExpr)]),
        t.ifStatement(t.unaryExpression('!', target), t.returnStatement()),
        t.expressionStatement(
          t.assignmentExpression(
            '=',
            t.memberExpression(target, t.identifier(binding.type === 'checked' ? 'checked' : 'value')),
            value,
          ),
        ),
      ]),
    )
  }

  if (binding.type === 'attribute') {
    const attrName = binding.attributeName || 'class'
    const setExpr =
      attrName === 'style'
        ? t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(t.memberExpression(target, t.identifier('style')), t.identifier('cssText')),
              t.conditionalExpression(
                t.binaryExpression(
                  '===',
                  t.unaryExpression('typeof', t.identifier('__attrValue')),
                  t.stringLiteral('object'),
                ),
                t.callExpression(
                  t.memberExpression(
                    t.callExpression(
                      t.memberExpression(
                        t.callExpression(t.memberExpression(t.identifier('Object'), t.identifier('entries')), [
                          t.identifier('__attrValue'),
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
                t.callExpression(t.identifier('String'), [t.identifier('__attrValue')]),
              ),
            ),
          )
        : t.expressionStatement(
            t.callExpression(t.memberExpression(target, t.identifier('setAttribute')), [
              t.stringLiteral(attrName),
              t.callExpression(t.identifier('String'), [t.identifier('__attrValue')]),
            ]),
          )
    return t.arrowFunctionExpression(
      [row, value],
      t.blockStatement([
        t.variableDeclaration('const', [t.variableDeclarator(target, targetExpr)]),
        t.ifStatement(t.unaryExpression('!', target), t.returnStatement()),
        t.variableDeclaration('const', [t.variableDeclarator(t.identifier('__attrValue'), value)]),
        t.ifStatement(
          t.logicalExpression(
            '||',
            t.binaryExpression('==', t.identifier('__attrValue'), t.nullLiteral()),
            t.binaryExpression('===', t.identifier('__attrValue'), t.booleanLiteral(false)),
          ),
          t.blockStatement([
            t.expressionStatement(
              t.callExpression(t.memberExpression(target, t.identifier('removeAttribute')), [
                t.stringLiteral(attrName),
              ]),
            ),
          ]),
          t.blockStatement([setExpr]),
        ),
      ]),
    )
  }

  return t.arrowFunctionExpression(
    [row, value],
    t.blockStatement([
      t.variableDeclaration('const', [t.variableDeclarator(target, targetExpr)]),
      t.ifStatement(t.unaryExpression('!', target), t.returnStatement()),
      t.expressionStatement(
        t.logicalExpression(
          '||',
          t.logicalExpression(
            '&&',
            t.memberExpression(target, t.identifier('firstChild')),
            t.assignmentExpression(
              '=',
              t.memberExpression(t.memberExpression(target, t.identifier('firstChild')), t.identifier('nodeValue')),
              value,
            ),
          ),
          t.assignmentExpression('=', t.memberExpression(target, t.identifier('textContent')), value),
        ),
      ),
    ]),
  )
}

function collectItemExpressionKeys(expr: t.Expression): string[] {
  const keys = new Set<string>()
  const program = t.program([t.expressionStatement(t.cloneNode(expr, true) as t.Expression)])
  traverse(program, {
    noScope: true,
    MemberExpression(path: NodePath<t.MemberExpression>) {
      if (!t.isIdentifier(path.node.object, { name: 'item' })) return
      if (path.node.computed || !t.isIdentifier(path.node.property)) return
      keys.add(path.node.property.name)
    },
  })
  return Array.from(keys)
}

function buildPatchEntryPropPatcher(entry: {
  childPath: number[]
  type: 'text' | 'className' | 'attribute'
  expression: t.Expression
  attributeName?: string
}): t.Expression {
  const row = t.identifier('row')
  const value = t.identifier('value')
  const item = t.identifier('item')
  const target = t.identifier('__target')
  const targetExpr =
    entry.childPath.length > 0
      ? t.logicalExpression(
          '||',
          t.memberExpression(row, t.identifier(childPathRefName(entry.childPath))),
          t.parenthesizedExpression(
            t.assignmentExpression(
              '=',
              t.memberExpression(t.cloneNode(row, true), t.identifier(childPathRefName(entry.childPath))),
              buildElementNavExpr(t.cloneNode(row, true), entry.childPath),
            ),
          ),
        )
      : row

  if (entry.type === 'className') {
    const isRoot = entry.childPath.length === 0
    const stmts: t.Statement[] = []
    if (!isRoot) {
      stmts.push(t.variableDeclaration('const', [t.variableDeclarator(target, targetExpr)]))
      stmts.push(t.ifStatement(t.unaryExpression('!', target), t.returnStatement()))
    }
    const ref = isRoot ? row : target
    stmts.push(
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(ref, t.identifier('className')),
          buildTrimmedClassValueExpression(t.cloneNode(entry.expression, true) as t.Expression),
        ),
      ),
    )
    return t.arrowFunctionExpression([row, value, item], t.blockStatement(stmts))
  }

  if (entry.type === 'attribute') {
    const attrName = entry.attributeName || 'class'
    const propSetExpr =
      attrName === 'style'
        ? t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(t.memberExpression(target, t.identifier('style')), t.identifier('cssText')),
              t.conditionalExpression(
                t.binaryExpression(
                  '===',
                  t.unaryExpression('typeof', t.identifier('__attrValue')),
                  t.stringLiteral('object'),
                ),
                t.callExpression(
                  t.memberExpression(
                    t.callExpression(
                      t.memberExpression(
                        t.callExpression(t.memberExpression(t.identifier('Object'), t.identifier('entries')), [
                          t.identifier('__attrValue'),
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
                t.callExpression(t.identifier('String'), [t.identifier('__attrValue')]),
              ),
            ),
          )
        : t.expressionStatement(
            t.callExpression(t.memberExpression(target, t.identifier('setAttribute')), [
              t.stringLiteral(attrName),
              t.callExpression(t.identifier('String'), [t.identifier('__attrValue')]),
            ]),
          )
    return t.arrowFunctionExpression(
      [row, value, item],
      t.blockStatement([
        t.variableDeclaration('const', [t.variableDeclarator(target, targetExpr)]),
        t.ifStatement(t.unaryExpression('!', target), t.returnStatement()),
        t.variableDeclaration('const', [
          t.variableDeclarator(t.identifier('__attrValue'), t.cloneNode(entry.expression, true)),
        ]),
        t.ifStatement(
          t.logicalExpression(
            '||',
            t.binaryExpression('==', t.identifier('__attrValue'), t.nullLiteral()),
            t.binaryExpression('===', t.identifier('__attrValue'), t.booleanLiteral(false)),
          ),
          t.blockStatement([
            t.expressionStatement(
              t.callExpression(t.memberExpression(target, t.identifier('removeAttribute')), [
                t.stringLiteral(attrName),
              ]),
            ),
          ]),
          t.blockStatement([propSetExpr]),
        ),
      ]),
    )
  }

  const isRoot = entry.childPath.length === 0
  const stmts: t.Statement[] = []
  if (!isRoot) {
    stmts.push(t.variableDeclaration('const', [t.variableDeclarator(target, targetExpr)]))
    stmts.push(t.ifStatement(t.unaryExpression('!', target), t.returnStatement()))
  }
  const ref = isRoot ? row : target
  stmts.push(
    t.expressionStatement(
      t.logicalExpression(
        '||',
        t.logicalExpression(
          '&&',
          t.memberExpression(ref, t.identifier('firstChild')),
          t.assignmentExpression(
            '=',
            t.memberExpression(t.memberExpression(ref, t.identifier('firstChild')), t.identifier('nodeValue')),
            t.cloneNode(entry.expression, true),
          ),
        ),
        t.assignmentExpression(
          '=',
          t.memberExpression(ref, t.identifier('textContent')),
          t.cloneNode(entry.expression, true),
        ),
      ),
    ),
  )
  return t.arrowFunctionExpression([row, value, item], t.blockStatement(stmts))
}

function buildPropPatchersObject(arrayMap: ArrayMapBinding): t.ObjectExpression | null {
  const groups = new Map<string, t.Expression[]>()

  if (arrayMap.itemTemplate) {
    const patchPlan = collectPatchEntries(arrayMap)
    if (!patchPlan.requiresRerender) {
      patchPlan.entries.forEach((entry) => {
        const keys = collectItemExpressionKeys(entry.expression)
        keys.forEach((key) => {
          const existing = groups.get(key) || []
          existing.push(buildPatchEntryPropPatcher(entry))
          groups.set(key, existing)
        })
      })
    }
  }

  arrayMap.itemBindings.forEach((binding) => {
    if (binding.type !== 'checked' && binding.type !== 'value' && binding.type !== 'class') return
    const bindingPathParts = binding.pathParts || normalizePathParts((binding as any).path || '')
    const wildcardIndex = bindingPathParts.indexOf('*')
    if (wildcardIndex === -1) return

    const propParts = bindingPathParts.slice(wildcardIndex + 1)
    if (propParts.length === 0) return

    const key = propParts.join('.')
    const propName = propParts[propParts.length - 1]
    const patcher = buildPropPatcherFunction(binding, propName)
    const existing = groups.get(key) || []
    existing.push(patcher)
    groups.set(key, existing)
  })

  if (groups.size === 0) return null

  return t.objectExpression(
    Array.from(groups.entries()).map(([key, patchers]) =>
      t.objectProperty(t.stringLiteral(key), t.arrayExpression(patchers)),
    ),
  )
}

export function generateEnsureArrayConfigsMethod(arrayMaps: ArrayMapBinding[]): t.ClassMethod | null {
  if (arrayMaps.length === 0) return null

  const body = arrayMaps.map((arrayMap) => {
    const configProp = t.memberExpression(t.thisExpression(), t.identifier(getArrayConfigPropName(arrayMap)))
    const renderMethodName = getArrayRenderMethodName(arrayMap)
    const createMethodName = getArrayCreateMethodName(arrayMap)
    const patchMethodName = getArrayPatchMethodName(arrayMap)
    const propPatchers = buildPropPatchersObject(arrayMap)
    const hasIndex = !!arrayMap.indexVariable
    const renderLambdaParams: t.Identifier[] = [t.identifier('item')]
    const renderCallArgs: t.Expression[] = [t.identifier('item')]
    if (hasIndex) {
      renderLambdaParams.push(t.identifier('__idx'))
      renderCallArgs.push(t.identifier('__idx'))
    }
    const properties: t.ObjectProperty[] = [
      t.objectProperty(
        t.identifier('arrayPathParts'),
        t.arrayExpression(getArrayPathParts(arrayMap).map((part) => t.stringLiteral(part))),
      ),
      t.objectProperty(
        t.identifier('render'),
        t.callExpression(
          t.memberExpression(
            t.memberExpression(t.thisExpression(), t.identifier(renderMethodName)),
            t.identifier('bind'),
          ),
          [t.thisExpression()],
        ),
      ),
      t.objectProperty(
        t.identifier('create'),
        t.callExpression(
          t.memberExpression(
            t.memberExpression(t.thisExpression(), t.identifier(createMethodName)),
            t.identifier('bind'),
          ),
          [t.thisExpression()],
        ),
      ),
      t.objectProperty(
        t.identifier('patchRow'),
        t.logicalExpression(
          '&&',
          t.memberExpression(t.thisExpression(), t.identifier(patchMethodName)),
          t.callExpression(
            t.memberExpression(
              t.memberExpression(t.thisExpression(), t.identifier(patchMethodName)),
              t.identifier('bind'),
            ),
            [t.thisExpression()],
          ),
        ),
      ),
    ]

    if (arrayMap.itemIdProperty === ITEM_IS_KEY) {
      properties.push(
        t.objectProperty(
          t.identifier('getKey'),
          t.arrowFunctionExpression(
            [t.identifier('item')],
            t.callExpression(t.identifier('String'), [t.identifier('item')]),
          ),
        ),
      )
    } else if (arrayMap.itemIdProperty) {
      properties.push(
        t.objectProperty(
          t.identifier('getKey'),
          t.arrowFunctionExpression(
            [t.identifier('item')],
            t.callExpression(t.identifier('String'), [
              t.logicalExpression(
                '??',
                buildOptionalMemberChain(t.identifier('item'), arrayMap.itemIdProperty),
                t.identifier('item'),
              ),
            ]),
          ),
        ),
      )
    }

    if (propPatchers) {
      properties.push(t.objectProperty(t.identifier('propPatchers'), propPatchers))
    }

    // Detect if the map item template root is a component (PascalCase tag)
    const rootIsComponent =
      t.isJSXElement(arrayMap.itemTemplate) && isComponentTag(getJSXTagName(arrayMap.itemTemplate.openingElement.name))
    if (rootIsComponent) {
      properties.push(t.objectProperty(t.identifier('hasComponentItems'), t.booleanLiteral(true)))
    }

    return t.ifStatement(
      t.unaryExpression('!', configProp),
      t.blockStatement([
        t.expressionStatement(t.assignmentExpression('=', configProp, t.objectExpression(properties))),
      ]),
    )
  })

  return appendToBody(jsMethod`${id('__ensureArrayConfigs')}() {}`, ...body)
}

export function generateArrayRelationalObserver(
  path: string[],
  arrayMap: ArrayMapBinding,
  bindings: RelationalMapBinding[],
  methodName: string,
): { method: t.ClassMethod; privateFields: string[] } {
  const arrayPath = pathPartsToString(getArrayPathParts(arrayMap))
  const containerName = `__${arrayPath.replace(/\./g, '_')}_container`
  const containerRef = t.memberExpression(t.thisExpression(), t.identifier(containerName))
  const previousValue = t.identifier('__previousValue')
  const previousRowName = `__prev_${pathPartsToString(path).replace(/\./g, '_')}_row`
  const previousRowProp = t.memberExpression(t.thisExpression(), t.privateName(t.identifier(previousRowName)))

  const rowElsProp = `__rowEls_${arrayMap.containerBindingId ?? 'list'}`
  const elsRef = t.memberExpression(t.thisExpression(), t.privateName(t.identifier(rowElsProp)))

  const body: t.Statement[] = [
    lazyInit(containerName, arrayMap.containerSelector, arrayMap.containerBindingId, arrayMap.containerUserIdExpr),
    t.variableDeclaration('var', [
      t.variableDeclarator(
        previousValue,
        t.conditionalExpression(
          t.memberExpression(t.identifier('change'), t.numericLiteral(0), true),
          t.memberExpression(
            t.memberExpression(t.identifier('change'), t.numericLiteral(0), true),
            t.identifier('previousValue'),
          ),
          t.nullLiteral(),
        ),
      ),
    ]),
    t.variableDeclaration('var', [t.variableDeclarator(t.identifier('__previousRow'), previousRowProp)]),
    t.ifStatement(
      t.binaryExpression('!=', previousValue, t.nullLiteral()),
      t.blockStatement([
        t.ifStatement(
          t.logicalExpression(
            '||',
            t.unaryExpression('!', t.identifier('__previousRow')),
            t.unaryExpression('!', t.memberExpression(t.identifier('__previousRow'), t.identifier('isConnected'))),
          ),
          t.blockStatement(
            buildElsLookup(elsRef, containerRef, previousValue, '__previousRow', arrayMap.containerBindingId),
          ),
        ),
        t.ifStatement(
          t.identifier('__previousRow'),
          t.blockStatement(buildRelationalClassStatements(t.identifier('__previousRow'), bindings, false, 'old')),
        ),
      ]),
    ),
    t.variableDeclaration('var', [t.variableDeclarator(t.identifier('__nextRow'), t.nullLiteral())]),
    t.ifStatement(
      t.binaryExpression('!=', t.identifier('value'), t.nullLiteral()),
      t.blockStatement([
        ...buildElsLookup(elsRef, containerRef, t.identifier('value'), '__nextRow', arrayMap.containerBindingId),
        t.ifStatement(
          t.identifier('__nextRow'),
          t.blockStatement(buildRelationalClassStatements(t.identifier('__nextRow'), bindings, true, 'new')),
        ),
      ]),
    ),
    t.expressionStatement(
      t.assignmentExpression(
        '=',
        previousRowProp,
        t.logicalExpression('||', t.identifier('__nextRow'), t.nullLiteral()),
      ),
    ),
  ]

  return {
    method: appendToBody(jsMethod`${id(methodName)}(value, change) {}`, ...body),
    privateFields: [previousRowName, rowElsProp],
  }
}

export function generateArrayConditionalPatchObserver(
  arrayMap: ArrayMapBinding,
  bindings: ConditionalMapBinding[],
  methodName: string,
): t.ClassMethod {
  const arrayPath = pathPartsToString(getArrayPathParts(arrayMap))
  const containerName = `__${arrayPath.replace(/\./g, '_')}_container`
  const containerRef = t.memberExpression(t.thisExpression(), t.identifier(containerName))
  const proxiedArr = arrayMap.isImportedState
    ? buildMemberChain(
        t.memberExpression(t.identifier(arrayMap.storeVar || 'store'), t.identifier('__store')),
        arrayPath,
      )
    : buildMemberChain(t.thisExpression(), arrayPath)

  const rawArrExpr = t.logicalExpression(
    '||',
    t.memberExpression(t.cloneNode(proxiedArr, true), t.identifier('__getTarget')),
    t.cloneNode(proxiedArr, true),
  )

  const loopBody: t.Statement[] = [
    t.variableDeclaration('const', [
      t.variableDeclarator(t.identifier('item'), t.memberExpression(t.identifier('__arr'), t.identifier('__i'), true)),
      t.variableDeclarator(
        t.identifier('row'),
        t.memberExpression(t.memberExpression(containerRef, t.identifier('children')), t.identifier('__i'), true),
      ),
    ]),
    t.ifStatement(t.unaryExpression('!', t.identifier('row')), t.continueStatement()),
  ]

  bindings.forEach((binding, index) => {
    const targetId = `__target_${index}`
    const targetExpr = binding.childPath.length
      ? buildChildAccessExpr(t.identifier('row'), binding.childPath)
      : t.identifier('row')
    loopBody.push(
      t.variableDeclaration('const', [t.variableDeclarator(t.identifier(targetId), targetExpr)]),
      t.ifStatement(t.unaryExpression('!', t.identifier(targetId)), t.continueStatement()),
      buildConditionalPatchStatement(binding, t.identifier(targetId), arrayMap.itemVariable),
    )
  })

  return appendToBody(
    jsMethod`${id(methodName)}(value, change) {}`,
    t.blockStatement([
      lazyInit(containerName, arrayMap.containerSelector, arrayMap.containerBindingId, arrayMap.containerUserIdExpr),
      t.ifStatement(t.unaryExpression('!', containerRef), t.returnStatement()),
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier('__arr'),
          t.conditionalExpression(
            t.callExpression(t.memberExpression(t.identifier('Array'), t.identifier('isArray')), [rawArrExpr]),
            rawArrExpr,
            t.arrayExpression([]),
          ),
        ),
      ]),
      t.forStatement(
        t.variableDeclaration('let', [t.variableDeclarator(t.identifier('__i'), t.numericLiteral(0))]),
        t.binaryExpression('<', t.identifier('__i'), t.memberExpression(t.identifier('__arr'), t.identifier('length'))),
        t.updateExpression('++', t.identifier('__i')),
        t.blockStatement(loopBody),
      ),
    ]),
  )
}

export function generateArrayConditionalRerenderObserver(arrayMap: ArrayMapBinding, methodName: string): t.ClassMethod {
  const arrayPath = pathPartsToString(getArrayPathParts(arrayMap))
  const arrayPathParts = getArrayPathParts(arrayMap)
  const containerName = `__${arrayPath.replace(/\./g, '_')}_container`
  const containerRef = t.memberExpression(t.thisExpression(), t.identifier(containerName))
  const configRef = t.memberExpression(t.thisExpression(), t.identifier(getArrayConfigPropName(arrayMap)))
  const proxiedArr = arrayMap.isImportedState
    ? buildMemberChain(
        t.memberExpression(t.identifier(arrayMap.storeVar || 'store'), t.identifier('__store')),
        arrayPath,
      )
    : buildMemberChain(t.thisExpression(), arrayPath)

  const rawArrExpr = t.logicalExpression(
    '||',
    t.memberExpression(t.cloneNode(proxiedArr, true), t.identifier('__getTarget')),
    t.cloneNode(proxiedArr, true),
  )

  return appendToBody(
    jsMethod`${id(methodName)}(value, change) {}`,
    t.blockStatement([
      lazyInit(containerName, arrayMap.containerSelector, arrayMap.containerBindingId, arrayMap.containerUserIdExpr),
      t.ifStatement(t.unaryExpression('!', containerRef), t.returnStatement()),
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier('__c0'),
          t.memberExpression(t.identifier('change'), t.numericLiteral(0), true),
        ),
      ]),
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier('__skipArrayConditionalRerender'),
          t.logicalExpression(
            '&&',
            t.identifier('__c0'),
            t.logicalExpression(
              '||',
              t.binaryExpression(
                '===',
                t.memberExpression(t.identifier('__c0'), t.identifier('type')),
                t.stringLiteral('append'),
              ),
              t.logicalExpression(
                '||',
                t.binaryExpression(
                  '===',
                  t.memberExpression(t.identifier('__c0'), t.identifier('type')),
                  t.stringLiteral('add'),
                ),
                t.logicalExpression(
                  '||',
                  t.binaryExpression(
                    '===',
                    t.memberExpression(t.identifier('__c0'), t.identifier('type')),
                    t.stringLiteral('delete'),
                  ),
                  t.logicalExpression(
                    '||',
                    t.binaryExpression(
                      '===',
                      t.memberExpression(t.identifier('__c0'), t.identifier('type')),
                      t.stringLiteral('reorder'),
                    ),
                    t.logicalExpression(
                      '||',
                      t.binaryExpression(
                        '===',
                        t.memberExpression(t.identifier('__c0'), t.identifier('arrayOp')),
                        t.stringLiteral('swap'),
                      ),
                      t.logicalExpression(
                        '&&',
                        t.binaryExpression(
                          '===',
                          t.memberExpression(t.identifier('__c0'), t.identifier('type')),
                          t.stringLiteral('update'),
                        ),
                        buildPathPartsEquals(
                          t.memberExpression(t.identifier('__c0'), t.identifier('pathParts')),
                          arrayPathParts,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ]),
      t.ifStatement(
        t.unaryExpression('!', t.identifier('__skipArrayConditionalRerender')),
        t.blockStatement([
          t.expressionStatement(
            t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__ensureArrayConfigs')), []),
          ),
          t.variableDeclaration('const', [
            t.variableDeclarator(
              t.identifier('__arr'),
              t.conditionalExpression(
                t.callExpression(t.memberExpression(t.identifier('Array'), t.identifier('isArray')), [rawArrExpr]),
                rawArrExpr,
                t.arrayExpression([]),
              ),
            ),
          ]),
          t.expressionStatement(
            t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__applyListChanges')), [
              containerRef,
              t.identifier('__arr'),
              t.nullLiteral(),
              configRef,
            ]),
          ),
        ]),
      ),
    ]),
  )
}

function buildConditionalPatchStatement(
  binding: ConditionalMapBinding,
  target: t.Identifier,
  itemVariable: string,
): t.Statement {
  const expression = renameItemVariable(binding.expression, itemVariable)
  if (binding.type === 'text') {
    return js`${jsExpr`${target}.textContent`} = ${expression};`
  }
  if (binding.type === 'className') {
    return js`${jsExpr`${target}.className`} = ${buildTrimmedClassValueExpression(expression)};`
  }
  if (binding.attributeName === 'style') {
    return t.blockStatement(
      jsBlockBody`
      const __attrValue = ${expression};
      if (__attrValue == null || __attrValue === false) {
        ${jsExpr`${target}.removeAttribute('style')`};
      } else if (typeof __attrValue === 'object') {
        ${jsExpr`${target}.style.cssText`} = Object.entries(__attrValue).map(([k, v]) => k.replace(/[A-Z]/g, '-$&') + ': ' + v).join('; ');
      } else {
        ${jsExpr`${target}.style.cssText`} = String(__attrValue);
      }
    `,
    )
  }
  return t.blockStatement(
    jsBlockBody`
    const __attrValue = ${expression};
    if (__attrValue == null || __attrValue === false) {
      ${jsExpr`${target}.removeAttribute(${binding.attributeName || 'class'})`};
    } else {
      ${jsExpr`${target}.setAttribute(${binding.attributeName || 'class'}, String(__attrValue))`};
    }
  `,
  )
}

function renameItemVariable(expr: t.Expression, itemVariable: string): t.Expression {
  const cloned = t.cloneNode(expr, true) as t.Expression
  const program = t.program([t.expressionStatement(cloned)])
  traverse(program, {
    noScope: true,
    Identifier(path: NodePath<t.Identifier>) {
      if (path.node.name === itemVariable) path.node.name = 'item'
    },
  })
  return (program.body[0] as t.ExpressionStatement).expression
}

function buildRelationalClassStatements(
  rowExpr: t.Expression,
  bindings: RelationalMapBinding[],
  isMatch: boolean,
  phase: string,
): t.Statement[] {
  return bindings.flatMap((binding, index) => {
    const enabled = binding.classWhenMatch ? isMatch : !isMatch
    if (binding.selector === ':scope') {
      const expr = t.cloneNode(rowExpr, true)
      if (binding.scopeClassIsPure) {
        return jsBlockBody`
          ${expr}.className = ${enabled ? binding.classToggleName : ''};
        `
      }
      const cnVar = `__cn_${phase}_${index}`
      return jsBlockBody`
        var ${id(cnVar)} = ${expr}.className;
        if (${id(cnVar)} === '' || ${id(cnVar)} === ${binding.classToggleName}) {
          ${expr}.className = ${enabled ? binding.classToggleName : ''};
        } else {
          ${expr}.classList.toggle(${binding.classToggleName}, ${enabled});
        }
      `
    }
    const targetVar = `__target_${phase}_${index}`
    const targetExpr = t.cloneNode(rowExpr, true)
    return jsBlockBody`
      var ${id(targetVar)} = ${targetExpr};
      if (${id(targetVar)}) {
        ${jsExpr`${id(targetVar)}.classList.toggle(${binding.classToggleName}, ${enabled})`};
      }
    `
  })
}

function buildFindIndexLookup(
  containerRef: t.MemberExpression,
  idExpr: t.Expression,
  rowVar: string,
  containerBindingId?: string,
): t.Statement[] {
  return [
    t.variableDeclaration('var', [
      t.variableDeclarator(
        t.identifier(rowVar),
        buildQueryByItemId(t.cloneNode(containerRef), t.cloneNode(idExpr, true), containerBindingId),
      ),
    ]),
  ]
}

function buildElsLookup(
  elsRef: t.MemberExpression,
  containerRef: t.MemberExpression,
  idExpr: t.Expression,
  rowVar: string,
  containerBindingId?: string,
): t.Statement[] {
  const elsFallback = buildQueryByItemId(t.cloneNode(containerRef), t.cloneNode(idExpr, true), containerBindingId)
  const ctrLocal = t.identifier('__ctr')
  const qsFallback = t.callExpression(
    t.arrowFunctionExpression(
      [],
      t.blockStatement([
        t.variableDeclaration('const', [t.variableDeclarator(ctrLocal, t.cloneNode(containerRef))]),
        t.forStatement(
          t.variableDeclaration('let', [t.variableDeclarator(t.identifier('__i'), t.numericLiteral(0))]),
          t.binaryExpression(
            '<',
            t.identifier('__i'),
            t.memberExpression(
              t.memberExpression(ctrLocal, t.identifier('children')),
              t.identifier('length'),
            ),
          ),
          t.updateExpression('++', t.identifier('__i')),
          t.blockStatement([
            t.variableDeclaration('const', [
              t.variableDeclarator(
                t.identifier('__ch'),
                t.memberExpression(
                  t.memberExpression(t.cloneNode(ctrLocal), t.identifier('children')),
                  t.identifier('__i'),
                  true,
                ),
              ),
            ]),
            t.ifStatement(
              t.logicalExpression(
                '||',
                t.binaryExpression(
                  '==',
                  t.memberExpression(t.identifier('__ch'), t.identifier('__geaKey')),
                  t.cloneNode(idExpr, true),
                ),
                t.logicalExpression(
                  '&&',
                  t.binaryExpression(
                    '==',
                    t.memberExpression(t.identifier('__ch'), t.identifier('__geaKey')),
                    t.nullLiteral(),
                  ),
                  t.binaryExpression(
                    '==',
                    t.optionalCallExpression(
                      t.optionalMemberExpression(t.identifier('__ch'), t.identifier('getAttribute'), false, true),
                      [t.stringLiteral('data-gea-item-id')],
                      false,
                    ),
                    t.cloneNode(idExpr, true),
                  ),
                ),
              ),
              t.returnStatement(t.identifier('__ch')),
            ),
          ]),
        ),
        t.returnStatement(t.nullLiteral()),
      ]),
    ),
    [],
  )
  const cachedVar = t.identifier('__cached')
  return [
    t.variableDeclaration('var', [
      t.variableDeclarator(
        cachedVar,
        t.logicalExpression(
          '&&',
          t.cloneNode(elsRef),
          t.memberExpression(t.cloneNode(elsRef), t.cloneNode(idExpr, true), true),
        ),
      ),
    ]),
    t.variableDeclaration('var', [
      t.variableDeclarator(
        t.identifier(rowVar),
        t.logicalExpression(
          '||',
          t.logicalExpression(
            '||',
            t.logicalExpression(
              '&&',
              t.logicalExpression('&&', cachedVar, t.memberExpression(cachedVar, t.identifier('isConnected'))),
              cachedVar,
            ),
            elsFallback,
          ),
          qsFallback,
        ),
      ),
    ]),
  ]
}

export function generateArrayHandlers(
  arrayMap: ArrayMapBinding,
  methodName: string,
): { methods: t.ClassMethod[]; privateFields: string[] } {
  const arrayPathPartsValue = getArrayPathParts(arrayMap)
  const arrayPath = pathPartsToString(arrayPathPartsValue)
  const paramName = arrayPathPartsValue[arrayPathPartsValue.length - 1] || 'items'
  const containerName = `__${arrayPath.replace(/\./g, '_')}_container`
  const containerRef = t.memberExpression(t.thisExpression(), t.identifier(containerName))
  const configRef = t.memberExpression(t.thisExpression(), t.identifier(getArrayConfigPropName(arrayMap)))
  const rowElsProp = `__rowEls_${arrayMap.containerBindingId ?? 'list'}`
  const elsRef = t.memberExpression(t.thisExpression(), t.privateName(t.identifier(rowElsProp)))

  const clearElsStmt = t.expressionStatement(t.assignmentExpression('=', t.cloneNode(elsRef), t.nullLiteral()))

  const body: t.Statement[] = [
    lazyInit(containerName, arrayMap.containerSelector, arrayMap.containerBindingId, arrayMap.containerUserIdExpr),
    t.ifStatement(t.unaryExpression('!', containerRef), t.returnStatement()),
    t.ifStatement(
      t.logicalExpression(
        '&&',
        t.callExpression(t.memberExpression(t.identifier('Array'), t.identifier('isArray')), [t.identifier(paramName)]),
        t.binaryExpression(
          '===',
          t.memberExpression(t.identifier(paramName), t.identifier('length')),
          t.numericLiteral(0),
        ),
      ),
      t.blockStatement([
        clearElsStmt,
        t.expressionStatement(
          t.assignmentExpression(
            '=',
            t.memberExpression(containerRef, t.identifier('textContent')),
            t.stringLiteral(''),
          ),
        ),
        t.returnStatement(),
      ]),
    ),
    t.expressionStatement(
      t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__ensureArrayConfigs')), []),
    ),
    t.expressionStatement(
      t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__applyListChanges')), [
        containerRef,
        t.identifier(paramName),
        t.identifier('change'),
        configRef,
      ]),
    ),
  ]

  const method = appendToBody(jsMethod`${id(methodName)}(${id(paramName)}, change) {}`, ...body)
  return { methods: [method], privateFields: [rowElsProp] }
}

function lazyInit(name: string, selector: string, bindingId?: string, userIdExpr?: t.Expression): t.Statement {
  if (userIdExpr) {
    const idArg = t.isStringLiteral(userIdExpr) ? userIdExpr : t.cloneNode(userIdExpr, true)
    return js`
      if (!this.${id(name)}) {
        this.${id(name)} = document.getElementById(${idArg});
      }
    `
  }
  if (bindingId) {
    return js`
      if (!this.${id(name)}) {
        this.${id(name)} = document.getElementById(this.id + '-' + ${bindingId});
      }
    `
  }
  return js`
    if (!this.${id(name)}) {
      this.${id(name)} = this.$(":scope");
    }
  `
}

function buildQueryByItemId(
  _containerExpr: t.Expression,
  idExpr: t.Expression,
  containerBindingId: string | undefined,
): t.Expression {
  const bind = containerBindingId ?? 'list'
  return t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('getElementById')), [
    t.binaryExpression(
      '+',
      t.binaryExpression(
        '+',
        t.memberExpression(t.thisExpression(), t.identifier('id')),
        t.stringLiteral('-' + bind + '-gk-'),
      ),
      t.cloneNode(idExpr, true),
    ),
  ])
}

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

function buildChildAccessExpr(base: t.Expression, path: number[]): t.Expression {
  let expr = base
  for (const idx of path) {
    expr = t.memberExpression(expr, t.identifier('firstElementChild'))
    for (let i = 0; i < idx; i++) {
      expr = t.memberExpression(expr, t.identifier('nextElementSibling'))
    }
  }
  return expr
}
