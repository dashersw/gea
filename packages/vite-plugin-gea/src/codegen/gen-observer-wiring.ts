/**
 * gen-observer-wiring.ts
 *
 * Generates the `createdHooks()` method that registers `__observe()` and
 * `__observeList()` calls, the `__setupLocalStateObservers()` method for
 * local-state bindings, and individual observer class methods
 * (inline-patch, rerender, conditional-slot, state-child-swap, relational).
 */

import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '../utils/babel-interop.ts'
import { appendToBody, id, js, jsBlockBody, jsExpr, jsMethod } from 'eszter'

import type {
  PathParts,
  UnresolvedMapInfo,
  UnresolvedRelationalClassBinding,
} from '../ir/types.ts'
import { ITEM_IS_KEY } from '../analyze/helpers.ts'

import {
  buildOptionalMemberChain,
  getObserveMethodName,
  pathPartsToString,
  replacePropRefsInExpression,
  replacePropRefsInStatements,
} from './ast-helpers.ts'
import { getComponentArrayItemsName } from './gen-array-slot-sync.ts'

// ═══════════════════════════════════════════════════════════════════════════
// Private helpers
// ═══════════════════════════════════════════════════════════════════════════

function serializeAstNode(node: t.Node | null | undefined): string {
  return node ? JSON.stringify(node) : ''
}

export function classMethodUsesParam(method: t.ClassMethod, index: number): boolean {
  const param = method.params[index]
  if (!t.isIdentifier(param) || !t.isBlockStatement(method.body)) return true
  let used = false
  const program = t.program(method.body.body.map((stmt) => t.cloneNode(stmt, true) as t.Statement))
  traverse(program, {
    noScope: true,
    Identifier(path: NodePath<t.Identifier>) {
      if (!path.isReferencedIdentifier()) return
      if (path.node.name !== param.name) return
      used = true
      path.stop()
    },
  })
  return used
}

function lazyInit(name: string, value: t.Expression): t.Statement {
  return t.ifStatement(
    t.unaryExpression('!', t.memberExpression(t.thisExpression(), t.identifier(name))),
    t.expressionStatement(
      t.assignmentExpression('=', t.memberExpression(t.thisExpression(), t.identifier(name)), value),
    ),
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// createdHooks generation
// ═══════════════════════════════════════════════════════════════════════════

export function generateCreatedHooks(
  stores: Array<{
    storeVar: string
    captureExpression: t.Expression
    observeHandlers: Array<{
      pathParts: PathParts
      methodName: string
      isVia?: boolean
      rereadExpr?: t.Expression
      dynamicKeyExpr?: t.Expression
      passValue?: boolean
    }>
  }>,
  hasArrayConfigs: boolean,
  observeListConfigs: Array<{
    storeVar: string
    pathParts: PathParts
    arrayPropName: string
    componentTag: string
    containerBindingId?: string
    containerUserIdExpr?: t.Expression
    itemIdProperty?: string
  }> = [],
): t.ClassMethod {
  const body: t.Statement[] = []

  if (hasArrayConfigs) {
    body.push(js`this.__ensureArrayConfigs();`)
  }

  // Collect all observe handlers and group by store+path, including
  // those that should become onchange callbacks for __observeList
  const observeListPathKeys = new Set<string>()
  for (const config of observeListConfigs) {
    observeListPathKeys.add(`${config.storeVar}:${JSON.stringify(config.pathParts)}`)
  }

  for (const store of stores) {
    // Group handlers by path to merge duplicate observers
    const byPath = new Map<
      string,
      Array<{
        pathParts: PathParts
        methodName: string
        isVia?: boolean
        rereadExpr?: t.Expression
        dynamicKeyExpr?: t.Expression
        passValue?: boolean
      }>
    >()
    for (const handler of store.observeHandlers) {
      const pathKey = JSON.stringify(handler.pathParts)
      // Skip handlers whose path is covered by __observeList
      const listKey = `${store.storeVar}:${pathKey}`
      if (observeListPathKeys.has(listKey)) continue
      if (!byPath.has(pathKey)) byPath.set(pathKey, [])
      byPath.get(pathKey)!.push({
        pathParts: handler.pathParts,
        methodName: handler.methodName,
        isVia: handler.isVia,
        rereadExpr: handler.rereadExpr,
        dynamicKeyExpr: handler.dynamicKeyExpr,
        passValue: handler.passValue,
      })
    }

    const storeVarExpr = t.identifier(store.storeVar)

    for (const [pathKey, handlers] of byPath) {
      const pathParts: PathParts = JSON.parse(pathKey)
      const pathArray = t.arrayExpression(pathParts.map((part) => t.stringLiteral(part)))

      if (handlers.length === 1 && !handlers[0].isVia) {
        // Single handler -- direct method reference
        body.push(
          t.expressionStatement(
            t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__observe')), [
              storeVarExpr,
              pathArray,
              t.memberExpression(t.thisExpression(), t.identifier(handlers[0].methodName)),
            ]),
          ),
        )
      } else {
        // Multiple handlers or via handlers -- merged arrow function
        const vParam = t.identifier('__v')
        const cParam = t.identifier('__c')
        const callStmts: t.Statement[] = []
        const seenCallKeys = new Set<string>()
        for (let hi = 0; hi < handlers.length; hi++) {
          const h = handlers[hi]
          const callKey = [
            h.methodName,
            h.isVia ? 'via' : 'direct',
            h.passValue === false ? 'novalue' : 'value',
            serializeAstNode(h.dynamicKeyExpr),
            h.passValue === false ? '' : serializeAstNode(h.rereadExpr as t.Node | undefined),
          ].join('|')
          if (seenCallKeys.has(callKey)) continue
          seenCallKeys.add(callKey)
          if (h.isVia && h.rereadExpr) {
            const callStmt = t.expressionStatement(
              t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(h.methodName)), [
                h.passValue === false ? t.identifier('undefined') : t.cloneNode(h.rereadExpr, true),
                t.nullLiteral(),
              ]),
            )
            if (h.dynamicKeyExpr) {
              const keyId = t.identifier(`__geaKey${hi}`)
              const changeId = t.identifier(`__geaChange${hi}`)
              const partsId = t.identifier(`__geaParts${hi}`)
              const prevRootId = t.identifier(`__geaPrevRoot${hi}`)
              const prefixChecks = h.pathParts.map((part, idx) =>
                t.binaryExpression(
                  '===',
                  t.memberExpression(partsId, t.numericLiteral(idx), true),
                  t.stringLiteral(part),
                ),
              )
              const prevEntryExpr = t.conditionalExpression(
                t.binaryExpression('==', prevRootId, t.nullLiteral()),
                t.identifier('undefined'),
                t.memberExpression(prevRootId, keyId, true),
              )
              const nextEntryExpr = t.conditionalExpression(
                t.binaryExpression('==', vParam, t.nullLiteral()),
                t.identifier('undefined'),
                t.memberExpression(vParam, keyId, true),
              )
              const sameRootAffectsKey = t.logicalExpression(
                '&&',
                t.binaryExpression(
                  '===',
                  t.memberExpression(partsId, t.identifier('length')),
                  t.numericLiteral(h.pathParts.length),
                ),
                t.binaryExpression('!==', prevEntryExpr, nextEntryExpr),
              )
              const matchingNestedKey = t.binaryExpression(
                '===',
                t.memberExpression(partsId, t.numericLiteral(h.pathParts.length), true),
                keyId,
              )
              const sameRootOrMatchingKey = t.logicalExpression('||', sameRootAffectsKey, matchingNestedKey)
              const relevantChangeExpr = prefixChecks
                .concat([sameRootOrMatchingKey])
                .reduce<t.Expression>((left, right) => t.logicalExpression('&&', left, right))
              const someCall = t.callExpression(t.memberExpression(cParam, t.identifier('some')), [
                t.arrowFunctionExpression(
                  [changeId],
                  t.blockStatement([
                    t.variableDeclaration('const', [
                      t.variableDeclarator(partsId, t.memberExpression(changeId, t.identifier('pathParts'))),
                      t.variableDeclarator(
                        prevRootId,
                        t.memberExpression(changeId, t.identifier('previousValue')),
                      ),
                    ]),
                    t.returnStatement(
                      t.logicalExpression(
                        '&&',
                        t.callExpression(t.memberExpression(t.identifier('Array'), t.identifier('isArray')), [partsId]),
                        relevantChangeExpr,
                      ),
                    ),
                  ]),
                ),
              ])
              callStmts.push(
                t.blockStatement([
                  t.variableDeclaration('const', [
                    t.variableDeclarator(keyId, t.cloneNode(h.dynamicKeyExpr, true)),
                  ]),
                  t.ifStatement(
                    t.logicalExpression(
                      '&&',
                      t.callExpression(t.memberExpression(t.identifier('Array'), t.identifier('isArray')), [cParam]),
                      someCall,
                    ),
                    t.blockStatement([callStmt]),
                  ),
                ]),
              )
            } else {
              callStmts.push(callStmt)
            }
          } else {
            callStmts.push(
              t.expressionStatement(
                t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(h.methodName)), [vParam, cParam]),
              ),
            )
          }
        }
        body.push(
          t.expressionStatement(
            t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__observe')), [
              storeVarExpr,
              pathArray,
              t.arrowFunctionExpression([vParam, cParam], t.blockStatement(callStmts)),
            ]),
          ),
        )
      }
    }

    // Generate __observeList calls for component array slots on this store
    for (const config of observeListConfigs.filter((c) => c.storeVar === store.storeVar)) {
      const pathArray = t.arrayExpression(config.pathParts.map((part) => t.stringLiteral(part)))
      const itemsName = getComponentArrayItemsName(config.arrayPropName)
      const itemPropsMethodName = `__itemProps_${config.arrayPropName}`

      const configProps: t.ObjectProperty[] = [
        t.objectProperty(t.identifier('items'), t.memberExpression(t.thisExpression(), t.identifier(itemsName))),
        t.objectProperty(t.identifier('itemsKey'), t.stringLiteral(itemsName)),
        t.objectProperty(
          t.identifier('container'),
          t.arrowFunctionExpression(
            [],
            config.containerUserIdExpr
              ? t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('getElementById')), [
                  t.cloneNode(config.containerUserIdExpr, true) as t.Expression,
                ])
              : config.containerBindingId
                ? t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__el')), [
                    t.stringLiteral(config.containerBindingId),
                  ])
                : (jsExpr`this.$(":scope")` as t.Expression),
          ),
        ),
        t.objectProperty(t.identifier('Ctor'), t.identifier(config.componentTag)),
        t.objectProperty(
          t.identifier('props'),
          t.arrowFunctionExpression(
            [t.identifier('opt'), t.identifier('__k')],
            t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(itemPropsMethodName)), [
              t.identifier('opt'),
              t.identifier('__k'),
            ]),
          ),
        ),
        t.objectProperty(
          t.identifier('key'),
          config.itemIdProperty && config.itemIdProperty !== ITEM_IS_KEY
            ? t.arrowFunctionExpression(
                [t.identifier('opt')],
                t.logicalExpression(
                  '??',
                  buildOptionalMemberChain(t.identifier('opt'), config.itemIdProperty),
                  t.identifier('opt'),
                ),
              )
            : config.itemIdProperty === ITEM_IS_KEY
              ? t.arrowFunctionExpression([t.identifier('opt')], t.identifier('opt'))
              : t.arrowFunctionExpression(
                  [t.identifier('opt'), t.identifier('__k')],
                  t.binaryExpression('+', t.stringLiteral('__idx_'), t.identifier('__k')),
                ),
        ),
      ]

      // Merge any scalar observers on the same path into the onchange callback
      const samePathHandlers: Array<{ methodName: string; isVia?: boolean; rereadExpr?: t.Expression }> = []
      const pathKey = JSON.stringify(config.pathParts)
      for (const handler of store.observeHandlers) {
        if (JSON.stringify(handler.pathParts) === pathKey) {
          samePathHandlers.push(handler)
        }
      }
      if (samePathHandlers.length > 0) {
        const onchangeStmts: t.Statement[] = samePathHandlers.map((h) =>
          t.expressionStatement(
            h.isVia && h.rereadExpr
              ? t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(h.methodName)), [
                  t.cloneNode(h.rereadExpr, true),
                  t.nullLiteral(),
                ])
              : t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(h.methodName)), [
                  t.memberExpression(t.identifier(config.storeVar), t.identifier(config.pathParts[0])),
                  t.nullLiteral(),
                ]),
          ),
        )
        configProps.push(
          t.objectProperty(t.identifier('onchange'), t.arrowFunctionExpression([], t.blockStatement(onchangeStmts))),
        )
      }

      body.push(
        t.expressionStatement(
          t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__observeList')), [
            storeVarExpr,
            pathArray,
            t.objectExpression(configProps),
          ]),
        ),
      )
    }
  }

  const method = jsMethod`${id('createdHooks')}() {}`
  method.body.body.push(...body)
  return method
}

// ═══════════════════════════════════════════════════════════════════════════
// Local state observer setup
// ═══════════════════════════════════════════════════════════════════════════

export function generateLocalStateObserverSetup(
  observeHandlers: Array<{ pathParts: PathParts; methodName: string }>,
  hasArrayConfigs: boolean,
): t.ClassMethod {
  const localStore = t.memberExpression(t.thisExpression(), t.identifier('__store'))
  const body: t.Statement[] = []
  if (hasArrayConfigs) {
    body.push(js`this.__ensureArrayConfigs();`)
  }
  body.push(js`if (!${localStore}) { return; }`)

  for (const observeHandler of observeHandlers) {
    body.push(
      t.expressionStatement(
        t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__observe')), [
          t.thisExpression(),
          t.arrayExpression(observeHandler.pathParts.map((part) => t.stringLiteral(part))),
          t.memberExpression(t.thisExpression(), t.identifier(observeHandler.methodName)),
        ]),
      ),
    )
  }

  const method = jsMethod`${id('__setupLocalStateObservers')}() {}`
  method.body.body.push(...body)
  return method
}

// ═══════════════════════════════════════════════════════════════════════════
// Observer generators
// ═══════════════════════════════════════════════════════════════════════════

export function generateStoreInlinePatchObserver(
  pathParts: PathParts,
  storeVar: string | undefined,
  patchStatements: t.Statement[],
): t.ClassMethod {
  const method = jsMethod`${id(getObserveMethodName(pathParts, storeVar))}(value, change) {}`
  method.body.body.push(
    t.ifStatement(t.memberExpression(t.thisExpression(), t.identifier('rendered_')), t.blockStatement(patchStatements)),
  )
  return method
}

export function generateRerenderObserver(pathParts: PathParts, storeVar?: string, truthinessOnly?: boolean): t.ClassMethod {
  const method = jsMethod`${id(getObserveMethodName(pathParts, storeVar))}(value, change) {}`
  if (storeVar) {
    const prevProp = `__geaPrev_${getObserveMethodName(pathParts, storeVar)}`
    if (truthinessOnly) {
      method.body.body.push(
        ...jsBlockBody`
          if (!value === !this.${id(prevProp)}) return;
          this.${id(prevProp)} = value;
        `,
      )
    } else {
      method.body.body.push(
        ...jsBlockBody`
          if (value === this.${id(prevProp)}) return;
          this.${id(prevProp)} = value;
        `,
      )
    }
  }
  method.body.body.push(
    t.ifStatement(
      t.memberExpression(t.thisExpression(), t.identifier('rendered_')),
      t.blockStatement([
        t.expressionStatement(
          t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__geaRequestRender')), []),
        ),
      ]),
    ),
  )
  return method
}

export function generateConditionalSlotObserveMethod(
  pathParts: PathParts,
  storeVar: string | undefined,
  slotIndices: number[],
  emitEarlyReturn: boolean = true,
): t.ClassMethod {
  const method = jsMethod`${id(getObserveMethodName(pathParts, storeVar))}(value, change) {}`

  const anyPatchedExpr = slotIndices
    .map((i) => t.memberExpression(t.thisExpression(), t.identifier(`__geaCondPatched_${i}`)) as t.Expression)
    .reduce((acc, expr) => t.logicalExpression('||', acc, expr))

  const patchStatements: t.Statement[] = []
  if (slotIndices.length === 1) {
    patchStatements.push(t.ifStatement(anyPatchedExpr, t.returnStatement()))
  }
  slotIndices.forEach((slotIndex) => {
    patchStatements.push(
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(t.thisExpression(), t.identifier(`__geaCondPatched_${slotIndex}`)),
          t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__geaPatchCond')), [
            t.numericLiteral(slotIndex),
          ]),
        ),
      ),
    )
    patchStatements.push(
      t.ifStatement(
        t.memberExpression(t.thisExpression(), t.identifier(`__geaCondPatched_${slotIndex}`)),
        t.blockStatement([
          t.expressionStatement(
            t.callExpression(t.identifier('queueMicrotask'), [
              t.arrowFunctionExpression(
                [],
                t.assignmentExpression(
                  '=',
                  t.memberExpression(t.thisExpression(), t.identifier(`__geaCondPatched_${slotIndex}`)),
                  t.booleanLiteral(false),
                ),
              ),
            ]),
          ),
        ]),
      ),
    )
  })

  if (emitEarlyReturn) {
    patchStatements.push(t.ifStatement(anyPatchedExpr, t.returnStatement()))
  }

  method.body.body.push(
    t.ifStatement(t.memberExpression(t.thisExpression(), t.identifier('rendered_')), t.blockStatement(patchStatements)),
  )

  return method
}

export function generateStateChildSwapObserver(pathParts: PathParts, storeVar: string | undefined): t.ClassMethod {
  const method = jsMethod`${id(getObserveMethodName(pathParts, storeVar))}(value, change) {}`
  method.body.body.push(
    t.ifStatement(
      t.memberExpression(t.thisExpression(), t.identifier('rendered_')),
      t.blockStatement([
        t.expressionStatement(
          t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__geaSwapStateChildren')), []),
        ),
      ]),
    ),
  )
  return method
}

// ═══════════════════════════════════════════════════════════════════════════
// Unresolved relational observer
// ═══════════════════════════════════════════════════════════════════════════

export function generateUnresolvedRelationalObserver(
  arrayMap: {
    arrayPathParts: PathParts
    containerSelector: string
    containerBindingId?: string
    containerUserIdExpr?: t.Expression
  },
  unresolvedMap: UnresolvedMapInfo,
  relBinding: UnresolvedRelationalClassBinding,
  methodName: string,
  templatePropNames: Set<string>,
  wholeParamName?: string,
): { method: t.ClassMethod; privateFields: string[] } {
  const arrayPathString = pathPartsToString(arrayMap.arrayPathParts)
  const containerName = `__${arrayPathString.replace(/\./g, '_')}_container`
  const containerRef = t.memberExpression(t.thisExpression(), t.identifier(containerName))

  const containerLookup = arrayMap.containerUserIdExpr
    ? t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('getElementById')), [
        t.cloneNode(arrayMap.containerUserIdExpr, true) as t.Expression,
      ])
    : arrayMap.containerBindingId !== undefined
      ? t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('getElementById')), [
          t.binaryExpression(
            '+',
            t.memberExpression(t.thisExpression(), t.identifier('id')),
            t.stringLiteral('-' + arrayMap.containerBindingId),
          ),
        ])
      : (jsExpr`this.$(":scope")` as t.Expression)

  const setupStatements: t.Statement[] = replacePropRefsInStatements(
    (unresolvedMap.computationSetupStatements || []).map((s) => t.cloneNode(s, true) as t.Statement),
    templatePropNames,
    wholeParamName,
  )
  const arrExpr = unresolvedMap.computationExpr
    ? replacePropRefsInExpression(
        t.cloneNode(unresolvedMap.computationExpr, true) as t.Expression,
        templatePropNames,
        wholeParamName,
      )
    : t.arrayExpression([])

  const itemComparison: t.Expression = relBinding.itemProperty
    ? t.optionalMemberExpression(
        t.memberExpression(t.identifier('__arr'), t.identifier('__i'), true),
        t.identifier(relBinding.itemProperty),
        false,
        true,
      )
    : t.memberExpression(t.identifier('__arr'), t.identifier('__i'), true)

  const classNameLiteral = t.stringLiteral(relBinding.classToggleName)

  const arrDecl = t.variableDeclaration('var', [
    t.variableDeclarator(
      t.identifier('__arr'),
      t.conditionalExpression(
        t.callExpression(t.memberExpression(t.identifier('Array'), t.identifier('isArray')), [arrExpr]),
        t.cloneNode(arrExpr, true),
        t.arrayExpression([]),
      ),
    ),
  ])

  const commonPreamble: t.Statement[] = [
    js`if (!this.rendered_) return;` as t.Statement,
    lazyInit(containerName, containerLookup),
    ...jsBlockBody`if (!${containerRef}) return;`,
    ...setupStatements,
    arrDecl,
  ]

  if (relBinding.matchWhenEqual) {
    const cacheFieldName = methodName.replace('__observe_', '__prel_')
    const cacheRef = t.memberExpression(t.thisExpression(), t.privateName(t.identifier(cacheFieldName)))

    const method = jsMethod`${id(methodName)}(value, change) {}`
    return {
      method: appendToBody(
        method,
        ...commonPreamble,
        t.ifStatement(
          t.cloneNode(cacheRef, true),
          t.blockStatement([
            t.expressionStatement(
              t.callExpression(
                t.memberExpression(
                  t.memberExpression(t.cloneNode(cacheRef, true), t.identifier('classList')),
                  t.identifier('remove'),
                ),
                [t.cloneNode(classNameLiteral, true)],
              ),
            ),
            t.expressionStatement(t.assignmentExpression('=', t.cloneNode(cacheRef, true), t.nullLiteral())),
          ]),
        ),
        ...jsBlockBody`
          var __items = ${containerRef}.querySelectorAll('[data-gea-item-id]');
          for (var __i = 0; __i < __items.length && __i < __arr.length; __i++) {
            if (${itemComparison} === value) {
              __items[__i].classList.add(${classNameLiteral});
              ${cacheRef} = __items[__i];
              break;
            }
          }
        `,
      ),
      privateFields: [cacheFieldName],
    }
  }

  const method = jsMethod`${id(methodName)}(value, change) {}`
  return {
    method: appendToBody(
      method,
      ...commonPreamble,
      ...jsBlockBody`
        var __items = ${containerRef}.querySelectorAll('[data-gea-item-id]');
        for (var __i = 0; __i < __items.length && __i < __arr.length; __i++) {
          var __child = __items[__i];
          if (${itemComparison} === value) {
            __child.classList.${id('remove')}(${t.stringLiteral(relBinding.classToggleName)});
          } else {
            __child.classList.${id('add')}(${t.stringLiteral(relBinding.classToggleName)});
          }
        }
      `,
    ),
    privateFields: [],
  }
}
