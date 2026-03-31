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
import { appendToBody, id, js, jsBlockBody, jsExpr, jsMethod, jsObjectExpr, tpl } from 'eszter'

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
} from './member-chain.ts'
import {
  replacePropRefsInExpression,
  replacePropRefsInStatements,
} from './prop-ref-utils.ts'
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
  return js`if (!this.${id(name)}) { this.${id(name)} = ${value}; }`
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

  const observeListPathKeys = new Set<string>()
  for (const config of observeListConfigs) {
    observeListPathKeys.add(`${config.storeVar}:${JSON.stringify(config.pathParts)}`)
  }

  for (const store of stores) {
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
      const listKey = `${store.storeVar}:${pathKey}`
      if (observeListPathKeys.has(listKey)) continue
      if (!byPath.has(pathKey)) byPath.set(pathKey, [])
      byPath.get(pathKey)!.push(handler)
    }

    const storeVarExpr = id(store.storeVar)
    const pathArrayFor = (pp: PathParts) => jsExpr`[${pp.map((p) => t.stringLiteral(p)).join(', ')}]` as t.Expression

    for (const [pathKey, handlers] of byPath) {
      const pathParts: PathParts = JSON.parse(pathKey)
      const pathArray = t.arrayExpression(pathParts.map((part) => t.stringLiteral(part)))

      if (handlers.length === 1 && !handlers[0].isVia) {
        body.push(
          js`this.__observe(${storeVarExpr}, ${pathArray}, this.${id(handlers[0].methodName)});`,
        )
      } else {
        const vParam = id('__v')
        const cParam = id('__c')
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
            const argExpr = h.passValue === false ? id('undefined') : t.cloneNode(h.rereadExpr, true)
            const callStmt = js`this.${id(h.methodName)}(${argExpr}, null);`
            if (h.dynamicKeyExpr) {
              const keyId = id(`__geaKey${hi}`)
              const changeId = id(`__geaChange${hi}`)
              const partsId = id(`__geaParts${hi}`)
              const prevRootId = id(`__geaPrevRoot${hi}`)
              const prefixChecks = h.pathParts.map((part, idx) =>
                jsExpr`${partsId}[${idx}] === ${part}` as t.Expression,
              )
              const prevEntryExpr = jsExpr`${prevRootId} == null ? undefined : ${prevRootId}[${keyId}]`
              const nextEntryExpr = jsExpr`${vParam} == null ? undefined : ${vParam}[${keyId}]`
              const sameRootAffectsKey = jsExpr`${partsId}.length === ${h.pathParts.length} && ${prevEntryExpr} !== ${nextEntryExpr}`
              const matchingNestedKey = jsExpr`${partsId}[${h.pathParts.length}] === ${keyId}`
              const sameRootOrMatchingKey = jsExpr`(${sameRootAffectsKey}) || ${matchingNestedKey}`
              const relevantChangeExpr = prefixChecks
                .concat([sameRootOrMatchingKey as t.Expression])
                .reduce<t.Expression>((left, right) => t.logicalExpression('&&', left, right))
              const someCall = jsExpr`${cParam}.some((${changeId}) => {
                const ${partsId} = ${changeId}.pathParts;
                const ${prevRootId} = ${changeId}.previousValue;
                return Array.isArray(${partsId}) && ${relevantChangeExpr};
              })`
              callStmts.push(
                js`{ const ${keyId} = ${t.cloneNode(h.dynamicKeyExpr, true)}; if (Array.isArray(${cParam}) && ${someCall}) { ${callStmt} } }`,
              )
            } else {
              callStmts.push(callStmt)
            }
          } else {
            callStmts.push(js`this.${id(h.methodName)}(${vParam}, ${cParam});`)
          }
        }
        body.push(
          js`this.__observe(${storeVarExpr}, ${pathArray}, ${jsExpr`(${vParam}, ${cParam}) => { ${t.blockStatement(callStmts)} }`});`,
        )
      }
    }

    // Generate __observeList calls for component array slots on this store
    for (const config of observeListConfigs.filter((c) => c.storeVar === store.storeVar)) {
      const pathArray = t.arrayExpression(config.pathParts.map((part) => t.stringLiteral(part)))
      const itemsName = getComponentArrayItemsName(config.arrayPropName)
      const itemPropsMethodName = `__itemProps_${config.arrayPropName}`

      const containerExpr = config.containerUserIdExpr
        ? jsExpr`document.getElementById(${t.cloneNode(config.containerUserIdExpr, true) as t.Expression})`
        : config.containerBindingId
          ? jsExpr`this.__el(${config.containerBindingId})`
          : jsExpr`this.$(":scope")`

      const containerArrow = jsExpr`() => ${containerExpr}`
      const propsArrow = jsExpr`(opt, __k) => this.${id(itemPropsMethodName)}(opt, __k)`

      let keyArrow: t.Expression
      if (config.itemIdProperty && config.itemIdProperty !== ITEM_IS_KEY) {
        keyArrow = jsExpr`(opt) => ${t.logicalExpression(
          '??',
          buildOptionalMemberChain(id('opt'), config.itemIdProperty),
          id('opt'),
        )}`
      } else if (config.itemIdProperty === ITEM_IS_KEY) {
        keyArrow = jsExpr`(opt) => opt`
      } else {
        keyArrow = jsExpr`(opt, __k) => '__idx_' + __k`
      }

      const configObj = jsObjectExpr`{
        items: this.${id(itemsName)},
        itemsKey: ${itemsName},
        container: ${containerArrow},
        Ctor: ${id(config.componentTag)},
        props: ${propsArrow},
        key: ${keyArrow}
      }`

      // Merge any scalar observers on the same path into the onchange callback
      const samePathHandlers: Array<{ methodName: string; isVia?: boolean; rereadExpr?: t.Expression }> = []
      const pathKey = JSON.stringify(config.pathParts)
      for (const handler of store.observeHandlers) {
        if (JSON.stringify(handler.pathParts) === pathKey) {
          samePathHandlers.push(handler)
        }
      }
      if (samePathHandlers.length > 0) {
        const onchangeStmts: t.Statement[] = samePathHandlers.map((h) => {
          if (h.isVia && h.rereadExpr) {
            return js`this.${id(h.methodName)}(${t.cloneNode(h.rereadExpr, true)}, null);`
          }
          return js`this.${id(h.methodName)}(${jsExpr`${id(config.storeVar)}.${id(config.pathParts[0])}`}, null);`
        })
        configObj.properties.push(
          t.objectProperty(id('onchange'), jsExpr`() => { ${t.blockStatement(onchangeStmts)} }`),
        )
      }

      body.push(
        js`this.__observeList(${storeVarExpr}, ${pathArray}, ${configObj});`,
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
  const body: t.Statement[] = []
  if (hasArrayConfigs) {
    body.push(js`this.__ensureArrayConfigs();`)
  }
  body.push(js`if (!this.__store) { return; }`)

  for (const observeHandler of observeHandlers) {
    const pathArray = t.arrayExpression(observeHandler.pathParts.map((part) => t.stringLiteral(part)))
    body.push(
      js`this.__observe(this, ${pathArray}, this.${id(observeHandler.methodName)});`,
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
    js`if (this.rendered_) { ${t.blockStatement(patchStatements)} }`,
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
    js`if (this.rendered_) { this.__geaRequestRender(); }`,
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
    .map((i) => jsExpr`this.${id(`__geaCondPatched_${i}`)}` as t.Expression)
    .reduce((acc, expr) => t.logicalExpression('||', acc, expr))

  const patchStatements: t.Statement[] = []
  if (slotIndices.length === 1) {
    patchStatements.push(t.ifStatement(anyPatchedExpr, t.returnStatement()))
  }
  for (const slotIndex of slotIndices) {
    patchStatements.push(
      js`this.${id(`__geaCondPatched_${slotIndex}`)} = this.__geaPatchCond(${slotIndex});`,
    )
    patchStatements.push(
      js`if (this.${id(`__geaCondPatched_${slotIndex}`)}) { queueMicrotask(() => this.${id(`__geaCondPatched_${slotIndex}`)} = false); }`,
    )
  }

  if (emitEarlyReturn) {
    patchStatements.push(t.ifStatement(anyPatchedExpr, t.returnStatement()))
  }

  method.body.body.push(
    js`if (this.rendered_) { ${t.blockStatement(patchStatements)} }`,
  )

  return method
}

export function generateStateChildSwapObserver(pathParts: PathParts, storeVar: string | undefined): t.ClassMethod {
  const method = jsMethod`${id(getObserveMethodName(pathParts, storeVar))}(value, change) {}`
  method.body.body.push(
    js`if (this.rendered_) { this.__geaSwapStateChildren(); }`,
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
  const containerRef = jsExpr`this.${id(containerName)}` as t.Expression

  const containerLookup = arrayMap.containerUserIdExpr
    ? (jsExpr`document.getElementById(${t.cloneNode(arrayMap.containerUserIdExpr, true) as t.Expression})` as t.Expression)
    : arrayMap.containerBindingId !== undefined
      ? (jsExpr`document.getElementById(this.id + ${'-' + arrayMap.containerBindingId})` as t.Expression)
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
    : (jsExpr`[]` as t.Expression)

  const itemComparison: t.Expression = relBinding.itemProperty
    ? t.optionalMemberExpression(
        jsExpr`__arr[__i]` as t.Expression,
        id(relBinding.itemProperty),
        false,
        true,
      )
    : (jsExpr`__arr[__i]` as t.Expression)

  const commonPreamble: t.Statement[] = [
    js`if (!this.rendered_) return;`,
    lazyInit(containerName, containerLookup),
    ...jsBlockBody`if (!${containerRef}) return;`,
    ...setupStatements,
    js`var __arr = Array.isArray(${arrExpr}) ? ${t.cloneNode(arrExpr, true)} : [];`,
  ]

  if (relBinding.matchWhenEqual) {
    const cacheFieldName = methodName.replace('__observe_', '__prel_')
    const cacheRef = t.memberExpression(t.thisExpression(), t.privateName(id(cacheFieldName)))

    const method = jsMethod`${id(methodName)}(value, change) {}`
    return {
      method: appendToBody(
        method,
        ...commonPreamble,
        t.ifStatement(
          t.cloneNode(cacheRef, true),
          t.blockStatement([
            js`${t.cloneNode(cacheRef, true)}.classList.remove(${relBinding.classToggleName});`,
            js`${t.cloneNode(cacheRef, true)} = null;`,
          ]),
        ),
        ...jsBlockBody`
          var __items = ${containerRef}.querySelectorAll('[data-gea-item-id]');
          for (var __i = 0; __i < __items.length && __i < __arr.length; __i++) {
            if (${itemComparison} === value) {
              __items[__i].classList.add(${relBinding.classToggleName});
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
            __child.classList.${id('remove')}(${relBinding.classToggleName});
          } else {
            __child.classList.${id('add')}(${relBinding.classToggleName});
          }
        }
      `,
    ),
    privateFields: [],
  }
}
