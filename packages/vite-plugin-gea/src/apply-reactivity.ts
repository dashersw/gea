import babelGenerator from '@babel/generator'
import * as t from '@babel/types'

const generate = 'default' in babelGenerator ? babelGenerator.default : babelGenerator

const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'data', 'cite', 'poster', 'background'])
import { appendToBody, id, js, jsBlockBody, jsExpr, jsMethod } from 'eszter'
import type { NodePath } from '@babel/traverse'
import type { ClassMethod } from '@babel/types'
import type { ArrayMapBinding, ChildComponent, EventHandler, PathParts, UnresolvedMapInfo } from './ir.ts'
import type { AnalysisResult } from './analyze.ts'
import { analyzeTemplate } from './analyze.ts'
import { mergeObserveHandlers } from './generate-observe.ts'
import {
  generateArrayHandlers,
  generateArrayConditionalPatchObserver,
  generateArrayConditionalRerenderObserver,
  generateArrayRelationalObserver,
  generateEnsureArrayConfigsMethod,
} from './generate-array.ts'
import {
  generateRenderItemMethod,
  buildPopulateItemHandlersMethod,
  buildValueUnwrapHelper,
} from './generate-array-render.ts'
import { generateCreateItemMethod, generatePatchItemMethod } from './generate-array-patch.ts'
import { ITEM_IS_KEY } from './analyze-helpers.ts'
import { getTemplateParamBinding } from './template-param-utils.ts'
import {
  buildTrimmedClassJoinedExpression,
  buildTrimmedClassValueExpression,
  isAlwaysStringExpression,
  isWhitespaceFree,
} from './utils.ts'
import {
  generateComponentArrayResult,
  getComponentArrayItemsName,
  getComponentArrayRefreshMethodName,
  isUnresolvedMapWithComponentChild,
} from './generate-array-slot-sync.ts'
import { childHasNoProps } from './generate-components.ts'
import { getHoistableRootEventsForImport } from './component-event-helpers.ts'
import { appendCompiledEventMethods } from './generate-events.ts'
import {
  buildMemberChainFromParts,
  buildOptionalMemberChain,
  buildObserveKey,
  getObserveMethodName,
  parseObserveKey,
  pathPartsToString,
  pruneDeadParamDestructuring,
  derivedExprGuardsValueWhenNullish,
  expressionAccessesValueProperties,
  replacePropRefsInExpression,
  replacePropRefsInStatements,
  replaceThisPropsRootWithValueParam,
  resolvePath,
  pruneUnusedSetupDestructuring,
  earlyReturnFalsyBindingName,
  optionalizeBindingRootInStatements,
  optionalizeMemberChainsFromBindingRoot,
} from './utils.ts'
import type { StateRefMeta } from './parse.ts'
import { collectExpressionDependencies } from './transform-attributes.ts'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const traverse = require('@babel/traverse').default

const BOOLEAN_HTML_ATTRS = new Set([
  'disabled',
  'hidden',
  'readonly',
  'required',
  'autofocus',
  'autoplay',
  'controls',
  'loop',
  'muted',
  'novalidate',
  'open',
  'reversed',
  'selected',
  'multiple',
  'defer',
  'async',
])

/** No-op: templates access stores directly. */
function rewriteTemplateBodyForImportedState(
  _templateMethod: t.ClassMethod,
  _stateRefs: Map<string, StateRefMeta>,
  _storeImports: Map<string, string>,
): void {}

function generateCreatedHooks(
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
      // Skip handlers whose path is covered by __observeList — they'll be
      // merged into the onchange callback below
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

    // The store variable expression (e.g. `storeVar` identifier)
    const storeVarExpr = t.identifier(store.storeVar)

    for (const [pathKey, handlers] of byPath) {
      const pathParts: PathParts = JSON.parse(pathKey)
      const pathArray = t.arrayExpression(pathParts.map((part) => t.stringLiteral(part)))

      if (handlers.length === 1 && !handlers[0].isVia) {
        // Single handler — direct method reference
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
        // Multiple handlers or via handlers — merged arrow function
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
                      t.variableDeclarator(prevRootId, t.memberExpression(changeId, t.identifier('previousValue'))),
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
                  t.variableDeclaration('const', [t.variableDeclarator(keyId, t.cloneNode(h.dynamicKeyExpr, true))]),
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
              // Inline re-read: call target method with re-read value
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

      // Build the config object for __observeList
      // Note: items may be undefined at createdHooks time (runs during super()
      // before constructor body sets the instance variable). The runtime uses
      // itemsKey to lazily resolve the items array from the component instance.
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

function canInlineDynamicObserverKey(expr: t.Expression): boolean {
  let safe = true
  const program = t.program([t.expressionStatement(t.cloneNode(expr, true))])
  traverse(program, {
    noScope: true,
    Identifier(path: NodePath<t.Identifier>) {
      if (!path.isReferencedIdentifier()) return
      safe = false
      path.stop()
    },
  })
  return safe
}

function classMethodUsesParam(method: t.ClassMethod, index: number): boolean {
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

function serializeAstNode(node: t.Node | null | undefined): string {
  return node ? JSON.stringify(node) : ''
}

function expressionReferencesIdentifier(expr: t.Expression, name: string): boolean {
  let found = false
  const program = t.program([t.expressionStatement(t.cloneNode(expr, true))])
  traverse(program, {
    noScope: true,
    Identifier(path: NodePath<t.Identifier>) {
      if (!path.isReferencedIdentifier()) return
      if (path.node.name !== name) return
      found = true
      path.stop()
    },
  })
  return found
}

function generateLocalStateObserverSetup(
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

/** Merge `if (__el) if (cond) ...` into `if (__el && cond) ...` when there is no else. */
function wrapPatchWithElGuard(updateStmt: t.Statement): t.Statement {
  if (t.isIfStatement(updateStmt) && !updateStmt.alternate) {
    return t.ifStatement(t.logicalExpression('&&', t.identifier('__el'), updateStmt.test), updateStmt.consequent)
  }
  return t.ifStatement(t.identifier('__el'), updateStmt)
}

export function applyStaticReactivity(
  ast: t.File,
  originalAST: t.File,
  className: string,
  sourceFile: string,
  imports: Map<string, string>,
  stateRefs: Map<string, StateRefMeta>,
  storeImports: Map<string, string>,
  compiledChildren: ChildComponent[] = [],
  eventIdCounter: { value: number } = { value: 0 },
  preTransformAnalysis?: Map<string, AnalysisResult>,
): boolean {
  let applied = false
  let needsModuleLevelUnwrapHelper = false
  let needsClassLevelRawStoreField = false
  const classLevelPrivateFields = new Set<string>()

  const astToTraverse = preTransformAnalysis?.has(className) ? ast : originalAST
  const getAnalysis = (clsName: string, origPath: NodePath<ClassMethod>): AnalysisResult | null => {
    const cached = preTransformAnalysis?.get(clsName)
    if (cached) return cached
    const classBody = t.isClassBody(origPath.parent) ? origPath.parent : undefined
    return analyzeTemplate(origPath.node, stateRefs, classBody)
  }

  traverse(astToTraverse, {
    ClassMethod(origPath: NodePath<ClassMethod>) {
      if (!t.isIdentifier(origPath.node.key) || origPath.node.key.name !== 'template') return
      const analysis = getAnalysis(className, origPath)
      if (!analysis) return
      const hasCompiledChildStoreDeps = compiledChildren.some((child) => child.dependencies.some((dep) => dep.storeVar))
      if (
        analysis.bindings.length === 0 &&
        analysis.propBindings.length === 0 &&
        analysis.arrayMaps.length === 0 &&
        analysis.stateProps.size === 0 &&
        analysis.unresolvedMaps.length === 0 &&
        !hasCompiledChildStoreDeps &&
        analysis.earlyReturnGuard === undefined
      )
        return

      traverse(ast, {
        ClassDeclaration(classPath: NodePath<t.ClassDeclaration>) {
          if (!t.isIdentifier(classPath.node.id) || classPath.node.id.name !== className) return

          // Extract original (pre-transform) class body for JSX detection in render props.
          // The current classPath.node.body has JSX already compiled away.
          let originalClassBody: t.ClassBody | undefined
          traverse(originalAST, {
            noScope: true,
            ClassDeclaration(origClass: NodePath<t.ClassDeclaration>) {
              if (t.isIdentifier(origClass.node.id) && origClass.node.id.name === className) {
                originalClassBody = origClass.node.body
                origClass.stop()
              }
            },
          })

          const templateMethod = classPath.node.body.body.find(
            (n): n is t.ClassMethod => t.isClassMethod(n) && t.isIdentifier(n.key) && n.key.name === 'template',
          )
          if (templateMethod) {
            rewriteTemplateBodyForImportedState(templateMethod, stateRefs, storeImports)
          }

          const handlers = mergeObserveHandlers(analysis.bindings, stateRefs)
          const handledPaths = new Set(handlers.keys())
          const addedMethods = new Map<string, t.ClassMethod>()
          const addedMethodsByName = new Map<string, t.ClassMethod>()
          const stateProps = new Map(analysis.stateProps)
          const getMethodName = (method: t.ClassMethod): string | null =>
            t.isIdentifier(method.key) ? method.key.name : t.isStringLiteral(method.key) ? method.key.value : null

          compiledChildren.forEach((child) => {
            child.dependencies.forEach((dep) => {
              if (!stateProps.has(dep.observeKey)) stateProps.set(dep.observeKey, dep.pathParts)
            })
          })

          const alignMethodBodyParams = (
            source: t.ClassMethod,
            targetParams: (t.Identifier | t.Pattern | t.RestElement)[],
          ) => {
            const bodyStatements = source.body.body.map((stmt) => t.cloneNode(stmt, true) as t.Statement)
            if (source.params.length !== targetParams.length) return bodyStatements

            const renameMap = new Map<string, string>()
            for (let i = 0; i < source.params.length; i++) {
              const sourceParam = source.params[i]
              const targetParam = targetParams[i]
              if (!t.isIdentifier(sourceParam) || !t.isIdentifier(targetParam)) continue
              if (sourceParam.name !== targetParam.name) renameMap.set(sourceParam.name, targetParam.name)
            }
            if (renameMap.size === 0) return bodyStatements

            const tempProgram = t.program(bodyStatements)
            traverse(tempProgram, {
              noScope: true,
              Identifier(path: NodePath<t.Identifier>) {
                const nextName = renameMap.get(path.node.name)
                if (nextName) path.node.name = nextName
              },
            })
            return tempProgram.body as t.Statement[]
          }

          const mergeObserveMethod = (observeKey: string, method: t.ClassMethod) => {
            const methodName = getMethodName(method)
            const existing =
              addedMethods.get(observeKey) || (methodName ? addedMethodsByName.get(methodName) : undefined)
            if (existing && t.isBlockStatement(existing.body) && t.isBlockStatement(method.body)) {
              if (method.params.length > existing.params.length) {
                existing.params = method.params.map((param) => t.cloneNode(param, true) as typeof param)
              }
              existing.body.body.push(
                ...alignMethodBodyParams(method, existing.params as (t.Identifier | t.Pattern | t.RestElement)[]),
              )
              return
            }
            classPath.node.body.body.push(method)
            addedMethods.set(observeKey, method)
            if (methodName) addedMethodsByName.set(methodName, method)
            applied = true
          }

          const templatePropNames = getTemplatePropNames(classPath.node.body)
          const templateWholeParam = getTemplateParamIdentifier(classPath.node.body)

          /** `__e0`, `__e1`, … for lazy-cached `getElementById` refs; cleared by `__resetEls` on rerender. */
          const elRefFieldNames: string[] = []
          let elRefSlotNext = 0
          const allocElRefField = (): string => {
            const name = `__e${elRefSlotNext++}`
            elRefFieldNames.push(name)
            return name
          }
          const buildCachedGetElementById = (idArg: t.Expression): t.Expression => {
            const field = allocElRefField()
            const read = t.memberExpression(t.thisExpression(), t.identifier(field))
            const inner = t.callExpression(
              t.memberExpression(t.identifier('document'), t.identifier('getElementById')),
              [idArg],
            )
            return t.logicalExpression(
              '||',
              read,
              t.parenthesizedExpression(t.assignmentExpression('=', t.cloneNode(read, true), inner)),
            )
          }

          const patchStatementsByBinding = new Map<(typeof analysis.propBindings)[0], t.Statement[]>()
          for (const pb of analysis.propBindings) {
            const elExpr = pb.userIdExpr
              ? buildCachedGetElementById(t.cloneNode(pb.userIdExpr, true) as t.Expression)
              : pb.bindingId !== undefined
                ? buildCachedGetElementById(
                    t.binaryExpression(
                      '+',
                      t.memberExpression(t.thisExpression(), t.identifier('id')),
                      t.stringLiteral('-' + pb.bindingId),
                    ),
                  )
                : pb.selector === ':scope'
                  ? t.memberExpression(t.thisExpression(), t.identifier('element_'))
                  : t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('$')), [
                      t.stringLiteral(pb.selector),
                    ])
            const valueExpr = pb.expression && pb.setupStatements ? t.identifier('__boundValue') : t.identifier('value')
            let updateStmt: t.Statement
            if (pb.type === 'text' && pb.textNodeIndex !== undefined) {
              const tnIdx = t.numericLiteral(pb.textNodeIndex)
              const tnAccess = t.memberExpression(
                t.memberExpression(t.identifier('__el'), t.identifier('childNodes')),
                t.cloneNode(tnIdx, true),
                true,
              )
              // Check if the node at the expected index is a text node (nodeType 3).
              // When the initial value is empty the browser may not create a text node,
              // so we insert one on first update.
              const notTextNode = t.logicalExpression(
                '||',
                t.unaryExpression('!', t.identifier('__tn')),
                t.binaryExpression(
                  '!==',
                  t.memberExpression(t.identifier('__tn'), t.identifier('nodeType')),
                  t.numericLiteral(3),
                ),
              )
              const insertNewTextNode = t.blockStatement([
                t.expressionStatement(
                  t.assignmentExpression(
                    '=',
                    t.identifier('__tn'),
                    t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('createTextNode')), [
                      t.cloneNode(valueExpr, true),
                    ]),
                  ),
                ),
                t.expressionStatement(
                  t.callExpression(t.memberExpression(t.identifier('__el'), t.identifier('insertBefore')), [
                    t.identifier('__tn'),
                    t.logicalExpression(
                      '||',
                      t.memberExpression(
                        t.memberExpression(t.identifier('__el'), t.identifier('childNodes')),
                        t.cloneNode(tnIdx, true),
                        true,
                      ),
                      t.nullLiteral(),
                    ),
                  ]),
                ),
              ])
              const updateExisting = t.ifStatement(
                t.binaryExpression(
                  '!==',
                  t.memberExpression(t.identifier('__tn'), t.identifier('nodeValue')),
                  t.cloneNode(valueExpr, true),
                ),
                t.expressionStatement(
                  t.assignmentExpression(
                    '=',
                    t.memberExpression(t.identifier('__tn'), t.identifier('nodeValue')),
                    t.cloneNode(valueExpr, true),
                  ),
                ),
              )
              updateStmt = t.blockStatement([
                t.variableDeclaration('let', [t.variableDeclarator(t.identifier('__tn'), tnAccess)]),
                t.ifStatement(notTextNode, insertNewTextNode, updateExisting),
              ])
            } else if (pb.type === 'text') {
              const isHtmlProducing =
                pb.propName === 'children' ||
                (pb.expression &&
                  originalClassBody &&
                  expressionCallsJSXReturningClassProp(pb.expression, originalClassBody))
              const targetProp = isHtmlProducing ? 'innerHTML' : 'textContent'
              const assignStmt = t.expressionStatement(
                t.assignmentExpression(
                  '=',
                  t.memberExpression(t.identifier('__el'), t.identifier(targetProp)),
                  t.cloneNode(valueExpr, true),
                ),
              )
              const consequent = isHtmlProducing
                ? t.blockStatement([
                    assignStmt,
                    // After replacing innerHTML for children, re-initialize child
                    // components that were created from the new HTML string.
                    t.expressionStatement(
                      t.callExpression(
                        t.memberExpression(t.thisExpression(), t.identifier('instantiateChildComponents_')),
                        [],
                      ),
                    ),
                    // Reconnect compiled children from the parent component whose
                    // DOM elements were replaced by the innerHTML update.
                    t.ifStatement(
                      t.memberExpression(t.thisExpression(), t.identifier('parentComponent')),
                      t.expressionStatement(
                        t.callExpression(
                          t.memberExpression(
                            t.memberExpression(t.thisExpression(), t.identifier('parentComponent')),
                            t.identifier('mountCompiledChildComponents_'),
                          ),
                          [],
                        ),
                      ),
                    ),
                  ])
                : assignStmt
              updateStmt = t.ifStatement(
                t.binaryExpression(
                  '!==',
                  t.memberExpression(t.identifier('__el'), t.identifier(targetProp)),
                  valueExpr,
                ),
                consequent,
              )
            } else if (pb.type === 'class') {
              const isObjectClass = pb.expression && t.isObjectExpression(pb.expression)
              const objectJoinExpr = t.callExpression(
                t.memberExpression(
                  t.callExpression(
                    t.memberExpression(
                      t.callExpression(
                        t.memberExpression(
                          t.callExpression(t.memberExpression(t.identifier('Object'), t.identifier('entries')), [
                            t.cloneNode(valueExpr, true),
                          ]),
                          t.identifier('filter'),
                        ),
                        [
                          t.arrowFunctionExpression(
                            [t.arrayPattern([t.identifier('__k'), t.identifier('__v')])],
                            t.identifier('__v'),
                          ),
                        ],
                      ),
                      t.identifier('map'),
                    ),
                    [t.arrowFunctionExpression([t.arrayPattern([t.identifier('__k')])], t.identifier('__k'))],
                  ),
                  t.identifier('join'),
                ),
                [t.stringLiteral(' ')],
              )
              const originalClassExpr = pb.expression && t.isExpression(pb.expression) ? pb.expression : valueExpr
              const canSkipClassCoercion =
                !isObjectClass &&
                isAlwaysStringExpression(originalClassExpr as t.Expression) &&
                isWhitespaceFree(originalClassExpr as t.Expression)
              const classValueExpr = isObjectClass
                ? buildTrimmedClassJoinedExpression(objectJoinExpr)
                : canSkipClassCoercion
                  ? valueExpr
                  : buildTrimmedClassValueExpression(valueExpr)
              updateStmt = canSkipClassCoercion
                ? t.blockStatement([
                    t.variableDeclaration('const', [
                      t.variableDeclarator(t.identifier('__newClass'), t.cloneNode(valueExpr, true)),
                    ]),
                    t.ifStatement(
                      t.binaryExpression(
                        '!==',
                        t.memberExpression(t.identifier('__el'), t.identifier('className')),
                        t.identifier('__newClass'),
                      ),
                      t.expressionStatement(
                        t.assignmentExpression(
                          '=',
                          t.memberExpression(t.identifier('__el'), t.identifier('className')),
                          t.identifier('__newClass'),
                        ),
                      ),
                    ),
                  ])
                : t.blockStatement([
                    t.variableDeclaration('const', [t.variableDeclarator(t.identifier('__newClass'), classValueExpr)]),
                    t.ifStatement(
                      t.binaryExpression(
                        '!==',
                        t.memberExpression(t.identifier('__el'), t.identifier('className')),
                        t.identifier('__newClass'),
                      ),
                      t.expressionStatement(
                        t.assignmentExpression(
                          '=',
                          t.memberExpression(t.identifier('__el'), t.identifier('className')),
                          t.identifier('__newClass'),
                        ),
                      ),
                    ),
                  ])
            } else if ((pb.type === 'value' || pb.type === 'checked') && pb.attributeName) {
              const propName = pb.attributeName
              updateStmt = t.expressionStatement(
                t.assignmentExpression(
                  '=',
                  t.memberExpression(t.identifier('__el'), t.identifier(propName)),
                  pb.type === 'checked'
                    ? t.unaryExpression('!', t.unaryExpression('!', valueExpr))
                    : t.conditionalExpression(
                        t.logicalExpression(
                          '||',
                          t.binaryExpression('===', t.cloneNode(valueExpr, true), t.nullLiteral()),
                          t.binaryExpression('===', t.cloneNode(valueExpr, true), t.identifier('undefined')),
                        ),
                        t.stringLiteral(''),
                        t.callExpression(t.identifier('String'), [valueExpr]),
                      ),
                ),
              )
            } else if (pb.type === 'attribute' && pb.attributeName) {
              const attrName = pb.attributeName
              if (attrName === 'style') {
                const cssTextExpr = t.conditionalExpression(
                  t.binaryExpression('===', t.unaryExpression('typeof', valueExpr), t.stringLiteral('object')),
                  t.callExpression(
                    t.memberExpression(
                      t.callExpression(
                        t.memberExpression(
                          t.callExpression(t.memberExpression(t.identifier('Object'), t.identifier('entries')), [
                            valueExpr,
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
                  t.callExpression(t.identifier('String'), [valueExpr]),
                )
                updateStmt = t.ifStatement(
                  t.logicalExpression(
                    '||',
                    t.binaryExpression('===', valueExpr, t.nullLiteral()),
                    t.binaryExpression('===', valueExpr, t.identifier('undefined')),
                  ),
                  t.expressionStatement(
                    t.callExpression(t.memberExpression(t.identifier('__el'), t.identifier('removeAttribute')), [
                      t.stringLiteral('style'),
                    ]),
                  ),
                  t.blockStatement([
                    t.variableDeclaration('const', [t.variableDeclarator(t.identifier('__newCss'), cssTextExpr)]),
                    t.ifStatement(
                      t.binaryExpression(
                        '!==',
                        t.memberExpression(
                          t.memberExpression(t.identifier('__el'), t.identifier('style')),
                          t.identifier('cssText'),
                        ),
                        t.identifier('__newCss'),
                      ),
                      t.expressionStatement(
                        t.assignmentExpression(
                          '=',
                          t.memberExpression(
                            t.memberExpression(t.identifier('__el'), t.identifier('style')),
                            t.identifier('cssText'),
                          ),
                          t.identifier('__newCss'),
                        ),
                      ),
                    ),
                  ]),
                )
              } else if (attrName === 'dangerouslySetInnerHTML') {
                updateStmt = t.blockStatement([
                  t.variableDeclaration('const', [
                    t.variableDeclarator(
                      t.identifier('__newHtml'),
                      t.callExpression(t.identifier('String'), [valueExpr]),
                    ),
                  ]),
                  t.ifStatement(
                    t.binaryExpression(
                      '!==',
                      t.memberExpression(t.identifier('__el'), t.identifier('innerHTML')),
                      t.identifier('__newHtml'),
                    ),
                    t.expressionStatement(
                      t.assignmentExpression(
                        '=',
                        t.memberExpression(t.identifier('__el'), t.identifier('innerHTML')),
                        t.identifier('__newHtml'),
                      ),
                    ),
                  ),
                ])
              } else {
                const isBooleanAttr = BOOLEAN_HTML_ATTRS.has(attrName)
                const removeCondition = isBooleanAttr
                  ? t.unaryExpression('!', valueExpr)
                  : t.logicalExpression(
                      '||',
                      t.binaryExpression('===', valueExpr, t.nullLiteral()),
                      t.binaryExpression('===', valueExpr, t.identifier('undefined')),
                    )
                const newAttrValueExpr = isBooleanAttr
                  ? t.stringLiteral('')
                  : URL_ATTRS.has(attrName)
                    ? t.callExpression(t.identifier('__sanitizeAttr'), [
                        t.stringLiteral(attrName),
                        t.callExpression(t.identifier('String'), [valueExpr]),
                      ])
                    : t.callExpression(t.identifier('String'), [valueExpr])
                updateStmt = t.ifStatement(
                  removeCondition,
                  t.expressionStatement(
                    t.callExpression(t.memberExpression(t.identifier('__el'), t.identifier('removeAttribute')), [
                      t.stringLiteral(attrName),
                    ]),
                  ),
                  t.blockStatement([
                    t.variableDeclaration('const', [t.variableDeclarator(t.identifier('__newAttr'), newAttrValueExpr)]),
                    t.ifStatement(
                      t.binaryExpression(
                        '!==',
                        t.callExpression(t.memberExpression(t.identifier('__el'), t.identifier('getAttribute')), [
                          t.stringLiteral(attrName),
                        ]),
                        t.identifier('__newAttr'),
                      ),
                      t.expressionStatement(
                        t.callExpression(t.memberExpression(t.identifier('__el'), t.identifier('setAttribute')), [
                          t.stringLiteral(attrName),
                          t.identifier('__newAttr'),
                        ]),
                      ),
                    ),
                  ]),
                )
              }
            } else {
              continue
            }
            const useDerivedPropExpr = Boolean(pb.expression && pb.setupStatements)
            const elDecl = t.variableDeclaration('const', [t.variableDeclarator(t.identifier('__el'), elExpr)])
            const corePatch: t.Statement[] = [elDecl]
            let derivedRewrittenExpr: t.Expression | undefined
            let derivedPrunedSetup: t.Statement[] = []
            if (useDerivedPropExpr) {
              const rewrittenSetup = replacePropRefsInStatements(
                pb.setupStatements!,
                templatePropNames,
                templateWholeParam,
              )
              let rewrittenExpr = replacePropRefsInExpression(pb.expression!, templatePropNames, templateWholeParam)
              rewrittenExpr = replaceThisPropsRootWithValueParam(rewrittenExpr, pb.propName)
              derivedRewrittenExpr = rewrittenExpr
              derivedPrunedSetup = pruneDeadParamDestructuring(rewrittenSetup, [rewrittenExpr])
              corePatch.push(...derivedPrunedSetup)
              corePatch.push(
                t.variableDeclaration('const', [t.variableDeclarator(t.identifier('__boundValue'), rewrittenExpr)]),
              )
            }
            corePatch.push(wrapPatchWithElGuard(updateStmt))

            const nullishValue = t.logicalExpression(
              '||',
              t.binaryExpression('===', t.identifier('value'), t.nullLiteral()),
              t.binaryExpression('===', t.identifier('value'), t.identifier('undefined')),
            )
            const guardsNullishInExpr =
              Boolean(derivedRewrittenExpr) && derivedExprGuardsValueWhenNullish(derivedRewrittenExpr!)

            const needsValueNullishGuard =
              useDerivedPropExpr &&
              !guardsNullishInExpr &&
              expressionAccessesValueProperties(derivedRewrittenExpr!, derivedPrunedSetup)

            const blockStatements: t.Statement[] = needsValueNullishGuard
              ? [t.ifStatement(t.unaryExpression('!', nullishValue), t.blockStatement(corePatch))]
              : corePatch

            patchStatementsByBinding.set(pb, blockStatements)
            applied = true
          }

          const propBindingsByProp = new Map<string, typeof analysis.propBindings>()
          for (const pb of analysis.propBindings) {
            if (pb.stateOnly) continue
            const list = propBindingsByProp.get(pb.propName) ?? []
            list.push(pb)
            propBindingsByProp.set(pb.propName, list)
          }

          const inlinePatchBodies = new Map<string, t.Statement[]>()
          propBindingsByProp.forEach((bindings, propName) => {
            const statements: t.Statement[] = []
            for (const pb of bindings) {
              const blockStatements = patchStatementsByBinding.get(pb)
              if (blockStatements) {
                if (bindings.length === 1) {
                  statements.push(...blockStatements.map((s) => t.cloneNode(s, true) as t.Statement))
                } else {
                  statements.push(t.blockStatement(blockStatements.map((s) => t.cloneNode(s, true) as t.Statement)))
                }
              }
            }
            if (statements.length > 0) {
              inlinePatchBodies.set(propName, statements)
            }
          })

          const storeKeyToBindings = new Map<string, Set<(typeof analysis.propBindings)[0]>>()
          for (const pb of analysis.propBindings) {
            if (!pb.setupStatements?.length && !pb.expression) continue
            const nodesToScan: t.Statement[] = [
              ...(pb.setupStatements || []).map((s) => t.cloneNode(s, true) as t.Statement),
            ]
            if (pb.expression) {
              nodesToScan.push(t.expressionStatement(t.cloneNode(pb.expression, true) as t.Expression))
            }
            const scanProg = t.program(nodesToScan)
            const addToStoreKey = (observeKey: string) => {
              let bindings = storeKeyToBindings.get(observeKey)
              if (!bindings) {
                bindings = new Set()
                storeKeyToBindings.set(observeKey, bindings)
              }
              bindings.add(pb)
            }
            traverse(scanProg, {
              noScope: true,
              Identifier(path: NodePath<t.Identifier>) {
                if (
                  path.parentPath &&
                  t.isMemberExpression(path.parentPath.node) &&
                  path.parentPath.node.object === path.node
                )
                  return
                const ref = stateRefs.get(path.node.name)
                if (!ref || ref.kind !== 'local-destructured' || !ref.propName) return
                addToStoreKey(buildObserveKey([ref.propName]))
              },
              MemberExpression(path: NodePath<t.MemberExpression>) {
                const resolved = resolvePath(path.node, stateRefs)
                if (!resolved?.parts?.length) return
                if (!resolved.isImportedState && !resolved.storeVar && resolved.parts[0] === 'props') return
                const storeVar = resolved.isImportedState ? resolved.storeVar : undefined
                if (storeVar && resolved.parts.length === 1) {
                  const storeRef = stateRefs.get(storeVar)
                  const getterDepPaths = storeRef?.getterDeps?.get(resolved.parts[0])
                  if (getterDepPaths && getterDepPaths.length > 0) {
                    for (const depPath of getterDepPaths) {
                      addToStoreKey(buildObserveKey(depPath, storeVar))
                    }
                    return
                  }
                }
                const observeKey = buildObserveKey(resolved.parts, storeVar)
                addToStoreKey(observeKey)
              },
            })
          }

          // Deduplicate: when a store key has both stateOnly and non-stateOnly
          // bindings for the same element (selector + type), keep only the
          // stateOnly ones.  The non-stateOnly derived bindings already handle
          // prop changes via __onPropChange; including them here would produce
          // duplicate DOM-patch blocks inside the store observer method.
          for (const [, bindings] of storeKeyToBindings) {
            const hasStateOnly = [...bindings].some((b) => b.stateOnly)
            if (!hasStateOnly) continue
            for (const pb of bindings) {
              if (pb.stateOnly) continue
              // A stateOnly counterpart covers this element — drop the duplicate.
              const dup = [...bindings].some((b) => b.stateOnly && b.selector === pb.selector && b.type === pb.type)
              if (dup) bindings.delete(pb)
            }
          }

          handlers.forEach((method, observeKey) => {
            mergeObserveMethod(observeKey, method)
          })

          // Generate rerender observer for templates with early return guards.
          // When the guard condition changes (e.g., store.activeEmail transitions null<->non-null),
          // the entire DOM structure may change, requiring a full re-render.
          if (analysis.earlyReturnGuard) {
            const guardExpr = analysis.earlyReturnGuard
            // Build a map of local variable names to their store member expressions
            const localToStoreExpr = new Map<string, t.MemberExpression>()
            const setupStmts =
              templateMethod?.body.body.filter((s): s is t.VariableDeclaration => t.isVariableDeclaration(s)) || []
            for (const decl of setupStmts) {
              for (const d of decl.declarations) {
                if (t.isIdentifier(d.id) && t.isMemberExpression(d.init)) {
                  localToStoreExpr.set(d.id.name, d.init)
                }
              }
            }

            const rerenderStoreKeys: Array<{ observeKey: string; pathParts: PathParts }> = []
            const addedKeys = new Set<string>()
            const addRerenderDep = (parts: PathParts, storeVarName?: string) => {
              const key = buildObserveKey(parts, storeVarName)
              if (!addedKeys.has(key)) {
                addedKeys.add(key)
                rerenderStoreKeys.push({ observeKey: key, pathParts: parts })
              }
            }
            // Resolve guard expression identifiers to store paths
            const guardScanProg = t.program([t.expressionStatement(t.cloneNode(guardExpr, true) as t.Expression)])
            traverse(guardScanProg, {
              noScope: true,
              MemberExpression(path: NodePath<t.MemberExpression>) {
                const resolved = resolvePath(path.node, stateRefs)
                if (!resolved?.parts?.length) return
                if (resolved.isImportedState || resolved.storeVar) {
                  addRerenderDep(resolved.parts as PathParts, resolved.isImportedState ? resolved.storeVar : undefined)
                }
              },
              Identifier(path: NodePath<t.Identifier>) {
                if (
                  path.parentPath &&
                  t.isMemberExpression(path.parentPath.node) &&
                  path.parentPath.node.object === path.node
                )
                  return
                const name = path.node.name
                // Check if this local variable maps to a store expression
                const storeExpr = localToStoreExpr.get(name)
                if (storeExpr) {
                  const resolved = resolvePath(storeExpr, stateRefs)
                  if (resolved?.parts?.length && (resolved.isImportedState || resolved.storeVar)) {
                    addRerenderDep(
                      resolved.parts as PathParts,
                      resolved.isImportedState ? resolved.storeVar : undefined,
                    )
                    return
                  }
                }
                const ref = stateRefs.get(name)
                if (!ref) return
                if (ref.kind === 'local-destructured' && ref.propName) {
                  addRerenderDep([ref.propName] as PathParts)
                }
              },
            })
            for (const entry of rerenderStoreKeys) {
              const propPath = entry.pathParts
              const parsed = JSON.parse(entry.observeKey)
              const storeVarName = parsed.storeVar || undefined
              const methodNameStr = getObserveMethodName(propPath, storeVarName)
              const prevProp = `__geaPrev_guard_${methodNameStr}`
              const rerenderMethod = jsMethod`${id(methodNameStr)}(__v, __c) { if (!__v === !this.${id(prevProp)}) return; this.${id(prevProp)} = __v; this.__geaRequestRender(); }`
              mergeObserveMethod(entry.observeKey, rerenderMethod)
              if (!stateProps.has(entry.observeKey)) {
                stateProps.set(entry.observeKey, entry.pathParts)
              }
            }
          }

          const unresolvedEventHandlers: EventHandler[] = []
          const unresolvedBindings: Array<{ info: UnresolvedMapInfo; binding: any }> = []
          const componentArrayRefreshDeps: Array<{ methodName: string; propNames: string[] }> = []
          const componentArrayDisposeTargets: string[] = []
          const storeComponentArrayObservers: Array<{
            storeVar: string
            refreshMethodName: string
            pathParts: PathParts
          }> = []
          const observeListConfigs: Array<{
            storeVar: string
            pathParts: PathParts
            arrayPropName: string
            componentTag: string
            containerBindingId?: string
            containerUserIdExpr?: t.Expression
            itemIdProperty?: string
          }> = []
          // Static array maps whose .map() wasn't found in the template method
          // (e.g. inside a child component's children prop) need a __refresh call
          // in onAfterRenderHooks to populate the container after initial mount.
          const staticArrayRefreshOnMount: string[] = []
          // HTML array maps intentionally stripped from conditional-slot/template HTML
          // also need a post-mount refresh so pre-existing items populate the empty
          // container on first render (e.g. cart drawer opened after add-to-cart).
          const initialHtmlArrayRefreshOnMount: t.Statement[] = []
          const mapItemAttrInfos: Array<{
            itemVariable: string
            itemIdProperty?: string
            containerBindingId?: string
            eventToken?: string
          }> = []
          const tmplBody = templateMethod?.body.body ?? []
          let tmplReturnIdx = -1
          for (let ri = tmplBody.length - 1; ri >= 0; ri--) {
            if (t.isReturnStatement(tmplBody[ri])) {
              tmplReturnIdx = ri
              break
            }
          }
          const tmplSetupCtx = templateMethod
            ? {
                params: templateMethod.params,
                statements: tmplReturnIdx >= 0 ? tmplBody.slice(0, tmplReturnIdx) : [],
              }
            : undefined

          analysis.unresolvedMaps.forEach((um, idx) => {
            const isComponentSlot = isUnresolvedMapWithComponentChild(um, imports)
            const arrayPropName = um.computationExpr ? getArrayPropNameFromExpr(um.computationExpr) : null

            if (isComponentSlot && arrayPropName) {
              let storeArrayAccess: { storeVar: string; propName: string } | undefined
              if (um.computationExpr && t.isIdentifier(um.computationExpr) && stateRefs.has(um.computationExpr.name)) {
                const ref = stateRefs.get(um.computationExpr.name)!
                if (ref.kind === 'imported-destructured' && ref.storeVar && ref.propName) {
                  const storeRef = stateRefs.get(ref.storeVar)
                  if (storeRef?.reactiveFields?.has(ref.propName)) {
                    storeArrayAccess = { storeVar: ref.storeVar, propName: ref.propName }
                  }
                }
              }

              const propNames = getTemplatePropNames(classPath.node.body)
              const arrayResult = generateComponentArrayResult(
                um,
                arrayPropName,
                imports,
                propNames,
                classPath.node.body,
                storeArrayAccess,
                getTemplateParamIdentifier(classPath.node.body),
                tmplSetupCtx,
              )
              if (arrayResult && templateMethod) {
                classPath.node.body.body.push(arrayResult.itemPropsMethod)
                const importSource = imports.get(arrayResult.componentTag)
                if (importSource) {
                  const delegatedEvents = getHoistableRootEventsForImport(sourceFile, importSource).map((meta) => ({
                    eventType: meta.eventType,
                    selector: meta.selector,
                    methodName: `__event_${arrayPropName}_${meta.propName}`,
                    delegatedPropName: meta.propName,
                    usesTargetComponent: true,
                  })) as EventHandler[]
                  if (delegatedEvents.length > 0) {
                    appendCompiledEventMethods(classPath.node.body, delegatedEvents)
                  }
                }
                inlineIntoConstructor(classPath.node.body, [
                  ...arrayResult.arrSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement),
                  arrayResult.constructorInit,
                ])
                if (storeArrayAccess) {
                  observeListConfigs.push({
                    storeVar: storeArrayAccess.storeVar,
                    pathParts: [storeArrayAccess.propName],
                    arrayPropName,
                    componentTag: arrayResult.componentTag,
                    containerBindingId: arrayResult.containerBindingId,
                    containerUserIdExpr: arrayResult.containerUserIdExpr,
                    itemIdProperty: arrayResult.itemIdProperty,
                  })
                } else {
                  const computedDeps = (
                    um.dependencies || collectUnresolvedDependencies([um], stateRefs, classPath.node.body)
                  ).filter((dep) => dep.storeVar || dep.pathParts[0] !== 'props')
                  // For non-store arrays, generate a refresh method that
                  // reconciles items using __reconcileList
                  const refreshMethodName = getComponentArrayRefreshMethodName(arrayPropName)
                  const itemsName = getComponentArrayItemsName(arrayPropName)
                  const itemPropsMethodNameRef = `__itemProps_${arrayPropName}`
                  const containerSuffix = arrayResult.containerBindingId
                  const containerExpr = arrayResult.containerUserIdExpr
                    ? t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('getElementById')), [
                        t.cloneNode(arrayResult.containerUserIdExpr, true) as t.Expression,
                      ])
                    : containerSuffix
                      ? t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__el')), [
                          t.stringLiteral(containerSuffix),
                        ])
                      : (jsExpr`this.$(":scope")` as t.Expression)

                  // Build key function expression
                  const itemIdProp = arrayResult.itemIdProperty
                  const keyFn =
                    itemIdProp && itemIdProp !== ITEM_IS_KEY
                      ? t.arrowFunctionExpression(
                          [t.identifier('opt')],
                          t.memberExpression(t.identifier('opt'), t.identifier(itemIdProp)),
                        )
                      : itemIdProp === ITEM_IS_KEY
                        ? t.arrowFunctionExpression([t.identifier('opt')], t.identifier('opt'))
                        : t.arrowFunctionExpression(
                            [t.identifier('opt'), t.identifier('__k')],
                            t.binaryExpression('+', t.stringLiteral('__idx_'), t.identifier('__k')),
                          )

                  // __refreshIssuesItems() {
                  //   const arr = this.props.issues ?? [];
                  //   const __new = this.__reconcileList(this._issuesItems, arr, this.__el('b1'),
                  //     IssueCard, opt => this.__itemProps_issues(opt), opt => opt.id);
                  //   this._issuesItems.length = 0;
                  //   this._issuesItems.push(...__new);
                  // }
                  const refreshMethod = t.classMethod(
                    'method',
                    t.identifier(refreshMethodName),
                    [],
                    t.blockStatement([
                      ...arrayResult.arrSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement),
                      t.variableDeclaration('const', [
                        t.variableDeclarator(
                          t.identifier('__arr'),
                          t.logicalExpression(
                            '??',
                            t.cloneNode(arrayResult.arrAccessExpr, true),
                            t.arrayExpression([]),
                          ),
                        ),
                      ]),
                      t.variableDeclaration('const', [
                        t.variableDeclarator(
                          t.identifier('__new'),
                          t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__reconcileList')), [
                            t.memberExpression(t.thisExpression(), t.identifier(itemsName)),
                            t.identifier('__arr'),
                            t.cloneNode(containerExpr, true),
                            t.identifier(arrayResult.componentTag),
                            t.arrowFunctionExpression(
                              [t.identifier('opt')],
                              t.callExpression(
                                t.memberExpression(t.thisExpression(), t.identifier(itemPropsMethodNameRef)),
                                [t.identifier('opt')],
                              ),
                            ),
                            t.cloneNode(keyFn, true),
                          ]),
                        ),
                      ]),
                      t.expressionStatement(
                        t.assignmentExpression(
                          '=',
                          t.memberExpression(
                            t.memberExpression(t.thisExpression(), t.identifier(itemsName)),
                            t.identifier('length'),
                          ),
                          t.numericLiteral(0),
                        ),
                      ),
                      t.expressionStatement(
                        t.callExpression(
                          t.memberExpression(
                            t.memberExpression(t.thisExpression(), t.identifier(itemsName)),
                            t.identifier('push'),
                          ),
                          [t.spreadElement(t.identifier('__new'))],
                        ),
                      ),
                    ]),
                  )
                  classPath.node.body.body.push(refreshMethod)

                  if (computedDeps.length > 0) {
                    computedDeps.forEach((dep) => {
                      mergeObserveMethod(
                        dep.observeKey,
                        t.classMethod(
                          'method',
                          t.identifier(getObserveMethodName(dep.pathParts, dep.storeVar)),
                          [t.identifier('value'), t.identifier('change')],
                          t.blockStatement([
                            t.expressionStatement(
                              t.callExpression(
                                t.memberExpression(t.thisExpression(), t.identifier(refreshMethodName)),
                                [],
                              ),
                            ),
                          ]),
                        ),
                      )
                      if (dep.storeVar) {
                        storeComponentArrayObservers.push({
                          storeVar: dep.storeVar,
                          refreshMethodName,
                          pathParts: dep.pathParts,
                        })
                      }
                    })
                  }
                  const itemPropsMethod = arrayResult.itemPropsMethod
                  if (itemPropsMethod && t.isBlockStatement(itemPropsMethod.body)) {
                    const returnStmt = itemPropsMethod.body.body.find((s) => t.isReturnStatement(s)) as
                      | t.ReturnStatement
                      | undefined
                    if (returnStmt?.argument && t.isObjectExpression(returnStmt.argument)) {
                      const setupStmts = itemPropsMethod.body.body.filter(
                        (s) => !t.isReturnStatement(s),
                      ) as t.Statement[]
                      const itemPropsDeps = collectExpressionDependencies(
                        returnStmt.argument,
                        stateRefs,
                        setupStmts,
                      ).filter((dep) => dep.storeVar)
                      const computedDepKeys = new Set(
                        computedDeps.map((cd) => `${cd.storeVar}:${pathPartsToString(cd.pathParts)}`),
                      )
                      for (const dep of itemPropsDeps) {
                        const key = `${dep.storeVar}:${pathPartsToString(dep.pathParts)}`
                        if (computedDepKeys.has(key)) continue
                        computedDepKeys.add(key)
                        storeComponentArrayObservers.push({
                          storeVar: dep.storeVar!,
                          refreshMethodName,
                          pathParts: dep.pathParts,
                        })
                      }
                    }
                  }
                  const itemTemplateProps = collectPropNamesFromItemTemplate(um.itemTemplate, propNames)
                  const allStoreManaged = computedDeps.length > 0 && computedDeps.every((dep) => dep.storeVar)
                  componentArrayRefreshDeps.push({
                    methodName: refreshMethodName,
                    propNames: allStoreManaged ? [...itemTemplateProps] : [arrayPropName, ...itemTemplateProps],
                  })
                }
                componentArrayDisposeTargets.push(getComponentArrayItemsName(arrayPropName))
                const wasReplacedInTemplate = replaceMapWithComponentArrayItems(
                  templateMethod,
                  um.computationExpr,
                  getComponentArrayItemsName(arrayPropName),
                )
                // When the .map() lives inside a child component's children prop,
                // it won't be found in the template. Schedule a __refresh call in
                // createdHooks to populate the DOM container after mount.
                if (!wasReplacedInTemplate && !storeArrayAccess) {
                  staticArrayRefreshOnMount.push(getComponentArrayRefreshMethodName(arrayPropName))
                }
                applied = true
              }
              return
            }

            const syntheticBinding = {
              arrayPathParts: [`__unresolved_${idx}`],
              itemVariable: um.itemVariable,
              ...(um.indexVariable ? { indexVariable: um.indexVariable } : {}),
              itemBindings: [],
              containerSelector: um.containerSelector,
              containerBindingId: um.containerBindingId,
              itemTemplate: um.itemTemplate,
              isImportedState: false,
              itemIdProperty: um.itemIdProperty,
              ...(um.keyExpression ? { keyExpression: um.keyExpression } : {}),
              ...(um.callbackBodyStatements?.length ? { callbackBodyStatements: um.callbackBodyStatements } : {}),
            }
            unresolvedBindings.push({ info: um, binding: syntheticBinding })
            const prevEventLen = unresolvedEventHandlers.length
            const { method, handlerPropsInMap, needsUnwrapHelper, needsRawStoreCache } = generateRenderItemMethod(
              syntheticBinding,
              imports,
              unresolvedEventHandlers,
              eventIdCounter,
              classPath.node.body,
              tmplSetupCtx,
            )
            if (needsUnwrapHelper) needsModuleLevelUnwrapHelper = true
            if (needsRawStoreCache) needsClassLevelRawStoreField = true
            const newHandlers = unresolvedEventHandlers.slice(prevEventLen)
            const tokenMatch = newHandlers[0]?.selector?.match(/data-gea-event="([^"]+)"/)
            mapItemAttrInfos.push({
              itemVariable: um.itemVariable,
              itemIdProperty: um.itemIdProperty,
              ...(um.keyExpression ? { keyExpression: um.keyExpression } : {}),
              containerBindingId: um.containerBindingId,
              eventToken: tokenMatch ? tokenMatch[1] : undefined,
            })
            if (method && templateMethod) {
              classPath.node.body.body.push(method)
              applied = true
            }
            const createResult = generateCreateItemMethod(
              syntheticBinding,
              getTemplatePropNames(classPath.node.body),
              getTemplateParamIdentifier(classPath.node.body),
              tmplSetupCtx,
            )
            if (createResult.method) classPath.node.body.body.push(createResult.method)
            if (createResult.needsRawStoreCache) needsClassLevelRawStoreField = true
            for (const f of createResult.privateFields) classLevelPrivateFields.add(f)
            const patchResult = generatePatchItemMethod(
              syntheticBinding,
              getTemplatePropNames(classPath.node.body),
              getTemplateParamIdentifier(classPath.node.body),
              tmplSetupCtx,
            )
            if (patchResult.method) classPath.node.body.body.push(patchResult.method)
            for (const f of patchResult.privateFields) classLevelPrivateFields.add(f)
            if (handlerPropsInMap.length > 0 && um.computationExpr) {
              if (arrayPropName) {
                const propNames = getTemplatePropNames(classPath.node.body)
                const populateMethod = buildPopulateItemHandlersMethod(
                  arrayPropName,
                  handlerPropsInMap,
                  propNames,
                  getTemplateParamIdentifier(classPath.node.body),
                )
                if (populateMethod && templateMethod && t.isBlockStatement(templateMethod.body)) {
                  const arrayVarName = getTemplatePropVarName(templateMethod, arrayPropName)
                  classPath.node.body.body.push(populateMethod)
                  applied = true
                  templateMethod.body.body.unshift(
                    t.expressionStatement(
                      t.logicalExpression(
                        '&&',
                        t.identifier(arrayVarName),
                        t.callExpression(
                          t.memberExpression(
                            t.thisExpression(),
                            t.identifier(`__populateItemHandlersFor_${arrayPropName}`),
                          ),
                          [t.identifier(arrayVarName)],
                        ),
                      ),
                    ),
                  )
                }
              }
            }
          })

          if (componentArrayDisposeTargets.length > 0) {
            ensureDisposeCalls(classPath.node.body, componentArrayDisposeTargets)
          }

          const unresolvedMapPropRefreshDeps: Array<{ mapIdx: number; propNames: string[] }> = []
          unresolvedBindings.forEach(({ info, binding }) => {
            const deps = info.dependencies || collectUnresolvedDependencies([info], stateRefs, classPath.node.body)
            if (!info.dependencies) info.dependencies = deps

            // Local state deps (e.g. this.value used in .map()) need observe
            // methods that call __geaSyncMap so the list re-syncs on change.
            const localStateDeps = deps.filter((dep) => !dep.storeVar && dep.pathParts[0] !== 'props')
            const mapIdx = getMapIndex(binding.arrayPathParts)
            for (const dep of localStateDeps) {
              mergeObserveMethod(
                dep.observeKey,
                t.classMethod(
                  'method',
                  t.identifier(getObserveMethodName(dep.pathParts, dep.storeVar)),
                  [t.identifier('value'), t.identifier('change')],
                  t.blockStatement([
                    t.expressionStatement(
                      t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__geaSyncMap')), [
                        t.numericLiteral(mapIdx),
                      ]),
                    ),
                  ]),
                ),
              )
              if (!stateProps.has(dep.observeKey)) stateProps.set(dep.observeKey, dep.pathParts)
            }

            const usedPropNames = new Set<string>()
            const scanNodes: t.Statement[] = [
              ...(info.computationSetupStatements || []).map((s) => t.cloneNode(s, true) as t.Statement),
            ]
            if (info.computationExpr) {
              scanNodes.push(t.expressionStatement(t.cloneNode(info.computationExpr, true) as t.Expression))
            }
            const addPropNameFromMember = (path: NodePath<t.MemberExpression>) => {
              if (
                templateWholeParam &&
                t.isIdentifier(path.node.object, { name: templateWholeParam }) &&
                t.isIdentifier(path.node.property) &&
                !path.node.computed
              ) {
                usedPropNames.add(path.node.property.name)
              }
            }
            if (scanNodes.length > 0) {
              const prog = t.program(scanNodes)
              traverse(prog, {
                noScope: true,
                Identifier(path: NodePath<t.Identifier>) {
                  if (templatePropNames.has(path.node.name)) usedPropNames.add(path.node.name)
                },
                MemberExpression: addPropNameFromMember,
              })
            }
            // Also scan the item template for prop references (e.g. index === activeTabIndex in class bindings).
            // Exclude the item variable and index variable since those are callback-local, not props.
            if (info.itemTemplate) {
              const skipVars = new Set([info.itemVariable, ...(info.indexVariable ? [info.indexVariable] : [])])
              const templateProg = t.program([
                t.expressionStatement(t.cloneNode(info.itemTemplate, true) as t.Expression),
              ])
              traverse(templateProg, {
                noScope: true,
                Identifier(path: NodePath<t.Identifier>) {
                  if (!skipVars.has(path.node.name) && templatePropNames.has(path.node.name)) {
                    usedPropNames.add(path.node.name)
                  }
                },
                MemberExpression: addPropNameFromMember,
              })
            }
            if (usedPropNames.size === 0) return

            unresolvedMapPropRefreshDeps.push({
              mapIdx: getMapIndex(binding.arrayPathParts),
              propNames: Array.from(usedPropNames),
            })
          })

          ensureOnPropChangeMethod(
            classPath.node.body,
            inlinePatchBodies,
            compiledChildren,
            componentArrayRefreshDeps,
            analysis.conditionalSlots || [],
            unresolvedMapPropRefreshDeps,
          )

          if (elRefFieldNames.length > 0) {
            const hasReset = classPath.node.body.body.some(
              (m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === '__resetEls',
            )
            if (!hasReset) {
              classPath.node.body.body.push(
                t.classMethod(
                  'method',
                  t.identifier('__resetEls'),
                  [],
                  t.blockStatement(
                    elRefFieldNames.map((name) =>
                      t.expressionStatement(
                        t.assignmentExpression(
                          '=',
                          t.memberExpression(t.thisExpression(), t.identifier(name)),
                          t.nullLiteral(),
                        ),
                      ),
                    ),
                  ),
                ),
              )
              applied = true
            }
          }

          if (analysis.stateChildSlots && analysis.stateChildSlots.length > 0) {
            generateStateChildSwapMethod(classPath.node.body, analysis.stateChildSlots)
          }

          const stateChildObserveKeys = new Set(
            (analysis.stateChildSlots || []).flatMap((slot) => slot.dependencies || []).map((dep) => dep.observeKey),
          )
          for (const dep of (analysis.stateChildSlots || []).flatMap((slot) => slot.dependencies || [])) {
            if (!stateProps.has(dep.observeKey)) {
              stateProps.set(dep.observeKey, dep.pathParts)
            }
          }
          const conditionalSlotObserveIndices = new Map<string, number[]>()
          const addCondSlotIndex = (observeKey: string, slotIndex: number) => {
            const indices = conditionalSlotObserveIndices.get(observeKey) || []
            if (!indices.includes(slotIndex)) indices.push(slotIndex)
            conditionalSlotObserveIndices.set(observeKey, indices)
          }
          ;(analysis.conditionalSlots || []).forEach((slot, slotIndex) => {
            ;(slot.dependencies || []).forEach((dep) => addCondSlotIndex(dep.observeKey, slotIndex))
            const condDeps = collectExpressionDependencies(slot.conditionExpr, stateRefs, slot.setupStatements)
            for (const dep of condDeps) {
              if (!dep.storeVar) continue
              addCondSlotIndex(dep.observeKey, slotIndex)
            }
            for (const htmlExpr of [slot.truthyHtmlExpr, slot.falsyHtmlExpr]) {
              if (!htmlExpr) continue
              const contentDeps = collectExpressionDependencies(htmlExpr, stateRefs, slot.setupStatements)
              for (const dep of contentDeps) {
                addCondSlotIndex(dep.observeKey, slotIndex)
              }
            }
          })

          for (const [observeKey] of conditionalSlotObserveIndices) {
            if (!stateProps.has(observeKey)) {
              const { parts } = parseObserveKey(observeKey)
              stateProps.set(observeKey, parts)
            }
          }

          const hasOnPropChange = classPath.node.body.body.some(
            (member) => t.isClassMethod(member) && t.isIdentifier(member.key) && member.key.name === '__onPropChange',
          )

          const childObserveGroups = new Map<string, ChildComponent[]>()
          compiledChildren.forEach((child) => {
            if (childHasNoProps(child)) return
            child.dependencies.forEach((dep) => {
              const group = childObserveGroups.get(dep.observeKey) || []
              group.push(child)
              childObserveGroups.set(dep.observeKey, group)
            })
          })

          const unresolvedMapKeys = new Set<string>()
          unresolvedBindings.forEach(({ info }) => {
            const deps = info.dependencies || []
            deps.forEach((dep) => unresolvedMapKeys.add(dep.observeKey))
          })

          // Collect observe keys that will be handled by resolved array map delegates.
          // These keys should not trigger child props refresh for wrapper components
          // whose children contain the map, since the map handler updates in-place.
          const resolvedArrayMapDelegateKeys = new Set<string>()
          analysis.arrayMaps.forEach((arrayMap) => {
            if (arrayMap.storeVar) {
              const storeRef = stateRefs.get(arrayMap.storeVar)
              const getterDepPaths = storeRef?.getterDeps?.get(arrayMap.arrayPathParts[0])
              if (getterDepPaths && getterDepPaths.length > 0) {
                for (const depPath of getterDepPaths) {
                  resolvedArrayMapDelegateKeys.add(buildObserveKey(depPath, arrayMap.storeVar))
                }
              }
              // Also include the direct array observe key
              resolvedArrayMapDelegateKeys.add(buildObserveKey(arrayMap.arrayPathParts, arrayMap.storeVar))
            }
          })

          const ownClassMethodNames = new Set(
            classPath.node.body.body
              .filter((m): m is t.ClassMethod => t.isClassMethod(m) && t.isIdentifier(m.key))
              .map((m) => (m.key as t.Identifier).name),
          )

          const componentGetterStoreDeps = new Map<
            string,
            Array<{ storeVar: string; pathParts: PathParts; dynamicKeyExpr?: t.Expression }>
          >()
          const getterLocalRefs = new Map<string, Set<string>>()
          const getterNames = new Set<string>()
          for (const member of classPath.node.body.body) {
            if (t.isClassMethod(member) && member.kind === 'get' && t.isIdentifier(member.key))
              getterNames.add(member.key.name)
          }
          for (const member of classPath.node.body.body) {
            if (!t.isClassMethod(member) || member.kind !== 'get' || !t.isIdentifier(member.key)) continue
            const getterName = member.key.name
            const depMap = new Map<string, { storeVar: string; pathParts: PathParts; dynamicKeyExpr?: t.Expression }>()
            const localRefs = new Set<string>()
            const program = t.program(member.body.body.map((s) => t.cloneNode(s, true) as t.Statement))
            traverse(program, {
              noScope: true,
              OptionalMemberExpression(mePath: NodePath<t.OptionalMemberExpression>) {
                const objectNode = mePath.node.object
                if (!t.isMemberExpression(objectNode)) return
                if (!t.isIdentifier(objectNode.object) || !t.isIdentifier(objectNode.property)) return
                const objName = objectNode.object.name
                const ref = stateRefs.get(objName)
                if (!ref || ref.kind !== 'imported') return
                if (!mePath.node.computed || !t.isExpression(mePath.node.property)) return
                if (!canInlineDynamicObserverKey(mePath.node.property)) return
                depMap.set(`${objName}.${objectNode.property.name}`, {
                  storeVar: objName,
                  pathParts: [objectNode.property.name],
                  dynamicKeyExpr: t.cloneNode(mePath.node.property, true),
                })
              },
              MemberExpression(mePath: NodePath<t.MemberExpression>) {
                if (t.isThisExpression(mePath.node.object) && t.isIdentifier(mePath.node.property)) {
                  const propName = mePath.node.property.name
                  if (getterNames.has(propName) && propName !== getterName) localRefs.add(propName)
                  return
                }
                if (
                  t.isMemberExpression(mePath.node.object) &&
                  t.isIdentifier(mePath.node.object.object) &&
                  t.isIdentifier(mePath.node.object.property) &&
                  mePath.node.computed &&
                  t.isExpression(mePath.node.property)
                ) {
                  const objName = mePath.node.object.object.name
                  const ref = stateRefs.get(objName)
                  if (ref && ref.kind === 'imported' && canInlineDynamicObserverKey(mePath.node.property)) {
                    depMap.set(`${objName}.${mePath.node.object.property.name}`, {
                      storeVar: objName,
                      pathParts: [mePath.node.object.property.name],
                      dynamicKeyExpr: t.cloneNode(mePath.node.property, true),
                    })
                    return
                  }
                }
                if (!t.isIdentifier(mePath.node.object)) return
                const objName = mePath.node.object.name
                const ref = stateRefs.get(objName)
                if (!ref || ref.kind !== 'imported') return
                if (!t.isIdentifier(mePath.node.property)) return
                if (!depMap.has(`${objName}.${mePath.node.property.name}`)) {
                  depMap.set(`${objName}.${mePath.node.property.name}`, {
                    storeVar: objName,
                    pathParts: [mePath.node.property.name],
                  })
                }
              },
            })
            const deps = Array.from(depMap.values())
            if (deps.length > 0) componentGetterStoreDeps.set(member.key.name, deps)
            if (localRefs.size > 0) getterLocalRefs.set(member.key.name, localRefs)
          }
          // Propagate transitive deps: if getter A refs this.B and B has store deps, merge into A
          let changed = true
          while (changed) {
            changed = false
            for (const [getterName, refs] of getterLocalRefs) {
              for (const refName of refs) {
                const refDeps = componentGetterStoreDeps.get(refName)
                if (!refDeps) continue
                const existing = componentGetterStoreDeps.get(getterName) || []
                for (const dep of refDeps) {
                  const key = `${dep.storeVar}.${dep.pathParts.join('.')}:${dep.dynamicKeyExpr ? 'dyn' : 'plain'}`
                  if (
                    !existing.some(
                      (e) => `${e.storeVar}.${e.pathParts.join('.')}:${e.dynamicKeyExpr ? 'dyn' : 'plain'}` === key,
                    )
                  ) {
                    existing.push(dep)
                    changed = true
                  }
                }
                if (!componentGetterStoreDeps.has(getterName)) componentGetterStoreDeps.set(getterName, existing)
              }
            }
          }

          const guardStateKeys = new Set<string>()
          if (templateMethod && t.isBlockStatement(templateMethod.body)) {
            const tmplBody = templateMethod.body.body
            const returnIdx = tmplBody.findIndex((s) => t.isReturnStatement(s))
            if (returnIdx > 0) {
              for (let gi = 0; gi < returnIdx; gi++) {
                const stmt = tmplBody[gi]
                if (
                  !t.isIfStatement(stmt) ||
                  !(
                    t.isReturnStatement(stmt.consequent) ||
                    (t.isBlockStatement(stmt.consequent) && stmt.consequent.body.some((b) => t.isReturnStatement(b)))
                  )
                )
                  continue
                const guardAliasInits = new Map<string, t.Expression>()
                for (let si = 0; si < gi; si++) {
                  const setupStmt = tmplBody[si]
                  if (!t.isVariableDeclaration(setupStmt)) continue
                  for (const decl of setupStmt.declarations) {
                    if (!t.isIdentifier(decl.id) || !decl.init || !t.isExpression(decl.init)) continue
                    guardAliasInits.set(decl.id.name, decl.init)
                  }
                }
                const addGuardObserveKey = (resolved: {
                  parts: PathParts | null
                  isImportedState?: boolean
                  storeVar?: string
                }) => {
                  if (!resolved?.parts?.length) return
                  if (!resolved.isImportedState) return
                  const observeKey = buildObserveKey(resolved.parts, resolved.storeVar)
                  guardStateKeys.add(observeKey)
                  if (!stateProps.has(observeKey)) stateProps.set(observeKey, [...resolved.parts])
                }
                for (const [aliasName, init] of guardAliasInits) {
                  if (!expressionReferencesIdentifier(stmt.test, aliasName)) continue
                  if (
                    !(
                      t.isIdentifier(init) ||
                      t.isMemberExpression(init) ||
                      t.isThisExpression(init) ||
                      t.isCallExpression(init)
                    )
                  )
                    continue
                  const resolvedAlias = resolvePath(init, stateRefs)
                  if (resolvedAlias) addGuardObserveKey(resolvedAlias)
                }
                const resolveGuardStateExpr = (
                  expr: t.Identifier | t.MemberExpression | t.ThisExpression | t.CallExpression,
                  seen = new Set<string>(),
                ) => {
                  const resolved = resolvePath(expr, stateRefs)
                  if (resolved?.parts?.length && resolved.isImportedState) return resolved
                  if (t.isIdentifier(expr) && !seen.has(expr.name)) {
                    const init = guardAliasInits.get(expr.name)
                    if (
                      init &&
                      (t.isIdentifier(init) ||
                        t.isMemberExpression(init) ||
                        t.isThisExpression(init) ||
                        t.isCallExpression(init))
                    ) {
                      seen.add(expr.name)
                      return resolveGuardStateExpr(init, seen)
                    }
                  }
                  return null
                }
                const guardProg = t.program([t.expressionStatement(t.cloneNode(stmt.test, true) as t.Expression)])
                traverse(guardProg, {
                  noScope: true,
                  Identifier(idPath: NodePath<t.Identifier>) {
                    if (
                      t.isMemberExpression(idPath.parent) &&
                      idPath.parent.property === idPath.node &&
                      !idPath.parent.computed
                    )
                      return
                    const resolved = resolveGuardStateExpr(idPath.node)
                    if (!resolved) return
                    addGuardObserveKey(resolved)
                  },
                })
              }
            }
          }

          const arrayContainerBindingIds = new Set<string>()
          for (const am of analysis.arrayMaps) {
            if (am.containerBindingId) arrayContainerBindingIds.add(am.containerBindingId)
          }
          for (const um of analysis.unresolvedMaps) {
            if (um.containerBindingId) arrayContainerBindingIds.add(um.containerBindingId)
          }

          for (const [observeKey, propPath] of stateProps) {
            const { storeVar } = parseObserveKey(observeKey)
            if (hasOnPropChange && !storeVar && propPath[0] === 'props') continue
            if (
              !storeVar &&
              propPath.length === 1 &&
              ownClassMethodNames.has(propPath[0]) &&
              !componentGetterStoreDeps.has(propPath[0])
            )
              continue
            const alreadyHandled = handledPaths.has(observeKey)
            const conditionalSlotIndices = conditionalSlotObserveIndices.get(observeKey) || []
            const arrayHandled = analysis.arrayMaps.some(
              (am) =>
                pathPartsToString(am.arrayPathParts) === pathPartsToString(propPath) &&
                (am.storeVar || undefined) === storeVar,
            )

            if (alreadyHandled) {
              if (conditionalSlotIndices.length > 0) {
                mergeObserveMethod(
                  observeKey,
                  generateConditionalSlotObserveMethod(propPath, storeVar, conditionalSlotIndices, false),
                )
              } else if (guardStateKeys.has(observeKey)) {
                mergeObserveMethod(observeKey, generateRerenderObserver(propPath, storeVar, true))
              }
              continue
            }

            const isNestedArrayPath =
              propPath.length > 1 &&
              analysis.arrayMaps.some(
                (am) =>
                  pathPartsToString(am.arrayPathParts) === pathPartsToString([propPath[0]]) &&
                  (am.storeVar || undefined) === storeVar,
              )

            const relationalArrayMaps = analysis.arrayMaps
              .map((arrayMap) => ({
                arrayMap,
                bindings: (arrayMap.relationalBindings || []).filter(
                  (binding) =>
                    pathPartsToString(binding.observePathParts) === pathPartsToString(propPath) &&
                    (binding.storeVar || undefined) === storeVar,
                ),
              }))
              .filter((entry) => entry.bindings.length > 0)

            if (relationalArrayMaps.length > 0) {
              relationalArrayMaps.forEach(({ arrayMap, bindings }) => {
                const relResult = generateArrayRelationalObserver(
                  propPath,
                  arrayMap,
                  bindings,
                  getObserveMethodName(propPath, storeVar),
                )
                mergeObserveMethod(observeKey, relResult.method)
                for (const f of relResult.privateFields) classLevelPrivateFields.add(f)
              })
            }

            const fallbackArrayMaps = analysis.arrayMaps
              .map((arrayMap) => ({
                arrayMap,
                bindings: (arrayMap.conditionalBindings || []).filter(
                  (binding) =>
                    binding.observe.observeKey === observeKey &&
                    observeKey !== buildObserveKey(arrayMap.arrayPathParts, arrayMap.storeVar),
                ),
              }))
              .filter((entry) => entry.bindings.length > 0)
            if (fallbackArrayMaps.length > 0) {
              fallbackArrayMaps.forEach(({ arrayMap, bindings }) => {
                const observer = bindings.some((binding) => binding.requiresRerender)
                  ? generateArrayConditionalRerenderObserver(arrayMap, getObserveMethodName(propPath, storeVar))
                  : generateArrayConditionalPatchObserver(arrayMap, bindings, getObserveMethodName(propPath, storeVar))
                mergeObserveMethod(observeKey, observer)
              })
              continue
            }

            let hasInlinePatches = false
            if (!stateChildObserveKeys.has(observeKey)) {
              const coveredBindings = storeKeyToBindings.get(observeKey)
              if (coveredBindings) {
                const patchStatements: t.Statement[] = []
                for (const pb of coveredBindings) {
                  if (pb.type === 'text' && pb.bindingId && arrayContainerBindingIds.has(pb.bindingId)) continue
                  const body = patchStatementsByBinding.get(pb)
                  if (body) {
                    if (coveredBindings.size === 1)
                      patchStatements.push(...body.map((s) => t.cloneNode(s, true) as t.Statement))
                    else patchStatements.push(t.blockStatement(body.map((s) => t.cloneNode(s, true) as t.Statement)))
                  }
                }
                if (patchStatements.length > 0) {
                  mergeObserveMethod(observeKey, generateStoreInlinePatchObserver(propPath, storeVar, patchStatements))
                  hasInlinePatches = true
                }
              }
            }

            if (conditionalSlotIndices.length > 0) {
              mergeObserveMethod(
                observeKey,
                generateConditionalSlotObserveMethod(
                  propPath,
                  storeVar,
                  conditionalSlotIndices,
                  // Do not return after __geaPatchCond when this key also drives a resolved array map:
                  // array handlers are merged into the same method later and must still run (e.g. gesture log).
                  !hasInlinePatches && !arrayHandled,
                ),
              )
            }

            if (hasInlinePatches) continue

            if (arrayHandled) continue
            if (isNestedArrayPath) continue
            if (stateChildObserveKeys.has(observeKey)) {
              mergeObserveMethod(observeKey, generateStateChildSwapObserver(propPath, storeVar))
              continue
            }

            if (analysis.arrayMaps.length > 0 && !guardStateKeys.has(observeKey)) continue
            if (unresolvedMapKeys.has(observeKey)) continue

            const handledByComponentArray =
              storeComponentArrayObservers.some(
                (obs) => obs.storeVar === storeVar && pathPartsToString(obs.pathParts) === pathPartsToString(propPath),
              ) ||
              observeListConfigs.some(
                (olc) => olc.storeVar === storeVar && pathPartsToString(olc.pathParts) === pathPartsToString(propPath),
              )
            if (handledByComponentArray) continue

            if (!childObserveGroups.has(observeKey)) {
              if (conditionalSlotIndices.length > 0) continue
              if (analysis.conditionalSlotScopedStoreKeys?.has(observeKey)) continue
              // Skip rerender for getter paths whose underlying deps are already
              // covered by childObserveGroups — the delegate mechanism will handle
              // these via isVia observers on the dep paths.
              if (storeVar && propPath.length >= 1) {
                const storeRef = stateRefs.get(storeVar)
                const getterDepPaths = storeRef?.getterDeps?.get(propPath[0])
                if (getterDepPaths && getterDepPaths.length > 0) {
                  const allDepsCovered = getterDepPaths.every((depPath) =>
                    childObserveGroups.has(buildObserveKey(depPath, storeVar)),
                  )
                  if (allDepsCovered) continue
                }
              }
              mergeObserveMethod(
                observeKey,
                generateRerenderObserver(propPath, storeVar, guardStateKeys.has(observeKey)),
              )
            } else if (guardStateKeys.has(observeKey)) {
              // Guard keys that also have child observers need a re-render observer
              // so that null<->non-null transitions trigger a full DOM rebuild.
              mergeObserveMethod(observeKey, generateRerenderObserver(propPath, storeVar, true))
            }
          }

          for (const guardKey of guardStateKeys) {
            if (addedMethods.has(guardKey)) continue
            const { parts, storeVar } = parseObserveKey(guardKey)
            mergeObserveMethod(guardKey, generateRerenderObserver(parts, storeVar, true))
          }

          // Identify compiled children whose `children` prop contains a resolved
          // array map. Their child props refresh calls should be skipped for
          // observe keys handled by the resolved array map delegates, because
          // innerHTML replacement would destroy in-place map items and lose
          // JS-object props that can't survive string serialisation.
          const childrenWithResolvedMap = new Set<string>()
          compiledChildren.forEach((child) => {
            const childrenProp = child.propsExpression.properties.find(
              (p): p is t.ObjectProperty => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'children',
            )
            if (!childrenProp) return
            let hasMap = false
            const check = {
              CallExpression(cePath: NodePath<t.CallExpression>) {
                if (
                  t.isMemberExpression(cePath.node.callee) &&
                  t.isIdentifier(cePath.node.callee.property) &&
                  cePath.node.callee.property.name === 'map'
                ) {
                  hasMap = true
                  cePath.stop()
                }
              },
            }
            const wrapper = t.expressionStatement(t.cloneNode(childrenProp.value as t.Expression, true))
            traverse(t.program([wrapper]), { noScope: true, ...check })
            if (hasMap) childrenWithResolvedMap.add(child.instanceVar)
          })

          // For compiled children whose children prop contains a resolved array
          // map, strip the .map().join("") calls from the template literal.  The
          // container element is kept (with its binding ID) but left empty.  An
          // onAfterRender method will call the observer to populate it via DOM
          // APIs, avoiding HTML-parser foster-parenting of custom elements inside
          // table contexts.
          // Only strip when there are actual resolved array maps — non-reactive
          // local variable maps (const arrays) must remain in the template.
          if (childrenWithResolvedMap.size > 0 && analysis.arrayMaps.length > 0) {
            compiledChildren.forEach((child) => {
              if (!childrenWithResolvedMap.has(child.instanceVar)) return
              const childrenProp = child.propsExpression.properties.find(
                (p): p is t.ObjectProperty =>
                  t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'children',
              )
              if (!childrenProp || !t.isTemplateLiteral(childrenProp.value)) return
              const tpl = childrenProp.value
              // Walk template expressions and replace .map(...).join("") or
              // .map(...) calls with empty string.
              for (let i = 0; i < tpl.expressions.length; i++) {
                const expr = tpl.expressions[i]
                let isMapJoin = false
                // Pattern: xxx.map(...).join("")
                if (
                  t.isCallExpression(expr) &&
                  t.isMemberExpression(expr.callee) &&
                  t.isIdentifier(expr.callee.property, { name: 'join' }) &&
                  t.isCallExpression(expr.callee.object) &&
                  t.isMemberExpression(expr.callee.object.callee) &&
                  t.isIdentifier(expr.callee.object.callee.property, { name: 'map' })
                ) {
                  isMapJoin = true
                }
                // Pattern: xxx.map(...)  (without .join)
                if (
                  !isMapJoin &&
                  t.isCallExpression(expr) &&
                  t.isMemberExpression(expr.callee) &&
                  t.isIdentifier(expr.callee.property, { name: 'map' })
                ) {
                  isMapJoin = true
                }
                // Pattern: (xxx.map(...).join("") || "")
                if (
                  !isMapJoin &&
                  t.isLogicalExpression(expr) &&
                  t.isCallExpression(expr.left) &&
                  t.isMemberExpression(expr.left.callee) &&
                  t.isIdentifier(expr.left.callee.property, { name: 'join' }) &&
                  t.isCallExpression(expr.left.callee.object) &&
                  t.isMemberExpression(expr.left.callee.object.callee) &&
                  t.isIdentifier(expr.left.callee.object.callee.property, { name: 'map' })
                ) {
                  isMapJoin = true
                }
                if (isMapJoin) {
                  // Replace expression with empty string and merge surrounding quasis
                  tpl.expressions.splice(i, 1)
                  const leftQuasi = tpl.quasis[i]
                  const rightQuasi = tpl.quasis[i + 1]
                  if (leftQuasi && rightQuasi) {
                    const merged = (leftQuasi.value.raw || '') + (rightQuasi.value.raw || '')
                    leftQuasi.value = { raw: merged, cooked: merged }
                    tpl.quasis.splice(i + 1, 1)
                  }
                  i-- // re-check same index
                }
              }
            })

            // Also strip map calls from __buildProps methods
            // that reference these children prop template literals.
            for (const member of classPath.node.body.body) {
              if (!t.isClassMethod(member) || !t.isIdentifier(member.key)) continue
              const methodName = member.key.name
              const isRelevant = childrenWithResolvedMap.size > 0 && methodName.startsWith('__buildProps_')
              if (!isRelevant) continue
              // Find template literals in the method body and strip map calls
              traverse(t.program([t.expressionStatement(t.functionExpression(null, [], member.body))]), {
                noScope: true,
                TemplateLiteral(tlPath: NodePath<t.TemplateLiteral>) {
                  const tl = tlPath.node
                  for (let i = 0; i < tl.expressions.length; i++) {
                    const expr = tl.expressions[i] as t.Expression
                    let isMap = false
                    if (
                      t.isCallExpression(expr) &&
                      t.isMemberExpression(expr.callee) &&
                      t.isIdentifier(expr.callee.property, { name: 'join' }) &&
                      expr.arguments.length === 1 &&
                      t.isStringLiteral(expr.arguments[0]) &&
                      expr.arguments[0].value === '' &&
                      t.isCallExpression(expr.callee.object) &&
                      t.isMemberExpression(expr.callee.object.callee) &&
                      t.isIdentifier(expr.callee.object.callee.property, { name: 'map' })
                    ) {
                      isMap = true
                    }
                    if (
                      !isMap &&
                      t.isCallExpression(expr) &&
                      t.isMemberExpression(expr.callee) &&
                      t.isIdentifier(expr.callee.property, { name: 'map' })
                    ) {
                      isMap = true
                    }
                    if (
                      !isMap &&
                      t.isLogicalExpression(expr) &&
                      t.isCallExpression(expr.left) &&
                      t.isMemberExpression(expr.left.callee) &&
                      t.isIdentifier(expr.left.callee.property, { name: 'join' }) &&
                      expr.left.arguments.length === 1 &&
                      t.isStringLiteral(expr.left.arguments[0]) &&
                      expr.left.arguments[0].value === '' &&
                      t.isCallExpression(expr.left.callee.object) &&
                      t.isMemberExpression(expr.left.callee.object.callee) &&
                      t.isIdentifier(expr.left.callee.object.callee.property, { name: 'map' })
                    ) {
                      isMap = true
                    }
                    if (isMap) {
                      tl.expressions.splice(i, 1)
                      const left = tl.quasis[i]
                      const right = tl.quasis[i + 1]
                      if (left && right) {
                        const m = (left.value.raw || '') + (right.value.raw || '')
                        left.value = { raw: m, cooked: m }
                        tl.quasis.splice(i + 1, 1)
                      }
                      i--
                    }
                  }
                },
              })
            }
          }

          {
            childObserveGroups.forEach((children, observeKey) => {
              const { parts, storeVar } = parseObserveKey(observeKey)
              if (hasOnPropChange && !storeVar && parts[0] === 'props') return
              const methodName = getObserveMethodName(parts, storeVar)
              const existing = addedMethods.get(observeKey)
              const calls = children
                .filter((child) => {
                  // Skip child props refresh for children with resolved array maps
                  // when the observe key is handled by the map delegate.
                  if (resolvedArrayMapDelegateKeys.has(observeKey) && childrenWithResolvedMap.has(child.instanceVar)) {
                    return false
                  }
                  return true
                })
                .map((child) => {
                  const updateExpr = t.expressionStatement(
                    t.callExpression(
                      t.memberExpression(
                        t.memberExpression(t.thisExpression(), t.identifier(child.instanceVar)),
                        t.identifier('__geaUpdateProps'),
                      ),
                      [
                        t.callExpression(
                          t.memberExpression(
                            t.thisExpression(),
                            t.identifier(`__buildProps_${child.instanceVar.replace(/^_/, '')}`),
                          ),
                          [],
                        ),
                      ],
                    ),
                  )
                  if (!child.lazy) return updateExpr
                  // Guard lazy children (inside conditionals) to prevent the
                  // getter from eagerly creating the child with stale props.
                  const backingField = `__lazy${child.instanceVar}`
                  return t.ifStatement(
                    t.memberExpression(t.thisExpression(), t.identifier(backingField)),
                    t.blockStatement([updateExpr]),
                  )
                })
              if (existing && t.isBlockStatement(existing.body)) {
                // Prepend child props updates so they run before any __geaPatchCond
                // calls that may early-return and render the child with stale props.
                existing.body.body.unshift(...calls)
              } else {
                const method = t.classMethod(
                  'method',
                  t.identifier(methodName),
                  [t.identifier('value'), t.identifier('change')],
                  t.blockStatement(calls),
                )
                classPath.node.body.body.push(method)
                addedMethods.set(observeKey, method)
                applied = true
              }
            })
          }

          const mapRegistrations: t.ExpressionStatement[] = []
          const mapSyncObservers: Array<{ storeVar: string; pathParts: PathParts; delegateName: string }> = []
          unresolvedBindings.forEach(({ info, binding }) => {
            const deps = info.dependencies || collectUnresolvedDependencies([info], stateRefs, classPath.node.body)
            const mapIdx = getMapIndex(binding.arrayPathParts)
            const delegateName = `__geaSyncMapDelegate_${mapIdx}`
            const hasNonRelationalDeps = deps.some(
              (dep) => !(info.relationalClassBindings || []).find((rb) => rb.observeKey === dep.observeKey),
            )
            mapRegistrations.push(
              generateMapRegistration(
                binding,
                info,
                getTemplatePropNames(classPath.node.body),
                getTemplateParamIdentifier(classPath.node.body),
              ),
            )
            if (hasNonRelationalDeps) applied = true
            let delegateEmitted = false
            deps.forEach((dep) => {
              const relBinding = (info.relationalClassBindings || []).find((rb) => rb.observeKey === dep.observeKey)
              if (relBinding) {
                const unresolvedRelResult = generateUnresolvedRelationalObserver(
                  binding,
                  info,
                  relBinding,
                  getObserveMethodName(dep.pathParts, dep.storeVar),
                  getTemplatePropNames(classPath.node.body),
                  getTemplateParamIdentifier(classPath.node.body),
                )
                mergeObserveMethod(dep.observeKey, unresolvedRelResult.method)
                for (const f of unresolvedRelResult.privateFields) classLevelPrivateFields.add(f)
              } else if (dep.storeVar) {
                if (!delegateEmitted) {
                  classPath.node.body.body.push(
                    appendToBody(
                      jsMethod`${id(delegateName)}() {}`,
                      t.expressionStatement(
                        t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__geaSyncMap')), [
                          t.numericLiteral(mapIdx),
                        ]),
                      ),
                    ),
                  )
                  delegateEmitted = true
                }
                mapSyncObservers.push({
                  storeVar: dep.storeVar,
                  pathParts: dep.pathParts,
                  delegateName,
                })
              } else {
                const syncBody = t.blockStatement([
                  t.expressionStatement(
                    t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__geaSyncMap')), [
                      t.numericLiteral(mapIdx),
                    ]),
                  ),
                ])
                mergeObserveMethod(
                  dep.observeKey,
                  t.classMethod(
                    'method',
                    t.identifier(getObserveMethodName(dep.pathParts)),
                    [t.identifier('__v'), t.identifier('__c')],
                    syncBody,
                  ),
                )
              }
            })
          })

          if (mapItemAttrInfos.length > 0 && templateMethod) {
            injectMapItemAttrsIntoTemplate(templateMethod, mapItemAttrInfos)
          }

          if (templateMethod && analysis.unresolvedMaps.length > 0) {
            addJoinToUnresolvedMapCalls(templateMethod, analysis.unresolvedMaps)
          }

          // Redirect resolved array maps with component children to the
          // component-array pipeline (build/mount/refresh) instead of the
          // HTML-based __applyListChanges pipeline.
          const componentArrayMaps: ArrayMapBinding[] = []
          const componentArrayItemPropsMethods = new Map<ArrayMapBinding, t.ClassMethod>()
          const htmlArrayMaps: ArrayMapBinding[] = []
          for (const arrayMap of analysis.arrayMaps) {
            const compChild = isUnresolvedMapWithComponentChild(
              {
                itemTemplate: arrayMap.itemTemplate,
                itemVariable: arrayMap.itemVariable,
                containerSelector: arrayMap.containerSelector,
              } as any,
              imports,
            )
            if (compChild) {
              componentArrayMaps.push(arrayMap)
            } else {
              htmlArrayMaps.push(arrayMap)
            }
          }

          // Process component-child array maps through the component-array pipeline
          for (const arrayMap of componentArrayMaps) {
            const arrayPropName = arrayMap.arrayPathParts[arrayMap.arrayPathParts.length - 1]
            // Only use storeArrayAccess for simple single-part paths (e.g. store.columns).
            // For multi-part paths (e.g. store.issue.comments), build a computationExpr instead.
            const isSinglePart = arrayMap.storeVar && arrayMap.arrayPathParts.length === 1
            const storeArrayAccess = isSinglePart
              ? { storeVar: arrayMap.storeVar!, propName: arrayMap.arrayPathParts[0] }
              : undefined
            // Build computationExpr for multi-part store paths.
            // Use optional chaining for intermediate parts so that accessing
            // e.g. detailStore.issue?.comments doesn't crash when issue is null.
            let computationExpr: t.Expression | undefined
            let computationExprSafe: t.Expression | undefined
            if (arrayMap.storeVar && !isSinglePart) {
              // Regular MemberExpression chain (for template matching)
              let expr: t.Expression = t.identifier(arrayMap.storeVar)
              for (const part of arrayMap.arrayPathParts) {
                expr = t.memberExpression(expr, t.identifier(part))
              }
              computationExpr = expr
              // Optional-chaining version (for runtime safety when intermediate values are null)
              let safeExpr: t.Expression = t.identifier(arrayMap.storeVar)
              for (let __pi = 0; __pi < arrayMap.arrayPathParts.length; __pi++) {
                const part = arrayMap.arrayPathParts[__pi]
                safeExpr = t.optionalMemberExpression(safeExpr, t.identifier(part), false, __pi > 0)
              }
              computationExprSafe = safeExpr
            }
            const um: UnresolvedMapInfo = {
              containerSelector: arrayMap.containerSelector,
              itemTemplate: arrayMap.itemTemplate,
              itemVariable: arrayMap.itemVariable,
              ...(arrayMap.indexVariable ? { indexVariable: arrayMap.indexVariable } : {}),
              itemIdProperty: arrayMap.itemIdProperty,
              ...(arrayMap.keyExpression ? { keyExpression: arrayMap.keyExpression } : {}),
              containerElementPath: arrayMap.containerElementPath,
              containerBindingId: arrayMap.containerBindingId,
              computationExpr: computationExprSafe ?? computationExpr,
            }
            const propNames = getTemplatePropNames(classPath.node.body)
            const arrayResult = generateComponentArrayResult(
              um,
              arrayPropName,
              imports,
              propNames,
              classPath.node.body,
              storeArrayAccess,
              getTemplateParamIdentifier(classPath.node.body),
              tmplSetupCtx,
            )
            if (arrayResult && templateMethod) {
              classPath.node.body.body.push(arrayResult.itemPropsMethod)
              componentArrayItemPropsMethods.set(arrayMap, arrayResult.itemPropsMethod)
              const importSource = imports.get(arrayResult.componentTag)
              if (importSource) {
                const delegatedEvents = getHoistableRootEventsForImport(sourceFile, importSource).map((meta) => ({
                  eventType: meta.eventType,
                  selector: meta.selector,
                  methodName: `__event_${arrayPropName}_${meta.propName}`,
                  delegatedPropName: meta.propName,
                  usesTargetComponent: true,
                })) as EventHandler[]
                if (delegatedEvents.length > 0) {
                  appendCompiledEventMethods(classPath.node.body, delegatedEvents)
                }
              }
              inlineIntoConstructor(classPath.node.body, [
                ...arrayResult.arrSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement),
                arrayResult.constructorInit,
              ])
              if (arrayMap.storeVar) {
                observeListConfigs.push({
                  storeVar: arrayMap.storeVar,
                  pathParts: arrayMap.arrayPathParts,
                  arrayPropName,
                  componentTag: arrayResult.componentTag,
                  containerBindingId: arrayResult.containerBindingId,
                  containerUserIdExpr: arrayResult.containerUserIdExpr,
                  itemIdProperty: arrayResult.itemIdProperty,
                })
              }
              componentArrayDisposeTargets.push(getComponentArrayItemsName(arrayPropName))
              const mapReplaceExpr = storeArrayAccess
                ? t.memberExpression(t.identifier(storeArrayAccess.storeVar), t.identifier(storeArrayAccess.propName))
                : computationExpr
              const itemsArrName = getComponentArrayItemsName(arrayPropName)
              const wasReplaced = replaceMapWithComponentArrayItems(templateMethod, mapReplaceExpr, itemsArrName)
              replaceMapWithComponentArrayItemsInConditionalSlots(
                analysis.conditionalSlots || [],
                mapReplaceExpr,
                itemsArrName,
              )
              // When the .map() lives inside a child component's children prop
              // (not directly in template), it won't be replaced. Schedule a
              // __refresh call in createdHooks to populate the container after mount.
              if (!wasReplaced && !arrayMap.storeVar) {
                staticArrayRefreshOnMount.push(getComponentArrayRefreshMethodName(arrayPropName))
              }
              applied = true
            }
          }

          // For component array maps backed by store getters, generate delegate
          // observers on each getter dependency that call __refreshList to
          // reconcile the list with re-evaluated getter values.
          for (const arrayMap of componentArrayMaps) {
            if (!arrayMap.storeVar) continue
            const storeRef = stateRefs.get(arrayMap.storeVar)
            const getterDepPaths = storeRef?.getterDeps?.get(arrayMap.arrayPathParts[0])
            if (!getterDepPaths || getterDepPaths.length === 0) continue

            const pathKey = arrayMap.arrayPathParts.join('.')
            for (const depPath of getterDepPaths) {
              const depObserveKey = buildObserveKey(depPath, arrayMap.storeVar)
              const depMethodName = getObserveMethodName(depPath, arrayMap.storeVar)
              const refreshStmt = t.expressionStatement(
                t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__refreshList')), [
                  t.stringLiteral(pathKey),
                ]),
              )
              // If observer already exists (e.g. from conditional slot), insert
              // __refreshList BEFORE the `if (this.rendered_)` block so it isn't
              // blocked by the conditional-patch early return.
              const existing = addedMethods.get(depObserveKey)
              if (existing && t.isBlockStatement(existing.body)) {
                const renderedGuardIdx = existing.body.body.findIndex(
                  (s) =>
                    t.isIfStatement(s) &&
                    t.isMemberExpression(s.test) &&
                    t.isIdentifier(s.test.property) &&
                    s.test.property.name === 'rendered_',
                )
                if (renderedGuardIdx >= 0) {
                  existing.body.body.splice(renderedGuardIdx, 0, refreshStmt)
                } else {
                  existing.body.body.push(refreshStmt)
                }
              } else {
                const delegateMethod = t.classMethod(
                  'method',
                  t.identifier(depMethodName),
                  [t.identifier('__v'), t.identifier('__c')],
                  t.blockStatement([refreshStmt]),
                )
                mergeObserveMethod(depObserveKey, delegateMethod)
              }
            }
          }

          // For component array maps backed by stores, scan the itemProps
          // method for external state references (e.g. `selections`, `activeCategory`)
          // that aren't the array path itself. When these change, the list items'
          // props need to be re-evaluated via __refreshList.
          for (const arrayMap of componentArrayMaps) {
            if (!arrayMap.storeVar) continue
            const itemPropsMethod = componentArrayItemPropsMethods.get(arrayMap)
            if (!itemPropsMethod) continue

            const pathKey = arrayMap.arrayPathParts.join('.')
            const storeRef = stateRefs.get(arrayMap.storeVar)
            const getterDepPaths = storeRef?.getterDeps?.get(arrayMap.arrayPathParts[0])
            const getterDepKeys = new Set((getterDepPaths || []).map((dp) => buildObserveKey(dp, arrayMap.storeVar)))

            // Collect external state refs used in the itemProps method body
            const externalDeps = new Map<string, { parts: PathParts; storeVar?: string }>()
            const clonedBody = t.cloneNode(itemPropsMethod.body, true)
            traverse(t.program([t.expressionStatement(t.arrowFunctionExpression([], clonedBody))]), {
              noScope: true,
              Identifier(idPath: NodePath<t.Identifier>) {
                if (
                  idPath.parentPath &&
                  t.isMemberExpression(idPath.parentPath.node) &&
                  idPath.parentPath.node.property === idPath.node &&
                  !idPath.parentPath.node.computed
                )
                  return
                const ref = stateRefs.get(idPath.node.name)
                if (!ref) return
                // Skip the item variable parameter
                if (itemPropsMethod.params.some((p) => t.isIdentifier(p) && p.name === idPath.node.name)) return
                if (ref.kind === 'imported-destructured' && ref.storeVar && ref.propName) {
                  const depKey = buildObserveKey([ref.propName], ref.storeVar)
                  if (!getterDepKeys.has(depKey) && !externalDeps.has(depKey)) {
                    externalDeps.set(depKey, { parts: [ref.propName], storeVar: ref.storeVar })
                  }
                }
              },
              MemberExpression(mePath: NodePath<t.MemberExpression>) {
                const resolved = resolvePath(mePath.node, stateRefs)
                if (!resolved?.parts?.length || !resolved.isImportedState) return
                // Skip internal meta-properties (e.g. __raw used to bypass proxy)
                if (resolved.parts.some((p) => p === '__raw')) return
                const depKey = buildObserveKey(resolved.parts, resolved.storeVar)
                if (!getterDepKeys.has(depKey) && !externalDeps.has(depKey)) {
                  externalDeps.set(depKey, { parts: [...resolved.parts], storeVar: resolved.storeVar })
                }
              },
            })

            for (const [depKey, dep] of externalDeps) {
              const depMethodName = getObserveMethodName(dep.parts, dep.storeVar)
              if (!stateProps.has(depKey)) stateProps.set(depKey, dep.parts)
              const delegateBody = t.blockStatement([
                t.expressionStatement(
                  t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__refreshList')), [
                    t.stringLiteral(pathKey),
                  ]),
                ),
              ])
              const delegateMethod = t.classMethod(
                'method',
                t.identifier(depMethodName),
                [t.identifier('__v'), t.identifier('__c')],
                delegateBody,
              )
              mergeObserveMethod(depKey, delegateMethod)
            }
          }

          const renderEventHandlers: EventHandler[] = []
          htmlArrayMaps.forEach((arrayMap) => {
            const observeKey = buildObserveKey(arrayMap.arrayPathParts, arrayMap.storeVar)
            const arrayHandlerMethodName = getObserveMethodName(arrayMap.arrayPathParts, arrayMap.storeVar)
            const { method, needsUnwrapHelper, needsRawStoreCache } = generateRenderItemMethod(
              arrayMap,
              imports,
              renderEventHandlers,
              eventIdCounter,
              classPath.node.body,
              tmplSetupCtx,
            )
            if (needsUnwrapHelper) needsModuleLevelUnwrapHelper = true
            if (needsRawStoreCache) needsClassLevelRawStoreField = true
            if (method) {
              classPath.node.body.body.push(method)
              applied = true
              const renderMethodName = (method.key as t.Identifier).name
              replaceInlineMapWithRenderCall(classPath, arrayMap, renderMethodName)
              const strippedInSlots = replaceMapInConditionalSlots(analysis.conditionalSlots || [], arrayMap)
              const strippedInTemplate =
                templateMethod && (analysis.conditionalSlots || []).length > 0
                  ? stripHtmlArrayMapJoinInTemplateMethod(templateMethod, arrayMap)
                  : false
              if (strippedInSlots || strippedInTemplate) {
                const currentValueExpr = arrayMap.storeVar
                  ? buildMemberChainFromParts(t.identifier(arrayMap.storeVar), arrayMap.arrayPathParts)
                  : buildMemberChainFromParts(t.thisExpression(), arrayMap.arrayPathParts)
                const initialArrayName = `__geaInitial_${arrayHandlerMethodName}`
                initialHtmlArrayRefreshOnMount.push(
                  t.variableDeclaration('const', [
                    t.variableDeclarator(t.identifier(initialArrayName), currentValueExpr),
                  ]),
                  t.ifStatement(
                    t.binaryExpression(
                      '>',
                      t.logicalExpression(
                        '||',
                        t.optionalMemberExpression(t.identifier(initialArrayName), t.identifier('length'), false, true),
                        t.numericLiteral(0),
                      ),
                      t.numericLiteral(0),
                    ),
                    t.expressionStatement(
                      t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(arrayHandlerMethodName)), [
                        t.identifier(initialArrayName),
                        t.arrayExpression([]),
                      ]),
                    ),
                  ),
                )
              }
            }

            const createResult = generateCreateItemMethod(
              arrayMap,
              getTemplatePropNames(classPath.node.body),
              getTemplateParamIdentifier(classPath.node.body),
              tmplSetupCtx,
            )
            if (createResult.method) {
              classPath.node.body.body.push(createResult.method)
            }
            if (createResult.needsRawStoreCache) needsClassLevelRawStoreField = true
            for (const f of createResult.privateFields) classLevelPrivateFields.add(f)
            const patchResult = generatePatchItemMethod(
              arrayMap,
              getTemplatePropNames(classPath.node.body),
              getTemplateParamIdentifier(classPath.node.body),
              tmplSetupCtx,
            )
            if (patchResult.method) {
              classPath.node.body.body.push(patchResult.method)
            }
            for (const f of patchResult.privateFields) classLevelPrivateFields.add(f)
            const handlersResult = generateArrayHandlers(arrayMap, arrayHandlerMethodName)
            handlersResult.methods.forEach((h) => {
              mergeObserveMethod(observeKey, h)
            })
            for (const f of handlersResult.privateFields) classLevelPrivateFields.add(f)

            // Getter-backed array maps are handled by the via-handler mechanism
            // in the addedMethods loop below — no explicit delegate needed here.

            // No constructor init needed — element lookups use querySelector
          })

          if ((analysis.conditionalSlots || []).length > 0) {
            const templatePropNames = getTemplatePropNames(classPath.node.body)
            // Use all resolved array maps (not only htmlArrayMaps): conditional-slot HTML is still
            // emitted from slot.{truthy,falsy}HtmlExpr for every store-backed list, and __geaRegisterCond
            // clones those expressions after replaceMapInConditionalSlots — segments must match any
            // .map().join("") reinjection source (see mobile-showcase GestureView).
            const htmlArrayMapLastSegments = analysis.arrayMaps.length > 0 ? analysis.arrayMaps : undefined
            generateConditionalPatchMethods(
              classPath.node.body,
              analysis.conditionalSlots!,
              templatePropNames,
              getTemplateParamIdentifier(classPath.node.body),
              analysis.earlyReturnGuard,
              htmlArrayMapLastSegments,
            )
          }

          if (htmlArrayMaps.length > 0) {
            const ensureArrayConfigsMethod = generateEnsureArrayConfigsMethod(htmlArrayMaps)
            if (ensureArrayConfigsMethod) {
              classPath.node.body.body.push(ensureArrayConfigsMethod)
            }
          }

          // When resolved array maps are inside children props, their items are
          // NOT included in the children HTML template (to avoid HTML-parser
          // foster-parenting of custom elements inside table contexts).  Generate
          // an onAfterRender that triggers the observers to populate containers
          // after the initial mount.
          if (childrenWithResolvedMap.size > 0 && htmlArrayMaps.length > 0) {
            const afterRenderCalls: t.Statement[] = []
            htmlArrayMaps.forEach((arrayMap) => {
              const methodName = getObserveMethodName(arrayMap.arrayPathParts, arrayMap.storeVar)
              let valueExpr: t.Expression
              if (arrayMap.storeVar) {
                valueExpr = t.memberExpression(
                  t.identifier(arrayMap.storeVar),
                  t.identifier(arrayMap.arrayPathParts[0]),
                )
              } else {
                valueExpr = t.memberExpression(t.thisExpression(), t.identifier(arrayMap.arrayPathParts[0]))
              }
              afterRenderCalls.push(
                t.expressionStatement(
                  t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(methodName)), [
                    valueExpr,
                    t.arrayExpression([]),
                  ]),
                ),
              )
            })
            if (afterRenderCalls.length > 0) {
              const afterRenderMethod = t.classMethod(
                'method',
                t.identifier('onAfterRender'),
                [],
                t.blockStatement([
                  t.expressionStatement(
                    t.callExpression(t.memberExpression(t.super(), t.identifier('onAfterRender')), []),
                  ),
                  ...afterRenderCalls,
                ]),
              )
              classPath.node.body.body.push(afterRenderMethod)
            }
          }

          // Component array items are now mounted by the runtime's __observeList()
          // handler — no onAfterRender/__geaRequestRender overrides needed.

          if (renderEventHandlers.length > 0) {
            applied = appendCompiledEventMethods(classPath.node.body, renderEventHandlers) || applied
          }
          if (unresolvedEventHandlers.length > 0) {
            applied = appendCompiledEventMethods(classPath.node.body, unresolvedEventHandlers) || applied
          }

          if (applied) {
            type ObserverEntry = {
              pathParts: PathParts
              methodName: string
              isVia?: boolean
              rereadExpr?: t.Expression
              dynamicKeyExpr?: t.Expression
              passValue?: boolean
            }
            const importedStores = new Map<
              string,
              {
                captureExpression: t.Expression
                observeHandlers: Map<string, ObserverEntry>
              }
            >()
            const localObserveHandlers = new Map<string, { pathParts: PathParts; methodName: string }>()

            const ensureStoreGroup = (storeVar: string) => {
              if (!importedStores.has(storeVar)) {
                const captureExpression = t.memberExpression(t.identifier(storeVar), t.identifier('__store'))
                importedStores.set(storeVar, {
                  captureExpression,
                  observeHandlers: new Map<string, ObserverEntry>(),
                })
              }
              return importedStores.get(storeVar)!
            }

            addedMethods.forEach((_method, observeKey) => {
              const { parts, storeVar } = parseObserveKey(observeKey)
              if (!storeVar) {
                if (hasOnPropChange && parts[0] === 'props') return
                if (parts.length === 1 && ownClassMethodNames.has(parts[0])) {
                  const compGetterDeps = componentGetterStoreDeps.get(parts[0])
                  if (compGetterDeps && compGetterDeps.length > 0) {
                    const originalMethodName = getObserveMethodName(parts)
                    const originalMethod = addedMethodsByName.get(originalMethodName)
                    // Inline via: register observer entries with re-read expression
                    for (const dep of compGetterDeps) {
                      const depKey = buildObserveKey(dep.pathParts, dep.storeVar) + `__getter_${parts[0]}`
                      ensureStoreGroup(dep.storeVar).observeHandlers.set(depKey, {
                        pathParts: dep.pathParts,
                        methodName: originalMethodName,
                        isVia: true,
                        rereadExpr: t.memberExpression(t.thisExpression(), t.identifier(parts[0])),
                        passValue: originalMethod ? classMethodUsesParam(originalMethod, 0) : true,
                        ...(dep.dynamicKeyExpr ? { dynamicKeyExpr: dep.dynamicKeyExpr } : {}),
                      })
                    }
                  }
                  return
                }
                localObserveHandlers.set(observeKey, { pathParts: parts, methodName: getObserveMethodName(parts) })
                return
              }
              {
                const storeRef = stateRefs.get(storeVar)
                const getterDepPaths = storeRef?.getterDeps?.get(parts[0])
                if (getterDepPaths && getterDepPaths.length > 0) {
                  const originalMethodName = getObserveMethodName(parts, storeVar)
                  const originalMethod = addedMethodsByName.get(originalMethodName)
                  // Build rereadExpr for the full path: store.getter?.sub1?.sub2...
                  // Use optional chaining after the getter so that null/undefined
                  // getter results don't throw when sub-properties are accessed.
                  let rereadExpr: t.Expression = t.memberExpression(t.identifier(storeVar), t.identifier(parts[0]))
                  for (let i = 1; i < parts.length; i++) {
                    rereadExpr = t.optionalMemberExpression(rereadExpr, t.identifier(parts[i]), false, true)
                  }
                  // Inline via: register observer entries with re-read expression
                  for (const depPath of getterDepPaths) {
                    const depKey = buildObserveKey(depPath, storeVar) + `__getter_${parts.join('_')}`
                    ensureStoreGroup(storeVar).observeHandlers.set(depKey, {
                      pathParts: depPath,
                      methodName: originalMethodName,
                      isVia: true,
                      rereadExpr,
                      passValue: originalMethod ? classMethodUsesParam(originalMethod, 0) : true,
                    })
                  }
                  return
                }
              }
              ensureStoreGroup(storeVar).observeHandlers.set(observeKey, {
                pathParts: parts,
                methodName: getObserveMethodName(parts, storeVar),
              })
            })

            // Map sync observers: resolve store getters to underlying field paths, then
            // register one handler per resolved path.  A getter like `folderEmails` may
            // depend on several sibling fields (`emails`, `activeFolder`, …); each must
            // subscribe to the same __geaSyncMap delegate.  Older logic keyed only by
            // store+delegate and kept the shortest path, which dropped sibling deps when
            // they had the same length (e.g. kept `emails` but not `activeFolder`).
            //
            // When the same delegate receives multiple observer rows where one path is a
            // strict prefix of another, the store still notifies on the shorter path for
            // nested mutations — duplicate handlers are harmless but rare here because
            // we key by full resolved path.
            const consolidatedMapSync = new Map<string, (typeof mapSyncObservers)[0]>()
            for (const obs of mapSyncObservers) {
              // Resolve getters to their underlying dep paths first
              let resolvedPaths: PathParts[] = [obs.pathParts]
              if (obs.pathParts.length === 1) {
                const storeRef = stateRefs.get(obs.storeVar)
                const getterDepPaths = storeRef?.getterDeps?.get(obs.pathParts[0])
                if (getterDepPaths && getterDepPaths.length > 0) {
                  resolvedPaths = getterDepPaths
                }
              }
              for (const rp of resolvedPaths) {
                const groupKey = `${obs.storeVar}:${obs.delegateName}:${rp.join('_')}`
                consolidatedMapSync.set(groupKey, { ...obs, pathParts: rp })
              }
            }
            for (const obs of consolidatedMapSync.values()) {
              ensureStoreGroup(obs.storeVar).observeHandlers.set(
                `__mapSync_${obs.delegateName}_${obs.pathParts.join('_')}`,
                { pathParts: obs.pathParts, methodName: obs.delegateName },
              )
            }

            for (const obs of storeComponentArrayObservers) {
              const existingObserveKey = buildObserveKey(obs.pathParts, obs.storeVar)
              const existingMethod = addedMethods.get(existingObserveKey)
              if (existingMethod && t.isBlockStatement(existingMethod.body)) {
                const alreadyCalls = existingMethod.body.body.some((stmt) => {
                  if (!t.isExpressionStatement(stmt)) return false
                  const expr = stmt.expression
                  if (!t.isCallExpression(expr) || !t.isMemberExpression(expr.callee)) return false
                  return t.isIdentifier(expr.callee.property) && expr.callee.property.name === obs.refreshMethodName
                })
                if (alreadyCalls) continue
              }
              // If the observed path is a store getter, observe its dependencies instead
              // so that mutations to the underlying data trigger the component array refresh
              if (obs.pathParts.length === 1) {
                const storeRef = stateRefs.get(obs.storeVar)
                const getterDepPaths = storeRef?.getterDeps?.get(obs.pathParts[0])
                if (getterDepPaths && getterDepPaths.length > 0) {
                  for (const depPath of getterDepPaths) {
                    const depKey = `__storeCompArray_${obs.refreshMethodName}_dep_${depPath.join('_')}`
                    ensureStoreGroup(obs.storeVar).observeHandlers.set(depKey, {
                      pathParts: depPath,
                      methodName: obs.refreshMethodName,
                    })
                  }
                  continue
                }
              }
              ensureStoreGroup(obs.storeVar).observeHandlers.set(`__storeCompArray_${obs.refreshMethodName}`, {
                pathParts: obs.pathParts,
                methodName: obs.refreshMethodName,
              })
            }

            // Inject null guards for observer methods on paths under early-return
            // guards.  When `issue` is null, observers on `["issue","type"]` etc.
            // would crash accessing `issue.type`.  Prepend `if (store.parent == null) return;`
            // so the observer silently skips — the guard-key observer will re-render.
            if (guardStateKeys.size > 0) {
              addedMethods.forEach((method, observeKey) => {
                const { parts, storeVar: sv } = parseObserveKey(observeKey)
                if (!sv) return

                if (parts.length >= 2) {
                  // Check every prefix (e.g. ["issue"] for ["issue","type"])
                  for (let prefixLen = 1; prefixLen < parts.length; prefixLen++) {
                    const prefixKey = buildObserveKey(parts.slice(0, prefixLen), sv)
                    if (guardStateKeys.has(prefixKey)) {
                      // Prepend: if (storeVar.parentProp == null) return;
                      const guardCheck = t.ifStatement(
                        t.binaryExpression(
                          '==',
                          t.memberExpression(t.identifier(sv), t.identifier(parts[prefixLen - 1])),
                          t.nullLiteral(),
                        ),
                        t.returnStatement(),
                      )
                      if (t.isBlockStatement(method.body)) {
                        method.body.body.unshift(guardCheck)
                      }
                      break // Only need the shallowest guard
                    }
                  }
                } else if (parts.length === 1) {
                  // Also guard single-segment paths that are dependencies of a
                  // guard-key getter.  E.g. when `activeEmail` is a guard key
                  // and its getter depends on `activeEmailId`, the handler for
                  // `["activeEmailId"]` may inline code that re-reads the getter
                  // (e.g. `store.activeEmail.date`).  The guard-key observer
                  // will trigger __geaRequestRender, so skipping here is safe.
                  const storeRef = stateRefs.get(sv)
                  if (storeRef?.getterDeps) {
                    for (const [getterName, depPaths] of storeRef.getterDeps) {
                      const isDepOfGetter = depPaths.some((dp) => dp.length === 1 && dp[0] === parts[0])
                      if (!isDepOfGetter) continue
                      const guardKey = buildObserveKey([getterName], sv)
                      if (!guardStateKeys.has(guardKey)) continue
                      const guardCheck = t.ifStatement(
                        t.binaryExpression(
                          '==',
                          t.memberExpression(t.identifier(sv), t.identifier(getterName)),
                          t.nullLiteral(),
                        ),
                        t.returnStatement(),
                      )
                      if (t.isBlockStatement(method.body)) {
                        method.body.body.unshift(guardCheck)
                      }
                      break
                    }
                  }
                }
              })
            }

            // Deduplicate observer methods with identical bodies.
            // When a text template references multiple store properties
            // (e.g. `${store.a} / ${store.b}`), each property gets its own
            // observer method but the bodies are identical.  Keep one
            // canonical method and redirect all subscriptions to it.
            {
              const seen = new Set<t.ClassMethod>()
              const methodEntries: Array<{ observeKey: string; method: t.ClassMethod; name: string }> = []
              addedMethods.forEach((method, observeKey) => {
                if (seen.has(method)) return
                seen.add(method)
                const name = getMethodName(method)
                if (name) methodEntries.push({ observeKey, method, name })
              })

              // Group by store + body so we only merge methods for the same store
              const bodyGroups = new Map<string, typeof methodEntries>()
              for (const entry of methodEntries) {
                const { storeVar } = parseObserveKey(entry.observeKey)
                const bodyCode = (storeVar || '') + ':' + generate(t.blockStatement(entry.method.body.body)).code
                if (!bodyGroups.has(bodyCode)) bodyGroups.set(bodyCode, [])
                bodyGroups.get(bodyCode)!.push(entry)
              }

              const renameMap = new Map<string, string>()
              for (const [, group] of bodyGroups) {
                if (group.length < 2) continue
                const canonical = group[0]
                for (let i = 1; i < group.length; i++) {
                  const dup = group[i]
                  renameMap.set(dup.name, canonical.name)
                  const idx = classPath.node.body.body.indexOf(dup.method)
                  if (idx !== -1) classPath.node.body.body.splice(idx, 1)
                }
              }

              if (renameMap.size > 0) {
                for (const [, config] of importedStores) {
                  for (const [key, entry] of config.observeHandlers) {
                    if (renameMap.has(entry.methodName)) {
                      config.observeHandlers.set(key, { ...entry, methodName: renameMap.get(entry.methodName)! })
                    }
                  }
                }
                for (const [key, entry] of localObserveHandlers) {
                  if (renameMap.has(entry.methodName)) {
                    localObserveHandlers.set(key, { ...entry, methodName: renameMap.get(entry.methodName)! })
                  }
                }
              }
            }

            // Ensure store groups exist for observeList configs so __observeList
            // calls are generated even when there are no other observe handlers
            for (const olc of observeListConfigs) {
              ensureStoreGroup(olc.storeVar)
            }

            if (
              importedStores.size > 0 ||
              localObserveHandlers.size > 0 ||
              mapRegistrations.length > 0 ||
              observeListConfigs.length > 0
            ) {
              const storeConfigs = Array.from(importedStores.entries()).map(([storeVar, config]) => ({
                storeVar,
                captureExpression: config.captureExpression,
                observeHandlers: Array.from(config.observeHandlers.values()).map(
                  ({ pathParts, methodName, isVia, rereadExpr, dynamicKeyExpr, passValue }) => ({
                    pathParts,
                    methodName,
                    isVia,
                    rereadExpr,
                    dynamicKeyExpr,
                    passValue,
                  }),
                ),
              }))

              if (storeConfigs.length > 0 || mapRegistrations.length > 0 || observeListConfigs.length > 0) {
                const createdHooksMethod = generateCreatedHooks(
                  storeConfigs,
                  htmlArrayMaps.length > 0,
                  observeListConfigs,
                )
                if (mapRegistrations.length > 0) {
                  createdHooksMethod.body.body.push(...mapRegistrations)
                }
                const generatedCreatedHooksBody = createdHooksMethod.body.body
                const existingCreatedHooks = classPath.node.body.body.find(
                  (m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'createdHooks',
                ) as t.ClassMethod | undefined
                if (existingCreatedHooks) {
                  // Prepend compiler setup so user code still runs (duplicate class methods would drop the user method).
                  existingCreatedHooks.body.body.unshift(...generatedCreatedHooksBody)
                } else {
                  classPath.node.body.body.push(createdHooksMethod)
                }
              }
              // Static array maps inside child component children need a
              // refresh call after mount to populate the DOM container.
              // Use onAfterRenderHooks (not createdHooks) because the items
              // array and DOM elements must exist before __reconcileList runs.
              if (staticArrayRefreshOnMount.length > 0 || initialHtmlArrayRefreshOnMount.length > 0) {
                const refreshStmts = [
                  ...[...new Set(staticArrayRefreshOnMount)].map((name) =>
                    t.expressionStatement(
                      t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(name)), []),
                    ),
                  ),
                  ...initialHtmlArrayRefreshOnMount,
                ]
                const existingHook = classPath.node.body.body.find(
                  (m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'onAfterRenderHooks',
                ) as t.ClassMethod | undefined
                if (existingHook) existingHook.body.body.push(...refreshStmts)
                else
                  classPath.node.body.body.push(
                    t.classMethod('method', t.identifier('onAfterRenderHooks'), [], t.blockStatement(refreshStmts)),
                  )
              }
              if (localObserveHandlers.size > 0) {
                classPath.node.body.body.push(
                  generateLocalStateObserverSetup(Array.from(localObserveHandlers.values()), htmlArrayMaps.length > 0),
                )
              }
              // Observer cleanup is handled by the parent Component.dispose(),
              // so we no longer generate a redundant ensureObserverDispose here.
            }
          }

          if (needsClassLevelRawStoreField) classLevelPrivateFields.add('__rs')
          for (const fieldName of classLevelPrivateFields) {
            const alreadyHas = classPath.node.body.body.some(
              (n) => t.isClassPrivateProperty(n) && t.isIdentifier(n.key.id) && n.key.id.name === fieldName,
            )
            if (!alreadyHas) {
              classPath.node.body.body.unshift(t.classPrivateProperty(t.privateName(t.identifier(fieldName))))
            }
          }
        },
      })
    },
  })

  if (needsModuleLevelUnwrapHelper) {
    const alreadyHas = ast.program.body.some(
      (stmt) =>
        t.isVariableDeclaration(stmt) && stmt.declarations.some((d) => t.isIdentifier(d.id) && d.id.name === '__v'),
    )
    if (!alreadyHas) {
      ast.program.body.unshift(buildValueUnwrapHelper())
    }
  }

  return applied
}

function collectUnresolvedDependencies(
  unresolvedMaps: UnresolvedMapInfo[],
  stateRefs: Map<string, StateRefMeta>,
  classBody?: t.ClassBody,
): Array<{ observeKey: string; pathParts: PathParts; storeVar?: string }> {
  const deps = new Map<string, { observeKey: string; pathParts: PathParts; storeVar?: string }>()

  unresolvedMaps.forEach((unresolvedMap) => {
    if (!unresolvedMap.computationExpr) return

    if (t.isIdentifier(unresolvedMap.computationExpr) && stateRefs.has(unresolvedMap.computationExpr.name)) {
      const ref = stateRefs.get(unresolvedMap.computationExpr.name)!
      if (ref.kind === 'imported-destructured' && ref.storeVar) {
        const storeRef = stateRefs.get(ref.storeVar)
        const getterPaths = ref.propName ? storeRef?.getterDeps?.get(ref.propName) : undefined
        if (getterPaths && getterPaths.length > 0) {
          for (const pathParts of getterPaths) {
            const observeKey = buildObserveKey(pathParts, ref.storeVar)
            if (!deps.has(observeKey)) deps.set(observeKey, { observeKey, pathParts, storeVar: ref.storeVar })
          }
        } else if (storeRef?.reactiveFields?.has(ref.propName!)) {
          const pathParts: PathParts = [ref.propName!]
          const observeKey = buildObserveKey(pathParts, ref.storeVar)
          if (!deps.has(observeKey)) deps.set(observeKey, { observeKey, pathParts, storeVar: ref.storeVar })
        } else {
          const observeKey = buildObserveKey([], ref.storeVar)
          if (!deps.has(observeKey)) deps.set(observeKey, { observeKey, pathParts: [], storeVar: ref.storeVar })
        }
        return
      }
    }

    if (collectHelperMethodDependencies(unresolvedMap.computationExpr, classBody, stateRefs, deps)) {
      return
    }
    const depExpr = resolveHelperCallExpressionForDeps(unresolvedMap.computationExpr, classBody)
    const targetExpr = depExpr || unresolvedMap.computationExpr
    const program = t.program([t.expressionStatement(t.cloneNode(targetExpr, true) as t.Expression)])
    traverse(program, {
      noScope: true,
      MemberExpression(path: NodePath<t.MemberExpression>) {
        const targetExpr =
          path.parentPath && t.isCallExpression(path.parentPath.node) && path.parentPath.node.callee === path.node
            ? path.node.object
            : path.node
        if (!t.isMemberExpression(targetExpr) && !t.isIdentifier(targetExpr)) return
        const result = resolvePath(targetExpr as t.MemberExpression | t.Identifier, stateRefs)
        if (!result?.parts?.length) return
        const observeParts = [result.parts[0]]
        const observeKey = buildObserveKey(observeParts, result.isImportedState ? result.storeVar : undefined)
        if (!deps.has(observeKey))
          deps.set(observeKey, {
            observeKey,
            pathParts: observeParts,
            storeVar: result.isImportedState ? result.storeVar : undefined,
          })
      },
    })
  })

  return Array.from(deps.values())
}

function collectHelperMethodDependencies(
  expr: t.Expression | undefined,
  classBody: t.ClassBody | undefined,
  stateRefs: Map<string, StateRefMeta>,
  deps: Map<string, { observeKey: string; pathParts: PathParts; storeVar?: string }>,
): boolean {
  if (
    !expr ||
    !t.isCallExpression(expr) ||
    !t.isMemberExpression(expr.callee) ||
    !t.isThisExpression(expr.callee.object) ||
    !t.isIdentifier(expr.callee.property) ||
    !classBody
  ) {
    return false
  }

  const helperMethodName = expr.callee.property.name

  const helperMethod = classBody.body.find(
    (node) => t.isClassMethod(node) && t.isIdentifier(node.key) && node.key.name === helperMethodName,
  ) as t.ClassMethod | undefined
  if (!helperMethod || !t.isBlockStatement(helperMethod.body)) return false

  const program = t.program(helperMethod.body.body.map((stmt) => t.cloneNode(stmt, true)))
  traverse(program, {
    noScope: true,
    MemberExpression(path: NodePath<t.MemberExpression>) {
      const resolved = resolvePath(path.node, stateRefs)
      if (!resolved?.parts?.length) return
      const observeParts = [resolved.parts[0]]
      const observeKey = buildObserveKey(observeParts, resolved.isImportedState ? resolved.storeVar : undefined)
      if (!deps.has(observeKey)) {
        deps.set(observeKey, {
          observeKey,
          pathParts: observeParts,
          storeVar: resolved.isImportedState ? resolved.storeVar : undefined,
        })
      }
    },
  })
  return deps.size > 0
}

function resolveHelperCallExpressionForDeps(
  expr: t.Expression | undefined,
  classBody?: t.ClassBody,
): t.Expression | undefined {
  if (
    !expr ||
    !t.isCallExpression(expr) ||
    !t.isMemberExpression(expr.callee) ||
    !t.isThisExpression(expr.callee.object) ||
    !t.isIdentifier(expr.callee.property) ||
    !classBody
  ) {
    return expr
  }

  const helperName = expr.callee.property.name
  const helperMethod = classBody.body.find(
    (node) => t.isClassMethod(node) && t.isIdentifier(node.key) && node.key.name === helperName,
  ) as t.ClassMethod | undefined
  if (!helperMethod || !t.isBlockStatement(helperMethod.body)) return expr

  const returnStmt = helperMethod.body.body.find((stmt) => t.isReturnStatement(stmt) && !!stmt.argument) as
    | t.ReturnStatement
    | undefined
  return returnStmt?.argument ? (t.cloneNode(returnStmt.argument, true) as t.Expression) : expr
}

function generateUnresolvedRelationalObserver(
  arrayMap: {
    arrayPathParts: PathParts
    containerSelector: string
    containerBindingId?: string
    containerUserIdExpr?: t.Expression
  },
  unresolvedMap: UnresolvedMapInfo,
  relBinding: import('./ir').UnresolvedRelationalClassBinding,
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

function getMapIndex(arrayPathParts: PathParts): number {
  const s = pathPartsToString(arrayPathParts)
  const match = s.match(/__unresolved_(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

function generateMapRegistration(
  arrayMap: {
    arrayPathParts: PathParts
    containerSelector: string
    containerBindingId?: string
    containerUserIdExpr?: t.Expression
    itemIdProperty?: string
  },
  unresolvedMap: UnresolvedMapInfo,
  templatePropNames?: Set<string>,
  wholeParamName?: string,
): t.ExpressionStatement {
  const arrayPathString = pathPartsToString(arrayMap.arrayPathParts)
  const containerName = `__${arrayPathString.replace(/\./g, '_')}_container`
  const arrayName = arrayPathString.replace(/\./g, '')
  const capName = arrayName.charAt(0).toUpperCase() + arrayName.slice(1)
  const createMethodName = `create${capName}Item`
  const mapIdx = getMapIndex(arrayMap.arrayPathParts)

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

  let arrExpr = t.cloneNode(unresolvedMap.computationExpr || t.arrayExpression([]), true) as t.Expression
  let setupStatements: t.Statement[] = unresolvedMap.computationSetupStatements?.length
    ? unresolvedMap.computationSetupStatements.map((s) => t.cloneNode(s, true))
    : []
  const needsReplace = (templatePropNames && templatePropNames.size > 0) || wholeParamName
  if (needsReplace) {
    arrExpr = replacePropRefsInExpression(arrExpr, templatePropNames || new Set(), wholeParamName)
    if (setupStatements.length) {
      setupStatements = replacePropRefsInStatements(setupStatements, templatePropNames || new Set(), wholeParamName)
    }
  }

  const prunedSetup = pruneUnusedSetupStatements(setupStatements, arrExpr)
  const getItemsBody: t.Statement[] = [...prunedSetup, t.returnStatement(arrExpr)]

  const registerArgs: t.Expression[] = [
    t.numericLiteral(mapIdx),
    t.stringLiteral(containerName),
    t.arrowFunctionExpression([], containerLookup),
    t.arrowFunctionExpression([], t.blockStatement(getItemsBody)),
    t.arrowFunctionExpression(
      unresolvedMap.indexVariable ? [t.identifier('__item'), t.identifier('__idx')] : [t.identifier('__item')],
      t.callExpression(
        t.memberExpression(t.thisExpression(), t.identifier(createMethodName)),
        unresolvedMap.indexVariable ? [t.identifier('__item'), t.identifier('__idx')] : [t.identifier('__item')],
      ),
    ),
  ]

  if (unresolvedMap.keyExpression) {
    // Complex key expression (e.g. template literal) — pass a key function
    const keyExpr = t.cloneNode(unresolvedMap.keyExpression, true)
    // Rewrite item variable (and index variable if present) for the key function parameters
    const itemVar = unresolvedMap.itemVariable
    const idxVar = unresolvedMap.indexVariable
    traverse(t.program([t.expressionStatement(keyExpr)]), {
      noScope: true,
      Identifier(path: NodePath<t.Identifier>) {
        if (path.node.name === itemVar) path.node.name = '__k'
        else if (idxVar && path.node.name === idxVar) path.node.name = '__ki'
      },
    })
    const keyFnParams = idxVar ? [t.identifier('__k'), t.identifier('__ki')] : [t.identifier('__k')]
    registerArgs.push(t.arrowFunctionExpression(keyFnParams, t.callExpression(t.identifier('String'), [keyExpr])))
  } else if (arrayMap.itemIdProperty && arrayMap.itemIdProperty !== ITEM_IS_KEY) {
    registerArgs.push(t.stringLiteral(arrayMap.itemIdProperty))
  }

  return t.expressionStatement(
    t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__geaRegisterMap')), registerArgs),
  )
}

function collectFreeIdentifiers(nodes: t.Node[]): Set<string> {
  const names = new Set<string>()
  for (const node of nodes) {
    traverse(
      t.isProgram(node) ? node : t.program([t.isStatement(node) ? node : t.expressionStatement(node as t.Expression)]),
      {
        noScope: true,
        Identifier(path: NodePath<t.Identifier>) {
          if (t.isMemberExpression(path.parent) && path.parent.property === path.node && !path.parent.computed) {
            return
          }
          if (t.isObjectProperty(path.parent) && (path.parent.key === path.node || path.parent.value === path.node)) {
            if (path.parentPath && t.isObjectPattern(path.parentPath.parent)) return
          }
          if (t.isVariableDeclarator(path.parent) && path.parent.id === path.node) return
          names.add(path.node.name)
        },
      },
    )
  }
  return names
}

function pruneUnusedSetupStatements(stmts: t.Statement[], usedExpr: t.Expression): t.Statement[] {
  let result = [...stmts]
  let changed = true
  while (changed) {
    changed = false
    const usedNames = collectFreeIdentifiers([...result.map((s) => t.cloneNode(s, true)), t.cloneNode(usedExpr, true)])
    const nextResult: t.Statement[] = []
    for (const stmt of result) {
      if (!t.isVariableDeclaration(stmt)) {
        nextResult.push(stmt)
        continue
      }
      const decl = stmt.declarations[0]
      if (!decl) {
        nextResult.push(stmt)
        continue
      }
      const declaredNames = new Set<string>()
      if (t.isIdentifier(decl.id)) {
        declaredNames.add(decl.id.name)
      } else if (t.isObjectPattern(decl.id)) {
        for (const prop of decl.id.properties) {
          if (t.isObjectProperty(prop) && t.isIdentifier(prop.value)) declaredNames.add(prop.value.name)
          else if (t.isRestElement(prop) && t.isIdentifier(prop.argument)) declaredNames.add(prop.argument.name)
        }
      }
      if (declaredNames.size === 0 || [...declaredNames].some((n) => usedNames.has(n))) {
        nextResult.push(stmt)
      } else {
        changed = true
      }
    }
    result = nextResult
  }
  return result
}

function lazyInit(name: string, value: t.Expression): t.Statement {
  return t.ifStatement(
    t.unaryExpression('!', t.memberExpression(t.thisExpression(), t.identifier(name))),
    t.expressionStatement(
      t.assignmentExpression('=', t.memberExpression(t.thisExpression(), t.identifier(name)), value),
    ),
  )
}

function getArrayPropNameFromExpr(expr: t.Expression): string | null {
  if (t.isIdentifier(expr)) return expr.name
  if (t.isMemberExpression(expr) && t.isIdentifier(expr.property)) return expr.property.name
  return null
}

function replaceMapWithComponentArrayItems(
  templateMethod: t.ClassMethod,
  arrayExpr: t.Expression | undefined,
  itemsName: string,
  opts?: { slotBranch?: boolean },
): boolean {
  if (!arrayExpr || !t.isBlockStatement(templateMethod.body)) return false
  const tempProg = t.program([
    t.expressionStatement(t.arrowFunctionExpression(templateMethod.params as t.Identifier[], templateMethod.body)),
  ])
  let replaced = false
  traverse(tempProg, {
    noScope: true,
    CallExpression(path: NodePath<t.CallExpression>) {
      if (replaced) return
      if (!t.isMemberExpression(path.node.callee)) return
      const prop = path.node.callee.property
      const mapObj = path.node.callee.object
      if (!t.isIdentifier(prop) || prop.name !== 'map') return

      const matches =
        (t.isIdentifier(arrayExpr) && t.isIdentifier(mapObj) && mapObj.name === arrayExpr.name) ||
        (t.isMemberExpression(arrayExpr) &&
          t.isMemberExpression(mapObj) &&
          t.isIdentifier(arrayExpr.property) &&
          t.isIdentifier(mapObj.property) &&
          arrayExpr.property.name === mapObj.property.name) ||
        // Handle destructured case: `const { columns } = store; columns.map(...)`
        (t.isMemberExpression(arrayExpr) &&
          t.isIdentifier(mapObj) &&
          t.isIdentifier(arrayExpr.property) &&
          mapObj.name === arrayExpr.property.name)
      if (!matches) return

      let toReplace: NodePath<t.Node> = path
      if (
        path.parentPath?.isMemberExpression() &&
        t.isIdentifier(path.parentPath.node.property) &&
        path.parentPath.node.property.name === 'join' &&
        path.parentPath.parentPath?.isCallExpression()
      ) {
        toReplace = path.parentPath.parentPath as NodePath<t.CallExpression>
      }

      // Main template: join pre-built instances. Conditional-slot branch: empty —
      // __geaPatchCond reinjects slot HTML; join would duplicate __observeList rows
      // (examples/email-client Sent → label → Inbox).
      const replacement = opts?.slotBranch
        ? t.stringLiteral('')
        : t.callExpression(
            t.memberExpression(t.memberExpression(t.thisExpression(), t.identifier(itemsName)), t.identifier('join')),
            [t.stringLiteral('')],
          )
      toReplace.replaceWith(replacement)
      replaced = true
    },
  })
  return replaced
}

/** Conditional-slot branches are separate AST fragments; rewrite `.map()` there too. */
function replaceMapWithComponentArrayItemsInConditionalSlots(
  slots: import('./ir').ConditionalSlot[],
  arrayExpr: t.Expression | undefined,
  itemsName: string,
): void {
  if (!arrayExpr || slots.length === 0) return
  for (const slot of slots) {
    for (const key of ['truthyHtmlExpr', 'falsyHtmlExpr'] as const) {
      const expr = slot[key]
      if (!expr) continue
      const fakeMethod = t.classMethod(
        'method',
        t.identifier('__tmpSlotMapReplace'),
        [t.identifier('__p')],
        t.blockStatement([t.returnStatement(t.cloneNode(expr, true))]),
      )
      replaceMapWithComponentArrayItems(fakeMethod, arrayExpr, itemsName, { slotBranch: true })
      const ret = fakeMethod.body.body[0]
      if (t.isReturnStatement(ret) && ret.argument) {
        slot[key] = ret.argument
      }
    }
  }
}

function inlineIntoConstructor(classBody: t.ClassBody, statements: t.Statement[]): void {
  let ctor = classBody.body.find(
    (member) => t.isClassMethod(member) && t.isIdentifier(member.key) && member.key.name === 'constructor',
  ) as t.ClassMethod | undefined

  if (!ctor) {
    ctor = appendToBody(
      jsMethod`${id('constructor')}(...args) {}`,
      t.expressionStatement(t.callExpression(t.super(), [t.spreadElement(t.identifier('args'))])),
      ...statements,
    )
    classBody.body.unshift(ctor)
    return
  }

  ctor.body.body.push(...statements)
}

function ensureDisposeCalls(classBody: t.ClassBody, targets: string[]): void {
  const disposeStatements = targets.map(
    (target) => js`this.${id(target)}?.forEach?.(item => item?.dispose?.());` as t.ExpressionStatement,
  )

  const existingDispose = classBody.body.find(
    (member) => t.isClassMethod(member) && t.isIdentifier(member.key) && member.key.name === 'dispose',
  ) as t.ClassMethod | undefined

  if (existingDispose) {
    existingDispose.body.body.unshift(...disposeStatements)
    return
  }

  classBody.body.push(
    appendToBody(jsMethod`${id('dispose')}() {}`, ...disposeStatements, js`super.dispose();` as t.ExpressionStatement),
  )
}

function ensureOnPropChangeMethod(
  classBody: t.ClassBody,
  inlinePatchBodies: Map<string, t.Statement[]>,
  compiledChildren: import('./ir').ChildComponent[],
  arrayRefreshDeps: Array<{ methodName: string; propNames: string[] }>,
  conditionalSlots: import('./ir').ConditionalSlot[] = [],
  unresolvedMapPropRefreshDeps: Array<{ mapIdx: number; propNames: string[] }> = [],
): void {
  const existing = classBody.body.find(
    (member) => t.isClassMethod(member) && t.isIdentifier(member.key) && member.key.name === '__onPropChange',
  ) as t.ClassMethod | undefined
  if (existing) return

  const directForwardCalls: t.Statement[] = []
  const nonDirectChildren: typeof compiledChildren = []
  for (const child of compiledChildren) {
    if (childHasNoProps(child)) continue
    if (child.directMappings && child.directMappings.length > 0) {
      const allSameName = child.directMappings.every((m) => m.parentPropName === m.childPropName)
      const guard = child.directMappings.reduce<t.Expression>((acc, m) => {
        const test = t.binaryExpression('===', t.identifier('key'), t.stringLiteral(m.parentPropName))
        return acc ? t.logicalExpression('||', acc, test) : test
      }, undefined!)

      if (allSameName) {
        directForwardCalls.push(
          t.ifStatement(
            guard,
            t.expressionStatement(
              t.callExpression(
                t.memberExpression(
                  t.memberExpression(t.thisExpression(), t.identifier(child.instanceVar)),
                  t.identifier('__geaUpdateProps'),
                ),
                [t.objectExpression([t.objectProperty(t.identifier('key'), t.identifier('value'), true)])],
              ),
            ),
          ),
        )
      } else {
        for (const m of child.directMappings) {
          directForwardCalls.push(
            t.ifStatement(
              t.binaryExpression('===', t.identifier('key'), t.stringLiteral(m.parentPropName)),
              t.expressionStatement(
                t.callExpression(
                  t.memberExpression(
                    t.memberExpression(t.thisExpression(), t.identifier(child.instanceVar)),
                    t.identifier('__geaUpdateProps'),
                  ),
                  [t.objectExpression([t.objectProperty(t.identifier(m.childPropName), t.identifier('value'))])],
                ),
              ),
            ),
          )
        }
      }
    } else {
      nonDirectChildren.push(child)
    }
  }

  const childRefreshEntries = nonDirectChildren
    .filter((child) => child.dependencies.some((dep) => !dep.storeVar && dep.pathParts[0] === 'props'))
    .map((child) => {
      const depProps = new Set<string>()
      for (const dep of child.dependencies) {
        if (!dep.storeVar && dep.pathParts[0] === 'props' && dep.pathParts.length > 1) {
          depProps.add(dep.pathParts[1])
        }
      }
      return { child, depProps }
    })
  const arrayRefreshMethodNames = arrayRefreshDeps.filter((d) => d.propNames.length > 0).map((d) => d.methodName)

  const refreshPropDeps = new Map<string, Set<string>>()
  for (const { methodName, propNames } of arrayRefreshDeps) {
    if (propNames.length > 0) {
      refreshPropDeps.set(methodName, new Set(propNames))
    }
  }

  const childRefreshCalls: t.Statement[] = childRefreshEntries.map(({ child, depProps }) => {
    const call = t.expressionStatement(
      t.callExpression(
        t.memberExpression(
          t.memberExpression(t.thisExpression(), t.identifier(child.instanceVar)),
          t.identifier('__geaUpdateProps'),
        ),
        [
          t.callExpression(
            t.memberExpression(t.thisExpression(), t.identifier(`__buildProps_${child.instanceVar.replace(/^_/, '')}`)),
            [],
          ),
        ],
      ),
    )
    if (depProps.size > 0) {
      const guard = Array.from(depProps).reduce<t.Expression>((acc, prop) => {
        const test = t.binaryExpression('===', t.identifier('key'), t.stringLiteral(prop))
        return acc ? t.logicalExpression('||', acc, test) : test
      }, undefined!)
      return t.ifStatement(guard, call)
    }
    return call
  })

  const arrayRefreshCalls: t.Statement[] = arrayRefreshMethodNames.map((name) => {
    const deps = refreshPropDeps.get(name)
    const call = t.expressionStatement(t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(name)), []))
    if (deps && deps.size > 0) {
      const guard = Array.from(deps).reduce<t.Expression>((acc, prop) => {
        const test = t.binaryExpression('===', t.identifier('key'), t.stringLiteral(prop))
        return acc ? t.logicalExpression('||', acc, test) : test
      }, undefined!)
      return t.ifStatement(guard, call)
    }
    return call
  })

  const refreshCalls: t.Statement[] = [...childRefreshCalls, ...arrayRefreshCalls]

  const condPatchCalls: t.Statement[] = []
  if (conditionalSlots.length > 0) {
    for (let i = 0; i < conditionalSlots.length; i++) {
      const slot = conditionalSlots[i]
      const call = t.expressionStatement(
        t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__geaPatchCond')), [t.numericLiteral(i)]),
      )
      if (slot.dependentPropNames.length > 0) {
        const guard = slot.dependentPropNames.reduce<t.Expression>((acc, prop) => {
          const test = t.binaryExpression('===', t.identifier('key'), t.stringLiteral(prop))
          return acc ? t.logicalExpression('||', acc, test) : test
        }, undefined!)
        condPatchCalls.push(t.ifStatement(guard, call))
      } else {
        condPatchCalls.push(call)
      }
    }
  }

  const patchCalls = Array.from(inlinePatchBodies.entries()).map(([propName, bodyStmts]) =>
    t.ifStatement(
      t.binaryExpression('===', t.identifier('key'), t.stringLiteral(propName)),
      t.blockStatement(bodyStmts.map((s) => t.cloneNode(s, true) as t.Statement)),
    ),
  )

  const unresolvedMapRefreshCalls: t.Statement[] = unresolvedMapPropRefreshDeps.map((dep) => {
    const call = t.expressionStatement(
      t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__geaSyncMap')), [
        t.numericLiteral(dep.mapIdx),
      ]),
    )
    if (dep.propNames.length > 0) {
      const guard = dep.propNames.reduce<t.Expression>((acc, prop) => {
        const test = t.binaryExpression('===', t.identifier('key'), t.stringLiteral(prop))
        return acc ? t.logicalExpression('||', acc, test) : test
      }, undefined!)
      return t.ifStatement(guard, call)
    }
    return call
  })

  const allKeyGuarded: t.Statement[] = [
    ...directForwardCalls,
    ...refreshCalls,
    ...patchCalls,
    ...condPatchCalls,
    ...unresolvedMapRefreshCalls,
  ]

  if (allKeyGuarded.length === 0) return

  const merged = mergeKeyGuards(allKeyGuarded)

  classBody.body.push(appendToBody(jsMethod`${id('__onPropChange')}(key, value) {}`, ...merged))
}

function serializeKeyGuard(test: t.Expression): string | null {
  if (
    t.isBinaryExpression(test) &&
    test.operator === '===' &&
    t.isIdentifier(test.left, { name: 'key' }) &&
    t.isStringLiteral(test.right)
  ) {
    return test.right.value
  }
  if (t.isLogicalExpression(test) && test.operator === '||') {
    const parts: string[] = []
    const collect = (node: t.Expression): boolean => {
      if (t.isLogicalExpression(node) && node.operator === '||') {
        return collect(node.left) && collect(node.right)
      }
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

function mergeKeyGuards(stmts: t.Statement[]): t.Statement[] {
  const groups = new Map<string, { test: t.Expression; body: t.Statement[] }>()
  const order: string[] = []
  const nonGuarded: { idx: number; stmt: t.Statement }[] = []

  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i]
    if (t.isIfStatement(stmt) && !stmt.alternate) {
      const key = serializeKeyGuard(stmt.test)
      if (key != null) {
        if (!groups.has(key)) {
          groups.set(key, { test: stmt.test, body: [] })
          order.push(key)
        }
        const g = groups.get(key)!
        if (t.isBlockStatement(stmt.consequent)) {
          g.body.push(...stmt.consequent.body)
        } else {
          g.body.push(stmt.consequent)
        }
        continue
      }
    }
    nonGuarded.push({ idx: i, stmt })
  }

  const result: t.Statement[] = []
  let orderIdx = 0
  const emittedGroups = new Set<string>()
  for (let i = 0; i < stmts.length; i++) {
    const ng = nonGuarded.find((n) => n.idx === i)
    if (ng) {
      result.push(ng.stmt)
      continue
    }
    if (orderIdx < order.length) {
      const key = order[orderIdx]
      if (!emittedGroups.has(key)) {
        const g = groups.get(key)!
        emittedGroups.add(key)
        result.push(t.ifStatement(g.test, g.body.length === 1 ? g.body[0] : t.blockStatement(g.body)))
      }
      const stmt = stmts[i]
      if (t.isIfStatement(stmt) && !stmt.alternate) {
        const sk = serializeKeyGuard(stmt.test)
        if (sk === key && emittedGroups.has(key)) {
          continue
        }
        if (sk != null && sk !== key) {
          orderIdx++
          if (!emittedGroups.has(sk)) {
            const g2 = groups.get(sk)!
            emittedGroups.add(sk)
            result.push(t.ifStatement(g2.test, g2.body.length === 1 ? g2.body[0] : t.blockStatement(g2.body)))
          }
          continue
        }
      }
    }
  }

  for (; orderIdx < order.length; orderIdx++) {
    const key = order[orderIdx]
    if (!emittedGroups.has(key)) {
      const g = groups.get(key)!
      emittedGroups.add(key)
      result.push(t.ifStatement(g.test, g.body.length === 1 ? g.body[0] : t.blockStatement(g.body)))
    }
  }

  return result
}

function generateConditionalPatchMethods(
  classBody: t.ClassBody,
  slots: import('./ir').ConditionalSlot[],
  templatePropNames: Set<string>,
  wholeParamName?: string,
  earlyReturnGuard?: t.Expression,
  /** Strip store-backed `.map().join('')` from cloned slot HTML so __geaRegisterCond matches template() (list DOM is __applyListChanges only). */
  htmlArrayMapsToStrip?: Pick<ArrayMapBinding, 'arrayPathParts' | 'storeVar'>[],
): void {
  const guardedRoot = earlyReturnGuard ? earlyReturnFalsyBindingName(earlyReturnGuard) : null
  const maybeOptStmts = (stmts: t.Statement[]) =>
    guardedRoot ? optionalizeBindingRootInStatements(stmts, guardedRoot) : stmts
  const maybeOptExpr = (e: t.Expression) => (guardedRoot ? optionalizeMemberChainsFromBindingRoot(e, guardedRoot) : e)
  const collectDeduped = (stmts: t.Statement[], seen: Set<string>, out: t.Statement[]) => {
    for (const stmt of stmts) {
      if (t.isVariableDeclaration(stmt)) {
        const decl = stmt.declarations[0]
        if (t.isIdentifier(decl.id)) {
          if (!seen.has(decl.id.name)) {
            seen.add(decl.id.name)
            out.push(stmt)
          }
        } else if (t.isObjectPattern(decl.id)) {
          const names = decl.id.properties
            .map((p) => (t.isObjectProperty(p) && t.isIdentifier(p.value) ? p.value.name : null))
            .filter(Boolean) as string[]
          const unseen = names.filter((n) => !seen.has(n))
          if (unseen.length === 0) continue
          const unseenSet = new Set(unseen)
          const filteredProps = decl.id.properties.filter(
            (p) => t.isObjectProperty(p) && t.isIdentifier(p.value) && unseenSet.has(p.value.name),
          )
          if (filteredProps.length === 0) continue
          unseen.forEach((n) => seen.add(n))
          if (filteredProps.length === decl.id.properties.length) {
            out.push(stmt)
          } else if (
            decl.init &&
            t.isMemberExpression(decl.init) &&
            t.isThisExpression(decl.init.object) &&
            t.isIdentifier(decl.init.property, { name: 'props' })
          ) {
            out.push(
              t.variableDeclaration(stmt.kind, [
                t.variableDeclarator(
                  t.objectPattern(filteredProps.map((p) => t.cloneNode(p, true) as t.ObjectProperty)),
                  t.cloneNode(decl.init, true) as t.Expression,
                ),
              ]),
            )
          } else {
            out.push(stmt)
          }
        } else {
          out.push(stmt)
        }
      } else {
        out.push(stmt)
      }
    }
  }
  const seenVarNames = new Set<string>()
  const allSetupStatements: t.Statement[] = []
  for (const slot of slots) {
    collectDeduped(slot.setupStatements, seenVarNames, allSetupStatements)
  }
  const seenHtmlVarNames = new Set<string>()
  const allHtmlSetupStatements: t.Statement[] = []
  for (const slot of slots) {
    collectDeduped(slot.htmlSetupStatements || slot.setupStatements, seenHtmlVarNames, allHtmlSetupStatements)
  }

  const rpExpr = (e: t.Expression) => replacePropRefsInExpression(e, templatePropNames, wholeParamName)
  const rpStmts = (s: t.Statement[]) => replacePropRefsInStatements(s, templatePropNames, wholeParamName)

  const rewrittenCondExprs = slots.map((s) => rpExpr(t.cloneNode(s.conditionExpr, true)))
  const rewrittenCondExprsSafe = rewrittenCondExprs.map((e) => maybeOptExpr(e))
  const initSetup = maybeOptStmts(
    pruneDeadParamDestructuring(
      rpStmts(allSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement)),
      rewrittenCondExprs,
    ),
  )
  const condAssignments: t.Statement[] = []
  for (let i = 0; i < slots.length; i++) {
    condAssignments.push(
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(t.thisExpression(), t.identifier(`__geaCond_${i}`)),
          t.unaryExpression('!', t.unaryExpression('!', rewrittenCondExprsSafe[i])),
        ),
      ),
    )
  }

  const registerCondCalls: t.Statement[] = []
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]
    const rewrittenCondExpr = rpExpr(t.cloneNode(slot.conditionExpr, true))
    const condSetup = maybeOptStmts(
      pruneDeadParamDestructuring(rpStmts(allSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement)), [
        rewrittenCondExpr,
      ]),
    )

    const getCondBody: t.Statement[] = [...condSetup, t.returnStatement(maybeOptExpr(rewrittenCondExpr))]

    const buildHtmlFn = (htmlExpr?: t.Expression): t.Expression => {
      if (!htmlExpr) return t.nullLiteral()
      // Wrap in a statement so strip's replaceWith() attaches the new root to the tree; a bare
      // Expression reference would stay pointed at the detached old join node (slot HTML + registerCond).
      const htmlStmt = t.expressionStatement(rpExpr(t.cloneNode(htmlExpr, true)))
      if (htmlArrayMapsToStrip) {
        for (const arrayMap of htmlArrayMapsToStrip) {
          stripHtmlArrayMapJoinChainsInAst(htmlStmt, arrayMap)
        }
      }
      const clonedHtmlExpr = htmlStmt.expression
      const htmlSetup = maybeOptStmts(
        pruneDeadParamDestructuring(rpStmts(allHtmlSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement)), [
          clonedHtmlExpr,
        ]),
      )
      const htmlExprSafe = maybeOptExpr(clonedHtmlExpr)
      if (htmlSetup.length > 0) {
        return t.arrowFunctionExpression([], t.blockStatement([...htmlSetup, t.returnStatement(htmlExprSafe)]))
      }
      return t.arrowFunctionExpression([], htmlExprSafe)
    }

    registerCondCalls.push(
      t.expressionStatement(
        t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__geaRegisterCond')), [
          t.numericLiteral(i),
          t.stringLiteral(slot.slotId),
          t.arrowFunctionExpression([], t.blockStatement(getCondBody)),
          buildHtmlFn(slot.truthyHtmlExpr),
          buildHtmlFn(slot.falsyHtmlExpr),
        ]),
      ),
    )
  }

  const evalStatements = [...initSetup, ...condAssignments]
  const initBody: t.Statement[] =
    evalStatements.length > 0 ? [...evalStatements, ...registerCondCalls] : registerCondCalls

  inlineIntoConstructor(classBody, initBody)
}

function getTemplatePropNames(classBody: t.ClassBody): Set<string> {
  const names = new Set<string>()
  const templateMethod = classBody.body.find(
    (m): m is t.ClassMethod => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'template',
  )
  const binding = templateMethod ? getTemplateParamBinding(templateMethod.params[0]) : undefined
  if (binding && t.isObjectPattern(binding)) {
    binding.properties.forEach((p) => {
      if (t.isObjectProperty(p) && t.isIdentifier(p.key)) names.add(p.key.name)
    })
  }
  return names
}

function getTemplateParamIdentifier(classBody: t.ClassBody): string | undefined {
  const templateMethod = classBody.body.find(
    (m): m is t.ClassMethod => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'template',
  )
  const binding = templateMethod ? getTemplateParamBinding(templateMethod.params[0]) : undefined
  return t.isIdentifier(binding) ? binding.name : undefined
}

/** True if expression is a call to a property whose value is an arrow function
 *  containing JSX in the class body (render prop pattern). */
function expressionCallsJSXReturningClassProp(expr: t.Expression, classBody: t.ClassBody): boolean {
  if (!t.isCallExpression(expr)) return false
  let propName: string | undefined
  if (t.isMemberExpression(expr.callee) && t.isIdentifier(expr.callee.property) && !expr.callee.computed) {
    propName = expr.callee.property.name
  }
  if (!propName) return false
  const scanValue = (node: t.Node): boolean => {
    if (t.isObjectExpression(node)) {
      for (const prop of node.properties) {
        if (
          t.isObjectProperty(prop) &&
          t.isIdentifier(prop.key) &&
          prop.key.name === propName &&
          (t.isArrowFunctionExpression(prop.value) || t.isFunctionExpression(prop.value))
        ) {
          let found = false
          const check = (n: t.Node): void => {
            if (found) return
            if (t.isJSXElement(n) || t.isJSXFragment(n)) {
              found = true
              return
            }
            for (const key of t.VISITOR_KEYS[n.type] || []) {
              const child = (n as any)[key]
              if (Array.isArray(child)) child.forEach((c: any) => c && typeof c === 'object' && 'type' in c && check(c))
              else if (child && typeof child === 'object' && 'type' in child) check(child)
              if (found) return
            }
          }
          check(prop.value)
          return found
        }
      }
    }
    if (t.isArrayExpression(node)) return node.elements.some((el) => el != null && scanValue(el))
    return false
  }
  for (const member of classBody.body) {
    if (t.isClassProperty(member) && member.value && scanValue(member.value)) return true
  }
  return false
}

/** Collect template prop names referenced in an array item template (for __onPropChange handledPropNames). */
function collectPropNamesFromItemTemplate(
  itemTemplate: t.JSXElement | t.JSXFragment | null | undefined,
  templatePropNames: Set<string>,
): string[] {
  if (!itemTemplate) return []
  const used = new Set<string>()
  traverse(itemTemplate, {
    noScope: true,
    Identifier(path: NodePath<t.Identifier>) {
      if (templatePropNames.has(path.node.name)) used.add(path.node.name)
    },
  })
  return Array.from(used)
}

/** Get the variable name in scope for a prop (handles { options } vs { options: n }) */
function getTemplatePropVarName(templateMethod: t.ClassMethod, propName: string): string {
  const pattern = getTemplateParamBinding(templateMethod.params[0])
  if (!pattern || !t.isObjectPattern(pattern)) return propName
  for (const p of pattern.properties) {
    if (!t.isObjectProperty(p)) continue
    const key = t.isIdentifier(p.key) ? p.key.name : t.isStringLiteral(p.key) ? p.key.value : null
    if (key !== propName) continue
    const value = p.value
    if (t.isIdentifier(value)) return value.name
    return propName
  }
  return propName
}

function findRootTemplateLiteral(node: t.Expression | t.BlockStatement): t.TemplateLiteral | null {
  if (t.isTemplateLiteral(node)) return node
  if (t.isConditionalExpression(node))
    return findRootTemplateLiteral(node.consequent) || findRootTemplateLiteral(node.alternate)
  if (t.isLogicalExpression(node)) return findRootTemplateLiteral(node.right)
  if (t.isParenthesizedExpression(node)) return findRootTemplateLiteral(node.expression)
  if (t.isBlockStatement(node)) {
    const ret = node.body.find((s): s is t.ReturnStatement => t.isReturnStatement(s))
    if (ret?.argument) return findRootTemplateLiteral(ret.argument)
  }
  return null
}

/** Inject data-gea-event into template inline .map() roots.
 *  data-gea-item-id is no longer a DOM attribute; it's set as __geaKey JS property in createDataItem.
 *  Never inject data-gea-event on Gea component tags (e.g. <sheet-cell>): handlers live on the
 *  child's root (#id). Injecting a token on the placeholder desynced from the `events` map. */
function injectMapItemAttrsIntoTemplate(
  templateMethod: t.ClassMethod,
  mapInfos: Array<{
    itemVariable: string
    itemIdProperty?: string
    keyExpression?: t.Expression
    containerBindingId?: string
    eventToken?: string
  }>,
): void {
  if (mapInfos.length === 0) return
  const infoQueueByVar = new Map<string, typeof mapInfos>()
  for (const info of mapInfos) {
    if (!infoQueueByVar.has(info.itemVariable)) infoQueueByVar.set(info.itemVariable, [])
    infoQueueByVar.get(info.itemVariable)!.push(info)
  }
  const tempProg = t.program([
    t.expressionStatement(t.arrowFunctionExpression(templateMethod.params as t.Identifier[], templateMethod.body)),
  ])
  traverse(tempProg, {
    noScope: true,
    CallExpression(path: NodePath<t.CallExpression>) {
      if (!t.isMemberExpression(path.node.callee)) return
      if (!t.isIdentifier(path.node.callee.property) || path.node.callee.property.name !== 'map') return
      const fn = path.node.arguments[0]
      if (!t.isArrowFunctionExpression(fn)) return
      const paramName = t.isIdentifier(fn.params[0]) ? fn.params[0].name : null
      if (!paramName) return
      const info = infoQueueByVar.get(paramName)?.shift()
      if (!info) return

      const rootTL = findRootTemplateLiteral(t.isBlockStatement(fn.body) ? fn.body : fn.body)
      if (!rootTL) return

      // Strip any leftover data-gea-item-id from the template literal (defensive)
      for (let qi = 0; qi < rootTL.quasis.length; qi++) {
        const raw = rootTL.quasis[qi].value.raw
        const attrIdx = raw.indexOf(' data-gea-item-id="')
        if (attrIdx === -1) continue
        const before = raw.substring(0, attrIdx)
        const nextRaw = rootTL.quasis[qi + 1]?.value.raw
        if (nextRaw !== undefined && nextRaw.startsWith('"')) {
          const after = nextRaw.substring(1)
          rootTL.quasis[qi] = t.templateElement(
            { raw: before + after, cooked: before + after },
            rootTL.quasis[qi + 1].tail,
          )
          rootTL.quasis.splice(qi + 1, 1)
          rootTL.expressions.splice(qi, 1)
        }
        break
      }

      const first = rootTL.quasis[0].value.raw
      const tagMatch = first.match(/^(<[\w-]+)/)
      if (!tagMatch) return
      const tagPart = tagMatch[1]
      const remainder = first.substring(tagPart.length)
      const tagName = tagPart.slice(1).toLowerCase()
      const isIntrinsicRoot = !tagName.includes('-')
      const eventAttr = info.eventToken && isIntrinsicRoot ? ` data-gea-event="${info.eventToken}"` : ''

      const itemIdExpr = info.keyExpression
        ? t.callExpression(t.identifier('String'), [t.cloneNode(info.keyExpression, true)])
        : info.itemIdProperty && info.itemIdProperty !== ITEM_IS_KEY
          ? t.logicalExpression(
              '??',
              buildOptionalMemberChain(t.identifier(info.itemVariable), info.itemIdProperty),
              t.identifier(info.itemVariable),
            )
          : t.callExpression(t.identifier('String'), [t.identifier(info.itemVariable)])

      {
        rootTL.quasis = [
          t.templateElement({ raw: `${tagPart} data-gea-item-id="`, cooked: `${tagPart} data-gea-item-id="` }),
          t.templateElement(
            { raw: `"${eventAttr}${remainder}`, cooked: `"${eventAttr}${remainder}` },
            rootTL.quasis[0].tail,
          ),
          ...rootTL.quasis.slice(1),
        ]
        rootTL.expressions = [itemIdExpr, ...rootTL.expressions]
      }
    },
  })
}

/** Add .join('') to map calls for unresolved maps to prevent Array.toString() commas in output.
 *  Resolved array maps get .join('') from replaceInlineMapWithRenderCall; unresolved maps need it here. */
function addJoinToUnresolvedMapCalls(templateMethod: t.ClassMethod, _unresolvedMaps: UnresolvedMapInfo[]): void {
  const tempProg = t.program([
    t.expressionStatement(t.arrowFunctionExpression(templateMethod.params as t.Identifier[], templateMethod.body)),
  ])

  traverse(tempProg, {
    noScope: true,
    CallExpression(path: NodePath<t.CallExpression>) {
      if (!t.isMemberExpression(path.node.callee)) return
      if (!t.isIdentifier(path.node.callee.property) || path.node.callee.property.name !== 'map') return
      if (!path.node.arguments[0] || !t.isArrowFunctionExpression(path.node.arguments[0])) return

      const alreadyHasJoin =
        path.parentPath?.isMemberExpression() &&
        t.isIdentifier(path.parentPath.node.property) &&
        path.parentPath.node.property.name === 'join' &&
        path.parentPath.parentPath?.isCallExpression()

      if (alreadyHasJoin) {
        const joinCall = path.parentPath!.parentPath as NodePath<t.CallExpression>
        const replacement = t.binaryExpression('+', t.cloneNode(joinCall.node, true), t.stringLiteral('<!---->'))
        joinCall.replaceWith(replacement)
        joinCall.skip()
        return
      }

      path.replaceWith(
        t.binaryExpression(
          '+',
          t.callExpression(t.memberExpression(path.node, t.identifier('join')), [t.stringLiteral('')]),
          t.stringLiteral('<!---->'),
        ),
      )
    },
  })
}

function replaceInlineMapWithRenderCall(
  classPath: NodePath<t.ClassDeclaration>,
  arrayMap: { arrayPathParts: PathParts; itemVariable: string; indexVariable?: string },
  renderMethodName: string,
) {
  const templateMethod = classPath.node.body.body.find(
    (n) => t.isClassMethod(n) && t.isIdentifier(n.key) && n.key.name === 'template',
  ) as ClassMethod | undefined
  if (!templateMethod) return

  const arrayLastSegment = arrayMap.arrayPathParts[arrayMap.arrayPathParts.length - 1]!
  const tempProg = t.program([
    t.expressionStatement(t.arrowFunctionExpression(templateMethod.params as t.Identifier[], templateMethod.body)),
  ])

  traverse(tempProg, {
    noScope: true,
    CallExpression(path: NodePath<t.CallExpression>) {
      if (!t.isMemberExpression(path.node.callee)) return
      if (!t.isIdentifier(path.node.callee.property) || path.node.callee.property.name !== 'map') return
      if (!path.node.arguments[0]) return

      const obj = path.node.callee.object
      let matches = false
      if (t.isMemberExpression(obj) && t.isIdentifier(obj.property) && obj.property.name === arrayLastSegment) {
        matches = true
      }
      if (!matches) return

      const arrowFn = path.node.arguments[0]
      if (!t.isArrowFunctionExpression(arrowFn)) return

      const hasTemplateLiteralBody =
        t.isTemplateLiteral(arrowFn.body) ||
        (t.isBlockStatement(arrowFn.body) &&
          arrowFn.body.body.length === 1 &&
          t.isReturnStatement(arrowFn.body.body[0]) &&
          arrowFn.body.body[0].argument &&
          t.isTemplateLiteral(arrowFn.body.body[0].argument))
      if (!hasTemplateLiteralBody) return

      let paramName: string
      if (t.isIdentifier(arrowFn.params[0])) {
        paramName = arrowFn.params[0].name
      } else {
        paramName = '__item'
        arrowFn.params[0] = t.identifier(paramName)
      }
      const indexParamName = t.isIdentifier(arrowFn.params[1]) ? arrowFn.params[1].name : undefined

      const renderArgs: t.Expression[] = [t.identifier(paramName)]
      if (indexParamName) renderArgs.push(t.identifier(indexParamName))
      arrowFn.body = t.callExpression(
        t.memberExpression(t.thisExpression(), t.identifier(renderMethodName)),
        renderArgs,
      )

      const newMapWithJoin = t.callExpression(t.memberExpression(path.node, t.identifier('join')), [
        t.stringLiteral(''),
      ])
      const alreadyHasJoin =
        path.parentPath?.isMemberExpression() &&
        t.isIdentifier(path.parentPath.node.property) &&
        path.parentPath.node.property.name === 'join' &&
        path.parentPath.parentPath?.isCallExpression()
      if (alreadyHasJoin) {
        path.parentPath.parentPath?.replaceWith(newMapWithJoin)
      } else {
        path.replaceWith(newMapWithJoin)
      }
      path.stop()
    },
  })
}

/**
 * Replace `arr.map(...).join("")` (store-backed HTML list) with `""` so list DOM is
 * owned only by __applyListChanges. Used for conditional-slot reinjection and for the
 * main template() return (markers + `${ternary}` may be separate AST from slot fragments).
 */
function getExpressionPathParts(expr: t.Expression): string[] | null {
  if (t.isIdentifier(expr)) return [expr.name]
  if (t.isThisExpression(expr)) return ['this']
  if ((t.isMemberExpression(expr) || t.isOptionalMemberExpression(expr)) && !expr.computed) {
    if (!t.isIdentifier(expr.property)) return null
    const parent = getExpressionPathParts(expr.object as t.Expression)
    return parent ? [...parent, expr.property.name] : null
  }
  return null
}

function matchesArrayMapReference(
  expr: t.Expression,
  arrayMap: Pick<ArrayMapBinding, 'arrayPathParts' | 'storeVar'>,
): boolean {
  const exprParts = getExpressionPathParts(expr)
  if (!exprParts) return false
  const pathOnly = arrayMap.arrayPathParts
  if (exprParts.length === pathOnly.length && exprParts.every((part, idx) => part === pathOnly[idx])) return true
  if (!arrayMap.storeVar) return false
  const fullPath = [arrayMap.storeVar, ...arrayMap.arrayPathParts]
  return exprParts.length === fullPath.length && exprParts.every((part, idx) => part === fullPath[idx])
}

function stripHtmlArrayMapJoinChainsInAst(
  rootStmt: t.Statement,
  arrayMap: Pick<ArrayMapBinding, 'arrayPathParts' | 'storeVar'>,
): boolean {
  const tempProg = t.program([rootStmt])
  let replaced = false
  traverse(tempProg, {
    noScope: true,
    CallExpression(path: NodePath<t.CallExpression>) {
      if (!t.isMemberExpression(path.node.callee)) return
      if (!t.isIdentifier(path.node.callee.property) || path.node.callee.property.name !== 'map') return
      const obj = path.node.callee.object
      if (!matchesArrayMapReference(obj as t.Expression, arrayMap)) return
      const arrowFn = path.node.arguments[0]
      if (!t.isArrowFunctionExpression(arrowFn) && !t.isFunctionExpression(arrowFn)) return

      let toReplace: NodePath<t.Node> = path
      if (
        path.parentPath?.isMemberExpression() &&
        t.isIdentifier(path.parentPath.node.property) &&
        path.parentPath.node.property.name === 'join' &&
        path.parentPath.parentPath?.isCallExpression()
      ) {
        toReplace = path.parentPath.parentPath as NodePath<t.CallExpression>
      }
      toReplace.replaceWith(t.stringLiteral(''))
      replaced = true
    },
  })
  return replaced
}

function stripHtmlArrayMapJoinInTemplateMethod(
  templateMethod: t.ClassMethod,
  arrayMap: Pick<ArrayMapBinding, 'arrayPathParts' | 'storeVar'>,
): boolean {
  if (!t.isBlockStatement(templateMethod.body)) return false
  const tempProg = t.program([
    t.expressionStatement(t.arrowFunctionExpression(templateMethod.params as t.Identifier[], templateMethod.body)),
  ])
  return stripHtmlArrayMapJoinChainsInAst(tempProg.body[0]!, arrayMap)
}

/**
 * Conditional-slot branch HTML is reinjected by __geaPatchCond. For HTML array maps,
 * leaving `.map(...).join('')` in the slot duplicates rows already owned by
 * __applyListChanges (same issue as component maps + __observeList; see
 * replaceMapWithComponentArrayItems slotBranch and examples/email-client).
 */
function replaceMapInConditionalSlots(
  slots: import('./ir').ConditionalSlot[],
  arrayMap: Pick<ArrayMapBinding, 'arrayPathParts' | 'storeVar'>,
): boolean {
  let replaced = false
  for (const slot of slots) {
    for (const key of ['truthyHtmlExpr', 'falsyHtmlExpr'] as const) {
      const expr = slot[key]
      if (!expr) continue
      const wrap = t.expressionStatement(expr)
      replaced = stripHtmlArrayMapJoinChainsInAst(wrap, arrayMap) || replaced
      slot[key] = wrap.expression as t.Expression
    }
  }
  return replaced
}

function generateStoreInlinePatchObserver(
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

function generateRerenderObserver(pathParts: PathParts, storeVar?: string, truthinessOnly?: boolean): t.ClassMethod {
  const method = jsMethod`${id(getObserveMethodName(pathParts, storeVar))}(value, change) {}`
  if (storeVar) {
    const prevProp = `__geaPrev_${getObserveMethodName(pathParts, storeVar)}`
    if (truthinessOnly) {
      // For early-return guard keys, only re-render when truthiness flips (null<->non-null).
      // Reference equality fails for computed getters that return new proxy wrappers.
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

function generateConditionalSlotObserveMethod(
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

function generateStateChildSwapObserver(pathParts: PathParts, storeVar: string | undefined): t.ClassMethod {
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

function generateStateChildSwapMethod(
  classBody: t.ClassBody,
  stateChildSlots: import('./transform-jsx').StateChildSlot[],
): void {
  const existing = classBody.body.find(
    (member) => t.isClassMethod(member) && t.isIdentifier(member.key) && member.key.name === '__geaSwapStateChildren',
  )
  if (existing) return

  const templateMethod = classBody.body.find(
    (m): m is t.ClassMethod => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'template',
  )

  const setupStatements: t.Statement[] = []
  if (templateMethod?.body) {
    const returnIndex = templateMethod.body.body.findIndex((s) => t.isReturnStatement(s))
    const stmts = returnIndex >= 0 ? templateMethod.body.body.slice(0, returnIndex) : []
    for (const stmt of stmts) {
      if (t.isExpressionStatement(stmt)) continue
      setupStatements.push(t.cloneNode(stmt, true) as t.Statement)
    }
  }

  // Update child props before swapping so the child renders with fresh data
  const propsUpdateCalls: t.Statement[] = stateChildSlots
    .map((slot) => {
      const buildPropsName = `__buildProps_${slot.childInstanceVar.replace(/^_/, '')}`
      // Check if a __buildProps method exists for this child (it won't for no-props children)
      const hasBuildProps = classBody.body.some(
        (m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === buildPropsName,
      )
      if (!hasBuildProps) return null!
      return t.expressionStatement(
        t.callExpression(
          t.memberExpression(
            t.memberExpression(t.thisExpression(), t.identifier(slot.childInstanceVar)),
            t.identifier('__geaUpdateProps'),
          ),
          [t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(buildPropsName)), [])],
        ),
      )
    })
    .filter(Boolean)

  const swapCalls = stateChildSlots.map((slot) => {
    const guardClone = t.cloneNode(slot.guardExpr, true)
    return t.expressionStatement(
      t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__geaSwapChild')), [
        t.stringLiteral(slot.markerId),
        t.logicalExpression(
          '&&',
          guardClone,
          t.memberExpression(t.thisExpression(), t.identifier(slot.childInstanceVar)),
        ),
      ]),
    )
  })

  const filteredSetup = pruneUnusedSetupDestructuring(setupStatements, [...propsUpdateCalls, ...swapCalls])

  const method = t.classMethod(
    'method',
    t.identifier('__geaSwapStateChildren'),
    [],
    t.blockStatement([...filteredSetup, ...propsUpdateCalls, ...swapCalls]),
  )
  classBody.body.push(method)
}
