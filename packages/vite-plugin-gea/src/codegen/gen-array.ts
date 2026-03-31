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
import { emitPatch } from '../emit/registry.ts'

// ─── Internal helpers ──────────────────────────────────────────────

const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'data', 'cite', 'poster', 'background'])

function thisProp(name: string): t.MemberExpression { return t.memberExpression(t.thisExpression(), id(name)) }
function thisPrivate(name: string): t.MemberExpression { return t.memberExpression(t.thisExpression(), t.privateName(id(name))) }

function getArrayPathParts(am: ArrayMapBinding): string[] { return am.arrayPathParts || normalizePathParts((am as any).arrayPath || '') }
function getArrayPath(am: ArrayMapBinding): string { return pathPartsToString(getArrayPathParts(am)) }
function getArrayCapName(am: ArrayMapBinding): string { const p = getArrayPath(am); return p.charAt(0).toUpperCase() + p.slice(1).replace(/\./g, '') }
function getArrayConfigPropName(am: ArrayMapBinding): string { return `__${getArrayPath(am).replace(/\./g, '_')}ListConfig` }
function getArrayCreateMethodName(am: ArrayMapBinding): string { return `create${getArrayCapName(am)}Item` }
function getArrayRenderMethodName(am: ArrayMapBinding): string { return `render${getArrayCapName(am)}Item` }
function getArrayPatchMethodName(am: ArrayMapBinding): string { return `patch${getArrayCapName(am)}Item` }

// ─── Prop patcher target expression ────────────────────────────────

function getPropPatcherTargetExpr(
  binding: { selector: string; childPath?: number[] },
  rowExpr: t.Expression,
): t.Expression {
  if (binding.childPath?.length) return buildElementNavExpr(rowExpr, binding.childPath)
  if (binding.selector === ':scope') return t.cloneNode(rowExpr, true)
  throw new Error(`getPropPatcherTargetExpr: childPath required when selector is not :scope (got "${binding.selector}").`)
}

// ─── Build prop patcher function ───────────────────────────────────

function buildPropPatcherFunction(
  binding: { type: string; selector: string; classToggleName?: string; childPath?: number[]; attributeName?: string },
  propName: string,
): t.Expression {
  const row = id('row'), value = id('value')
  const targetExpr = getPropPatcherTargetExpr(binding, row)

  if (binding.type === 'class') {
    return t.arrowFunctionExpression([row, value], t.blockStatement(
      emitPatch('class', row, value, { classToggleName: binding.classToggleName || propName }),
    ))
  }

  const bodyStmts: t.Statement[] = jsBlockBody`const __target = ${targetExpr}; if (!__target) return;`
  bodyStmts.push(...emitPatch(binding.type, id('__target'), value, {
    attributeName: binding.attributeName || (binding.type === 'attribute' ? 'class' : undefined),
    isUrlAttr: binding.attributeName ? URL_ATTRS.has(binding.attributeName) : false,
  }))
  return t.arrowFunctionExpression([row, value], t.blockStatement(bodyStmts))
}

// ─── Collect item expression keys ──────────────────────────────────

function collectItemExpressionKeys(expr: t.Expression): string[] {
  const keys = new Set<string>()
  traverse(t.program([t.expressionStatement(t.cloneNode(expr, true))]), {
    noScope: true,
    MemberExpression(path: NodePath<t.MemberExpression>) {
      if (t.isIdentifier(path.node.object, { name: 'item' }) && !path.node.computed && t.isIdentifier(path.node.property))
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
  const row = id('row')
  const refName = childPathRefName(entry.childPath)
  const isRoot = entry.childPath.length === 0
  const targetExpr = isRoot ? row
    : t.logicalExpression('||',
        jsExpr`${row}.${id(refName)}`,
        t.parenthesizedExpression(t.assignmentExpression('=',
          jsExpr`${t.cloneNode(row, true)}.${id(refName)}`,
          buildElementNavExpr(t.cloneNode(row, true), entry.childPath))))

  const stmts: t.Statement[] = isRoot ? [] : jsAll`const __target = ${targetExpr}; if (!__target) return;`
  const emitType = entry.type === 'className' ? 'class' : entry.type
  stmts.push(...emitPatch(emitType, isRoot ? row : id('__target'), t.cloneNode(entry.expression, true) as t.Expression, { attributeName: entry.attributeName }))
  return t.arrowFunctionExpression([id('row'), id('value'), id('item')], t.blockStatement(stmts))
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

  const prop = (key: string, val: t.Expression) => t.objectProperty(id(key), val)

  const body = arrayMaps.map((arrayMap) => {
    const configProp = jsExpr`this.${id(getArrayConfigPropName(arrayMap))}`
    const renderMethodName = getArrayRenderMethodName(arrayMap)
    const createMethodName = getArrayCreateMethodName(arrayMap)
    const patchMethodName = getArrayPatchMethodName(arrayMap)
    const propPatchers = buildPropPatchersObject(arrayMap)
    const properties: t.ObjectProperty[] = [
      prop('arrayPathParts', t.arrayExpression(getArrayPathParts(arrayMap).map((p) => t.stringLiteral(p)))),
      prop('render', jsExpr`this.${id(renderMethodName)}.bind(this)`),
      prop('create', jsExpr`this.${id(createMethodName)}.bind(this)`),
      prop('patchRow', jsExpr`this.${id(patchMethodName)} && this.${id(patchMethodName)}.bind(this)`),
    ]

    if (arrayMap.itemIdProperty === ITEM_IS_KEY) {
      properties.push(prop('getKey', jsExpr`(item) => String(item)`))
    } else if (arrayMap.itemIdProperty) {
      properties.push(prop('getKey', t.arrowFunctionExpression(
        [id('item')],
        jsExpr`String(${buildOptionalMemberChain(id('item'), arrayMap.itemIdProperty)} ?? item)`,
      )))
    }

    if (propPatchers) properties.push(prop('propPatchers', propPatchers))

    const rootIsComponent =
      t.isJSXElement(arrayMap.itemTemplate) && isComponentTag(getJSXTagName(arrayMap.itemTemplate.openingElement.name))
    if (rootIsComponent) properties.push(prop('hasComponentItems', t.booleanLiteral(true)))

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
  const containerRef = thisProp(containerName)
  const previousValue = id('__previousValue')
  const previousRowName = `__prev_${pathPartsToString(path).replace(/\./g, '_')}_row`
  const previousRowProp = thisPrivate(previousRowName)

  const rowElsProp = `__rowEls_${arrayMap.containerBindingId ?? 'list'}`
  const elsRef = thisPrivate(rowElsProp)

  const body: t.Statement[] = [
    lazyInit(containerName, arrayMap.containerSelector, arrayMap.containerBindingId, arrayMap.containerUserIdExpr),
    js`var ${previousValue} = change[0] ? change[0].previousValue : null;`,
    js`var __previousRow = ${previousRowProp};`,
    t.ifStatement(
      jsExpr`${previousValue} != null`,
      t.blockStatement([
        t.ifStatement(
          jsExpr`!__previousRow || !__previousRow.isConnected`,
          t.blockStatement(buildElsLookup(elsRef, containerRef, previousValue, '__previousRow', arrayMap.containerBindingId)),
        ),
        t.ifStatement(id('__previousRow'), t.blockStatement(buildRelationalClassStatements(id('__previousRow'), bindings, false, 'old'))),
      ]),
    ),
    js`var __nextRow = null;`,
    t.ifStatement(
      jsExpr`value != null`,
      t.blockStatement([
        ...buildElsLookup(elsRef, containerRef, id('value'), '__nextRow', arrayMap.containerBindingId),
        t.ifStatement(id('__nextRow'), t.blockStatement(buildRelationalClassStatements(id('__nextRow'), bindings, true, 'new'))),
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
  const containerRef = thisProp(containerName)
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
      ? buildElementNavExpr(t.identifier('row'), binding.childPath)
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
        js`let __i = 0;` as unknown as t.VariableDeclaration,
        jsExpr`__i < __arr.length`,
        t.updateExpression('++', id('__i')),
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
  const containerRef = thisProp(containerName)
  const configRef = thisProp(getArrayConfigPropName(arrayMap))
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
      (() => {
        const skipTypes: t.Expression[] = [
          jsExpr`__c0.type === 'append'`,
          jsExpr`__c0.type === 'add'`,
          jsExpr`__c0.type === 'delete'`,
          jsExpr`__c0.type === 'reorder'`,
          jsExpr`__c0.arrayOp === 'swap'`,
          t.logicalExpression('&&', jsExpr`__c0.type === 'update'`, buildPathPartsEquals(jsExpr`__c0.pathParts`, arrayPathParts)),
        ]
        const orChain = skipTypes.reduce<t.Expression>((a, b) => t.logicalExpression('||', a, b))
        return t.variableDeclaration('const', [
          t.variableDeclarator(id('__skipArrayConditionalRerender'), t.logicalExpression('&&', id('__c0'), orChain)),
        ])
      })(),
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
  const containerRef = thisProp(containerName)
  const configRef = thisProp(getArrayConfigPropName(arrayMap))
  const rowElsProp = `__rowEls_${arrayMap.containerBindingId ?? 'list'}`
  const elsRef = thisPrivate(rowElsProp)

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
  let result: t.Expression = jsExpr`${t.cloneNode(expr)} && ${t.cloneNode(expr)}.length === ${parts.length}`
  for (let i = 0; i < parts.length; i++) {
    result = t.logicalExpression('&&', result, jsExpr`${t.cloneNode(expr)}[${i}] === ${parts[i]}`)
  }
  return result
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

function renameItemVariable(expr: t.Expression, itemVariable: string): t.Expression {
  const cloned = t.cloneNode(expr, true) as t.Expression
  const program = t.program([t.expressionStatement(cloned)])
  traverse(program, { noScope: true, Identifier(path: NodePath<t.Identifier>) { if (path.node.name === itemVariable) path.node.name = 'item' } })
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

// ─── Els lookup ────────────────────────────────────────────────────

function buildElsLookup(
  elsRef: t.MemberExpression,
  containerRef: t.MemberExpression,
  idExpr: t.Expression,
  rowVar: string,
  containerBindingId?: string,
): t.Statement[] {
  const elsFallback = buildQueryByItemId(t.cloneNode(containerRef), t.cloneNode(idExpr, true), containerBindingId)
  const ctr = id('__ctr')
  const ch = id('__ch')
  const i = id('__i')
  const qsFallback = t.callExpression(
    t.arrowFunctionExpression([], t.blockStatement([
      js`const ${ctr} = ${t.cloneNode(containerRef)};`,
      t.forStatement(
        js`let ${i} = 0;` as unknown as t.VariableDeclaration,
        jsExpr`${i} < ${t.cloneNode(ctr, true)}.children.length`,
        t.updateExpression('++', t.cloneNode(i, true)),
        t.blockStatement([
          js`const ${ch} = ${t.cloneNode(ctr, true)}.children[${t.cloneNode(i, true)}];`,
          t.ifStatement(
            t.logicalExpression('||',
              jsExpr`${ch}.__geaKey == ${t.cloneNode(idExpr, true)}`,
              t.logicalExpression('&&',
                jsExpr`${ch}.__geaKey == null`,
                t.binaryExpression('==',
                  t.optionalCallExpression(
                    t.optionalMemberExpression(t.cloneNode(ch, true), id('getAttribute'), false, true),
                    [t.stringLiteral('data-gea-item-id')], false),
                  t.cloneNode(idExpr, true)),
              ),
            ),
            t.returnStatement(t.cloneNode(ch, true)),
          ),
        ]),
      ),
      t.returnStatement(t.nullLiteral()),
    ])),
    [],
  )
  const cached = id('__cached')
  return [
    js`var ${cached} = ${t.cloneNode(elsRef)} && ${t.cloneNode(elsRef)}[${t.cloneNode(idExpr, true)}];`,
    t.variableDeclaration('var', [t.variableDeclarator(
      id(rowVar),
      t.logicalExpression('||',
        t.logicalExpression('||',
          t.logicalExpression('&&',
            jsExpr`${t.cloneNode(cached, true)} && ${t.cloneNode(cached, true)}.isConnected`,
            t.cloneNode(cached, true)),
          elsFallback),
        qsFallback),
    )]),
  ]
}
