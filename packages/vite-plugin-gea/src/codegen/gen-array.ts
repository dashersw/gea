/**
 * Array handler generation for the Gea compiler codegen.
 *
 * Generates __observe_* array observer methods, __ensureArrayConfigs,
 * relational class observers, and conditional patch/rerender observers
 * for array-mapped list rendering.
 */
import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '@babel/traverse'
import { appendToBody, id, js, jsAll, jsBlockBody, jsExpr, jsMethod } from 'eszter'
import type { ArrayMapBinding, ConditionalMapBinding, RelationalMapBinding } from '../ir/types.ts'
import { ITEM_IS_KEY } from '../analyze/helpers.ts'
import {
  buildOptionalMemberChain,
  buildMemberChain,
  buildTrimmedClassValueExpression,
  getJSXTagName,
  isComponentTag,
  normalizePathParts,
  pathPartsToString,
} from './ast-helpers.ts'
import { collectPatchEntries, childPathRefName, buildElementNavExpr } from './gen-array-patch.ts'
import { emitPatch, emitMount } from '../emit/registry.ts'

// ─── URL attributes ────────────────────────────────────────────────

const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'data', 'cite', 'poster', 'background'])

// ─── Internal helpers ──────────────────────────────────────────────

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

// ─── Prop patcher target expression ────────────────────────────────

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

// ─── Build prop patcher function ───────────────────────────────────

function buildPropPatcherFunction(
  binding: { type: string; selector: string; classToggleName?: string; childPath?: number[]; attributeName?: string },
  propName: string,
): t.Expression {
  const row = t.identifier('row')
  const value = t.identifier('value')
  const targetExpr = getPropPatcherTargetExpr(binding, row)

  if (binding.type === 'class') {
    const stmts = emitPatch('class', row, value, {
      classToggleName: binding.classToggleName || propName,
    })
    return t.arrowFunctionExpression([row, value], t.blockStatement(stmts))
  }

  const bodyStmts: t.Statement[] = jsBlockBody`
    const __target = ${targetExpr};
    if (!__target) return;
  `
  bodyStmts.push(...emitPatch(binding.type, t.identifier('__target'), value, {
    attributeName: binding.attributeName || (binding.type === 'attribute' ? 'class' : undefined),
    isUrlAttr: binding.attributeName ? URL_ATTRS.has(binding.attributeName) : false,
  }))
  return t.arrowFunctionExpression([row, value], t.blockStatement(bodyStmts))
}

// ─── Collect item expression keys ──────────────────────────────────

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

// ─── Build patch entry prop patcher ────────────────────────────────

function buildPatchEntryPropPatcher(entry: {
  childPath: number[]
  type: 'text' | 'className' | 'attribute'
  expression: t.Expression
  attributeName?: string
}): t.Expression {
  const row = t.identifier('row')
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

  const isRoot = entry.childPath.length === 0
  const stmts: t.Statement[] = []
  if (!isRoot) {
    stmts.push(...jsAll`const __target = ${targetExpr}; if (!__target) return;`)
  }
  const ref = isRoot ? row : t.identifier('__target')
  const emitType = entry.type === 'className' ? 'class' : entry.type
  stmts.push(
    ...emitPatch(emitType, ref, t.cloneNode(entry.expression, true) as t.Expression, {
      attributeName: entry.attributeName,
    }),
  )
  return t.arrowFunctionExpression(
    [t.identifier('row'), t.identifier('value'), t.identifier('item')],
    t.blockStatement(stmts),
  )
}

// ─── Build prop patchers object ────────────────────────────────────

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

// ─── Ensure array configs method ───────────────────────────────────

export function generateEnsureArrayConfigsMethod(arrayMaps: ArrayMapBinding[]): t.ClassMethod | null {
  if (arrayMaps.length === 0) return null

  const body = arrayMaps.map((arrayMap) => {
    const configProp = jsExpr`this.${id(getArrayConfigPropName(arrayMap))}`
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
        jsExpr`this.${id(renderMethodName)}.bind(this)`,
      ),
      t.objectProperty(
        t.identifier('create'),
        jsExpr`this.${id(createMethodName)}.bind(this)`,
      ),
      t.objectProperty(
        t.identifier('patchRow'),
        jsExpr`this.${id(patchMethodName)} && this.${id(patchMethodName)}.bind(this)`,
      ),
    ]

    if (arrayMap.itemIdProperty === ITEM_IS_KEY) {
      properties.push(
        t.objectProperty(
          t.identifier('getKey'),
          jsExpr`(item) => String(item)`,
        ),
      )
    } else if (arrayMap.itemIdProperty) {
      properties.push(
        t.objectProperty(
          t.identifier('getKey'),
          t.arrowFunctionExpression(
            [t.identifier('item')],
            jsExpr`String(${buildOptionalMemberChain(t.identifier('item'), arrayMap.itemIdProperty)} ?? item)`,
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

    return js`if (!${configProp}) {
      ${configProp} = ${t.objectExpression(properties)};
    }`
  })

  return appendToBody(jsMethod`${id('__ensureArrayConfigs')}() {}`, ...body)
}

// ─── Relational observer ───────────────────────────────────────────

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
        jsExpr`change[0] ? change[0].previousValue : null`,
      ),
    ]),
    t.variableDeclaration('var', [t.variableDeclarator(t.identifier('__previousRow'), previousRowProp)]),
    t.ifStatement(
      jsExpr`${previousValue} != null`,
      t.blockStatement([
        t.ifStatement(
          jsExpr`!__previousRow || !__previousRow.isConnected`,
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
      jsExpr`value != null`,
      t.blockStatement([
        ...buildElsLookup(elsRef, containerRef, t.identifier('value'), '__nextRow', arrayMap.containerBindingId),
        t.ifStatement(
          t.identifier('__nextRow'),
          t.blockStatement(buildRelationalClassStatements(t.identifier('__nextRow'), bindings, true, 'new')),
        ),
      ]),
    ),
    js`${previousRowProp} = __nextRow || null;`,
  ]

  return {
    method: appendToBody(jsMethod`${id(methodName)}(value, change) {}`, ...body),
    privateFields: [previousRowName, rowElsProp],
  }
}

// ─── Conditional patch observer ────────────────────────────────────

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
        jsExpr`${id(arrayMap.storeVar || 'store')}.__store`,
        arrayPath,
      )
    : buildMemberChain(t.thisExpression(), arrayPath)

  const rawArrExpr = jsExpr`${t.cloneNode(proxiedArr, true)}.__getTarget || ${t.cloneNode(proxiedArr, true)}`

  const loopBody: t.Statement[] = [
    ...jsAll`
      const item = __arr[__i];
      const row = ${containerRef}.children[__i];
    `,
    js`if (!row) continue;`,
  ]

  bindings.forEach((binding, index) => {
    const targetId = `__target_${index}`
    const targetExpr = binding.childPath.length
      ? buildChildAccessExpr(t.identifier('row'), binding.childPath)
      : t.identifier('row')
    loopBody.push(
      ...jsAll`const ${id(targetId)} = ${targetExpr}; if (!${id(targetId)}) continue;`,
      buildConditionalPatchStatement(binding, t.identifier(targetId), arrayMap.itemVariable),
    )
  })

  return appendToBody(
    jsMethod`${id(methodName)}(value, change) {}`,
    t.blockStatement([
      lazyInit(containerName, arrayMap.containerSelector, arrayMap.containerBindingId, arrayMap.containerUserIdExpr),
      js`if (!${containerRef}) return;`,
      ...jsAll`const __arr = Array.isArray(${rawArrExpr}) ? ${rawArrExpr} : [];`,
      t.forStatement(
        t.variableDeclaration('let', [t.variableDeclarator(t.identifier('__i'), t.numericLiteral(0))]),
        jsExpr`__i < __arr.length`,
        t.updateExpression('++', t.identifier('__i')),
        t.blockStatement(loopBody),
      ),
    ]),
  )
}

// ─── Conditional rerender observer ─────────────────────────────────

export function generateArrayConditionalRerenderObserver(arrayMap: ArrayMapBinding, methodName: string): t.ClassMethod {
  const arrayPath = pathPartsToString(getArrayPathParts(arrayMap))
  const arrayPathParts = getArrayPathParts(arrayMap)
  const containerName = `__${arrayPath.replace(/\./g, '_')}_container`
  const containerRef = t.memberExpression(t.thisExpression(), t.identifier(containerName))
  const configRef = t.memberExpression(t.thisExpression(), t.identifier(getArrayConfigPropName(arrayMap)))
  const proxiedArr = arrayMap.isImportedState
    ? buildMemberChain(
        jsExpr`${id(arrayMap.storeVar || 'store')}.__store`,
        arrayPath,
      )
    : buildMemberChain(t.thisExpression(), arrayPath)

  const rawArrExpr = jsExpr`${t.cloneNode(proxiedArr, true)}.__getTarget || ${t.cloneNode(proxiedArr, true)}`

  return appendToBody(
    jsMethod`${id(methodName)}(value, change) {}`,
    t.blockStatement([
      lazyInit(containerName, arrayMap.containerSelector, arrayMap.containerBindingId, arrayMap.containerUserIdExpr),
      js`if (!${containerRef}) return;`,
      ...jsAll`const __c0 = change[0];`,
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier('__skipArrayConditionalRerender'),
          t.logicalExpression(
            '&&',
            t.identifier('__c0'),
            t.logicalExpression(
              '||',
              jsExpr`__c0.type === 'append'`,
              t.logicalExpression(
                '||',
                jsExpr`__c0.type === 'add'`,
                t.logicalExpression(
                  '||',
                  jsExpr`__c0.type === 'delete'`,
                  t.logicalExpression(
                    '||',
                    jsExpr`__c0.type === 'reorder'`,
                    t.logicalExpression(
                      '||',
                      jsExpr`__c0.arrayOp === 'swap'`,
                      t.logicalExpression(
                        '&&',
                        jsExpr`__c0.type === 'update'`,
                        buildPathPartsEquals(
                          jsExpr`__c0.pathParts`,
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
        jsExpr`!__skipArrayConditionalRerender`,
        t.blockStatement([
          js`this.__ensureArrayConfigs();`,
          ...jsAll`const __arr = Array.isArray(${rawArrExpr}) ? ${rawArrExpr} : [];`,
          js`this.__applyListChanges(${containerRef}, __arr, null, ${configRef});`,
        ]),
      ),
    ]),
  )
}

// ─── Array handlers ────────────────────────────────────────────────

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

  const clearElsStmt = js`${t.cloneNode(elsRef)} = null;`

  const body: t.Statement[] = [
    lazyInit(containerName, arrayMap.containerSelector, arrayMap.containerBindingId, arrayMap.containerUserIdExpr),
    js`if (!${containerRef}) return;`,
    t.ifStatement(
      jsExpr`Array.isArray(${id(paramName)}) && ${id(paramName)}.length === 0`,
      t.blockStatement([
        clearElsStmt,
        js`${containerRef}.textContent = '';`,
        t.returnStatement(),
      ]),
    ),
    js`this.__ensureArrayConfigs();`,
    js`this.__applyListChanges(${containerRef}, ${id(paramName)}, change, ${configRef});`,
  ]

  const method = appendToBody(jsMethod`${id(methodName)}(${id(paramName)}, change) {}`, ...body)
  return { methods: [method], privateFields: [rowElsProp] }
}

// ─── Lazy init helper ──────────────────────────────────────────────

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

// ─── Query by item ID ──────────────────────────────────────────────

function buildQueryByItemId(
  _containerExpr: t.Expression,
  idExpr: t.Expression,
  containerBindingId: string | undefined,
): t.Expression {
  const bind = containerBindingId ?? 'list'
  return jsExpr`document.getElementById(this.id + ${'-' + bind + '-gk-'} + ${t.cloneNode(idExpr, true)})`
}

// ─── Path parts equality ───────────────────────────────────────────

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

// ─── Child access expression ───────────────────────────────────────

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

// ─── Conditional patch statement ───────────────────────────────────

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
      const __newAttr = String(__attrValue);
      if (${jsExpr`${target}.getAttribute(${binding.attributeName || 'class'})`} !== __newAttr) {
        ${jsExpr`${target}.setAttribute(${binding.attributeName || 'class'}, __newAttr)`};
      }
    }
  `,
  )
}

// ─── Rename item variable ──────────────────────────────────────────

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

// ─── Relational class statements ───────────────────────────────────

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

// ─── Els lookup ────────────────────────────────────────────────────

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
          jsExpr`__i < ${t.cloneNode(ctrLocal, true)}.children.length`,
          t.updateExpression('++', t.identifier('__i')),
          t.blockStatement([
            ...jsAll`const __ch = ${t.cloneNode(ctrLocal, true)}.children[__i];`,
            t.ifStatement(
              t.logicalExpression(
                '||',
                jsExpr`__ch.__geaKey == ${t.cloneNode(idExpr, true)}`,
                t.logicalExpression(
                  '&&',
                  jsExpr`__ch.__geaKey == null`,
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
        jsExpr`${t.cloneNode(elsRef)} && ${t.cloneNode(elsRef)}[${t.cloneNode(idExpr, true)}]`,
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
              jsExpr`${t.cloneNode(cachedVar, true)} && ${t.cloneNode(cachedVar, true)}.isConnected`,
              t.cloneNode(cachedVar, true),
            ),
            elsFallback,
          ),
          qsFallback,
        ),
      ),
    ]),
  ]
}
