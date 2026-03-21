import * as t from '@babel/types'
import { appendToBody, id, js, jsBlockBody, jsExpr, jsMethod } from 'eszter'
import type { NodePath } from '@babel/traverse'
import type { ClassMethod } from '@babel/types'
import type { ChildComponent, EventHandler, PathParts, UnresolvedMapInfo } from './ir.ts'
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
import { generateRenderItemMethod, buildPopulateItemHandlersMethod } from './generate-array-render.ts'
import { generateCreateItemMethod } from './generate-array-patch.ts'
import {
  generateComponentArrayMethods,
  getComponentArrayBuildMethodName,
  getComponentArrayItemsName,
  getComponentArrayRefreshMethodName,
  isUnresolvedMapWithComponentChild,
} from './generate-array-slot-sync.ts'
import { childHasNoProps } from './generate-components.ts'
import { getHoistableRootEventsForImport } from './component-event-helpers.ts'
import { appendCompiledEventMethods } from './generate-events.ts'
import {
  buildObserveKey,
  getObserveMethodName,
  parseObserveKey,
  pathPartsToString,
  pruneDeadParamDestructuring,
  replacePropRefsInExpression,
  replacePropRefsInStatements,
  resolvePath,
  pruneUnusedSetupDestructuring,
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
    observeHandlers: Array<{ pathParts: PathParts; methodName: string }>
  }>,
): t.ClassMethod {
  const body: t.Statement[] = jsBlockBody`
    if (!this.__observer_removers__) { this.__observer_removers__ = []; }
    if (!this.__stores) { this.__stores = {}; }
    this.__observer_removers__.forEach(fn => fn());
    this.__observer_removers__ = [];
    if (typeof this.__ensureArrayConfigs === 'function') { this.__ensureArrayConfigs(); }
  `

  for (const store of stores) {
    const storeRef = t.memberExpression(
      t.memberExpression(t.thisExpression(), t.identifier('__stores')),
      t.identifier(store.storeVar),
    )

    body.push(js`${storeRef} = ${t.cloneNode(store.captureExpression, true)};`)

    for (const observeHandler of store.observeHandlers) {
      body.push(
        js`
          this.__observer_removers__.push(
            ${storeRef}.observe(
              ${t.arrayExpression(observeHandler.pathParts.map((part) => t.stringLiteral(part)))},
              (__v, __c) => this.${id(observeHandler.methodName)}(__v, __c)
            )
          );
        `,
      )
    }
  }

  const method = jsMethod`${id('createdHooks')}() {}`
  method.body.body.push(...body)
  return method
}

function generateLocalStateObserverSetup(
  observeHandlers: Array<{ pathParts: PathParts; methodName: string }>,
): t.ClassMethod {
  const localStore = t.memberExpression(t.thisExpression(), t.identifier('__store'))
  const body: t.Statement[] = [
    js`if (typeof this.__ensureArrayConfigs === 'function') { this.__ensureArrayConfigs(); }`,
    js`if (!${localStore}) { return; }`,
  ]

  observeHandlers.forEach((observeHandler) => {
    body.push(
      js`
        this.__observer_removers__.push(
          ${localStore}.observe(
            ${t.arrayExpression(observeHandler.pathParts.map((part) => t.stringLiteral(part)))},
            (__v, __c) => this.${id(observeHandler.methodName)}(__v, __c)
          )
        );
      `,
    )
  })

  const method = jsMethod`${id('__setupLocalStateObservers')}() {}`
  method.body.body.push(...body)
  return method
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
        !hasCompiledChildStoreDeps
      )
        return

      traverse(ast, {
        ClassDeclaration(classPath: NodePath<t.ClassDeclaration>) {
          if (!t.isIdentifier(classPath.node.id) || classPath.node.id.name !== className) return

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

          const patchStatementsByBinding = new Map<(typeof analysis.propBindings)[0], t.Statement[]>()
          for (const pb of analysis.propBindings) {
            const elExpr =
              pb.bindingId !== undefined
                ? t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('getElementById')), [
                    t.binaryExpression(
                      '+',
                      t.memberExpression(t.thisExpression(), t.identifier('id')),
                      t.stringLiteral('-' + pb.bindingId),
                    ),
                  ])
                : t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('$')), [
                    t.stringLiteral(pb.selector),
                  ])
            const valueExpr = pb.expression && pb.setupStatements ? t.identifier('__boundValue') : t.identifier('value')
            let updateStmt: t.Statement
            if (pb.type === 'text' && pb.textNodeIndex !== undefined) {
              const tnAccess = t.memberExpression(
                t.memberExpression(t.identifier('__el'), t.identifier('childNodes')),
                t.numericLiteral(pb.textNodeIndex),
                true,
              )
              updateStmt = t.blockStatement([
                t.variableDeclaration('const', [t.variableDeclarator(t.identifier('__tn'), tnAccess)]),
                t.ifStatement(
                  t.logicalExpression(
                    '&&',
                    t.identifier('__tn'),
                    t.binaryExpression(
                      '!==',
                      t.memberExpression(t.identifier('__tn'), t.identifier('nodeValue')),
                      valueExpr,
                    ),
                  ),
                  t.expressionStatement(
                    t.assignmentExpression(
                      '=',
                      t.memberExpression(t.identifier('__tn'), t.identifier('nodeValue')),
                      t.cloneNode(valueExpr, true),
                    ),
                  ),
                ),
              ])
            } else if (pb.type === 'text') {
              const targetProp = pb.propName === 'children' ? 'innerHTML' : 'textContent'
              updateStmt = t.ifStatement(
                t.binaryExpression(
                  '!==',
                  t.memberExpression(t.identifier('__el'), t.identifier(targetProp)),
                  valueExpr,
                ),
                t.expressionStatement(
                  t.assignmentExpression(
                    '=',
                    t.memberExpression(t.identifier('__el'), t.identifier(targetProp)),
                    t.cloneNode(valueExpr, true),
                  ),
                ),
              )
            } else if (pb.type === 'class') {
              updateStmt = t.blockStatement([
                t.variableDeclaration('const', [
                  t.variableDeclarator(
                    t.identifier('__newClass'),
                    t.conditionalExpression(
                      t.binaryExpression('!=', valueExpr, t.nullLiteral()),
                      t.callExpression(
                        t.memberExpression(
                          t.callExpression(t.identifier('String'), [t.cloneNode(valueExpr, true)]),
                          t.identifier('trim'),
                        ),
                        [],
                      ),
                      t.stringLiteral(''),
                    ),
                  ),
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
              const isBooleanAttr = BOOLEAN_HTML_ATTRS.has(attrName)
              const removeCondition = isBooleanAttr
                ? t.unaryExpression('!', valueExpr)
                : t.logicalExpression(
                    '||',
                    t.binaryExpression('===', valueExpr, t.nullLiteral()),
                    t.binaryExpression('===', valueExpr, t.identifier('undefined')),
                  )
              updateStmt = t.ifStatement(
                removeCondition,
                t.expressionStatement(
                  t.callExpression(t.memberExpression(t.identifier('__el'), t.identifier('removeAttribute')), [
                    t.stringLiteral(attrName),
                  ]),
                ),
                t.expressionStatement(
                  t.callExpression(t.memberExpression(t.identifier('__el'), t.identifier('setAttribute')), [
                    t.stringLiteral(attrName),
                    isBooleanAttr ? t.stringLiteral('') : t.callExpression(t.identifier('String'), [valueExpr]),
                  ]),
                ),
              )
            } else {
              continue
            }
            const blockStatements: t.Statement[] = [
              t.variableDeclaration('const', [t.variableDeclarator(t.identifier('__el'), elExpr)]),
            ]
            if (pb.expression && pb.setupStatements) {
              const rewrittenSetup = replacePropRefsInStatements(
                pb.setupStatements,
                templatePropNames,
                templateWholeParam,
              )
              const rewrittenExpr = replacePropRefsInExpression(pb.expression, templatePropNames, templateWholeParam)
              blockStatements.push(...pruneDeadParamDestructuring(rewrittenSetup, [rewrittenExpr]))
              blockStatements.push(
                t.variableDeclaration('const', [t.variableDeclarator(t.identifier('__boundValue'), rewrittenExpr)]),
              )
            }
            blockStatements.push(t.ifStatement(t.identifier('__el'), updateStmt))
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
                const observeKey = buildObserveKey(
                  resolved.parts,
                  resolved.isImportedState ? resolved.storeVar : undefined,
                )
                addToStoreKey(observeKey)
              },
            })
          }

          handlers.forEach((method, observeKey) => {
            mergeObserveMethod(observeKey, method)
          })

          const unresolvedEventHandlers: EventHandler[] = []
          const unresolvedBindings: Array<{ info: UnresolvedMapInfo; binding: any }> = []
          const componentArrayRefreshDeps: Array<{ methodName: string; propNames: string[] }> = []
          const componentArrayDisposeTargets: string[] = []
          const storeComponentArrayObservers: Array<{
            storeVar: string
            refreshMethodName: string
            pathParts: PathParts
          }> = []
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
              const methods = generateComponentArrayMethods(
                um,
                arrayPropName,
                imports,
                propNames,
                classPath.node.body,
                storeArrayAccess,
                getTemplateParamIdentifier(classPath.node.body),
                tmplSetupCtx,
              )
              if (methods.length > 0 && templateMethod) {
                methods.forEach((method) => classPath.node.body.body.push(method))
                const importSource = imports.get(isComponentSlot.componentTag)
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
                ensureConstructorCalls(classPath.node.body, getComponentArrayBuildMethodName(arrayPropName))
                if (storeArrayAccess) {
                  storeComponentArrayObservers.push({
                    storeVar: storeArrayAccess.storeVar,
                    refreshMethodName: getComponentArrayRefreshMethodName(arrayPropName),
                    pathParts: [storeArrayAccess.propName],
                  })
                } else {
                  const computedDeps = (
                    um.dependencies || collectUnresolvedDependencies([um], stateRefs, classPath.node.body)
                  ).filter((dep) => dep.storeVar || dep.pathParts[0] !== 'props')
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
                                t.memberExpression(
                                  t.thisExpression(),
                                  t.identifier(getComponentArrayRefreshMethodName(arrayPropName)),
                                ),
                                [],
                              ),
                            ),
                          ]),
                        ),
                      )
                      if (dep.storeVar) {
                        storeComponentArrayObservers.push({
                          storeVar: dep.storeVar,
                          refreshMethodName: getComponentArrayRefreshMethodName(arrayPropName),
                          pathParts: dep.pathParts,
                        })
                      }
                    })
                  }
                  const itemPropsMethod = methods[0]
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
                        mergeObserveMethod(
                          dep.observeKey,
                          t.classMethod(
                            'method',
                            t.identifier(getObserveMethodName(dep.pathParts, dep.storeVar)),
                            [t.identifier('value'), t.identifier('change')],
                            t.blockStatement([
                              t.expressionStatement(
                                t.callExpression(
                                  t.memberExpression(
                                    t.thisExpression(),
                                    t.identifier(getComponentArrayRefreshMethodName(arrayPropName)),
                                  ),
                                  [],
                                ),
                              ),
                            ]),
                          ),
                        )
                        storeComponentArrayObservers.push({
                          storeVar: dep.storeVar!,
                          refreshMethodName: getComponentArrayRefreshMethodName(arrayPropName),
                          pathParts: dep.pathParts,
                        })
                      }
                    }
                  }
                  const itemTemplateProps = collectPropNamesFromItemTemplate(um.itemTemplate, propNames)
                  const allStoreManaged = computedDeps.length > 0 && computedDeps.every((dep) => dep.storeVar)
                  componentArrayRefreshDeps.push({
                    methodName: getComponentArrayRefreshMethodName(arrayPropName),
                    propNames: allStoreManaged ? [...itemTemplateProps] : [arrayPropName, ...itemTemplateProps],
                  })
                }
                componentArrayDisposeTargets.push(getComponentArrayItemsName(arrayPropName))
                replaceMapWithComponentArrayItems(
                  templateMethod,
                  um.computationExpr,
                  getComponentArrayItemsName(arrayPropName),
                )
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
              ...(um.callbackBodyStatements?.length ? { callbackBodyStatements: um.callbackBodyStatements } : {}),
            }
            unresolvedBindings.push({ info: um, binding: syntheticBinding })
            const prevEventLen = unresolvedEventHandlers.length
            const { method, handlerPropsInMap } = generateRenderItemMethod(
              syntheticBinding,
              imports,
              unresolvedEventHandlers,
              eventIdCounter,
              classPath.node.body,
              tmplSetupCtx,
            )
            const newHandlers = unresolvedEventHandlers.slice(prevEventLen)
            const tokenMatch = newHandlers[0]?.selector?.match(/data-gea-event="([^"]+)"/)
            mapItemAttrInfos.push({
              itemVariable: um.itemVariable,
              itemIdProperty: um.itemIdProperty,
              containerBindingId: um.containerBindingId,
              eventToken: tokenMatch ? tokenMatch[1] : undefined,
            })
            if (method && templateMethod) {
              classPath.node.body.body.push(method)
              applied = true
            }
            const createMethod = generateCreateItemMethod(
              syntheticBinding,
              getTemplatePropNames(classPath.node.body),
              getTemplateParamIdentifier(classPath.node.body),
              tmplSetupCtx,
            )
            if (createMethod) classPath.node.body.body.push(createMethod)
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
            const propDeps = deps.filter((dep) => !dep.storeVar && dep.pathParts[0] === 'props')
            if (propDeps.length === 0) return

            const usedPropNames = new Set<string>()
            const scanNodes: t.Statement[] = [
              ...(info.computationSetupStatements || []).map((s) => t.cloneNode(s, true) as t.Statement),
            ]
            if (info.computationExpr) {
              scanNodes.push(t.expressionStatement(t.cloneNode(info.computationExpr, true) as t.Expression))
            }
            if (scanNodes.length > 0) {
              const prog = t.program(scanNodes)
              traverse(prog, {
                noScope: true,
                Identifier(path: NodePath<t.Identifier>) {
                  if (templatePropNames.has(path.node.name)) usedPropNames.add(path.node.name)
                },
                MemberExpression(path: NodePath<t.MemberExpression>) {
                  if (
                    templateWholeParam &&
                    t.isIdentifier(path.node.object, { name: templateWholeParam }) &&
                    t.isIdentifier(path.node.property) &&
                    !path.node.computed
                  ) {
                    usedPropNames.add(path.node.property.name)
                  }
                },
              })
            }

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

          if (analysis.stateChildSlots && analysis.stateChildSlots.length > 0) {
            generateStateChildSwapMethod(classPath.node.body, analysis.stateChildSlots)
          }

          const stateChildObserveKeys = new Set(
            (analysis.stateChildSlots || []).flatMap((slot) => slot.dependencies || []).map((dep) => dep.observeKey),
          )
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
              const { parts, storeVar } = parseObserveKey(observeKey)
              if (!storeVar) {
                stateProps.set(observeKey, parts)
              }
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

          const ownClassMethodNames = new Set(
            classPath.node.body.body
              .filter((m): m is t.ClassMethod => t.isClassMethod(m) && t.isIdentifier(m.key))
              .map((m) => (m.key as t.Identifier).name),
          )

          const componentGetterStoreDeps = new Map<string, Array<{ storeVar: string; pathParts: PathParts }>>()
          const getterLocalRefs = new Map<string, Set<string>>()
          const getterNames = new Set<string>()
          for (const member of classPath.node.body.body) {
            if (t.isClassMethod(member) && member.kind === 'get' && t.isIdentifier(member.key))
              getterNames.add(member.key.name)
          }
          for (const member of classPath.node.body.body) {
            if (!t.isClassMethod(member) || member.kind !== 'get' || !t.isIdentifier(member.key)) continue
            const deps: Array<{ storeVar: string; pathParts: PathParts }> = []
            const localRefs = new Set<string>()
            const program = t.program(member.body.body.map((s) => t.cloneNode(s, true) as t.Statement))
            traverse(program, {
              noScope: true,
              MemberExpression(mePath: NodePath<t.MemberExpression>) {
                if (t.isThisExpression(mePath.node.object) && t.isIdentifier(mePath.node.property)) {
                  const propName = mePath.node.property.name
                  if (getterNames.has(propName) && propName !== member.key.name) localRefs.add(propName)
                  return
                }
                if (!t.isIdentifier(mePath.node.object)) return
                const objName = mePath.node.object.name
                const ref = stateRefs.get(objName)
                if (!ref || ref.kind !== 'imported') return
                if (!t.isIdentifier(mePath.node.property)) return
                deps.push({ storeVar: objName, pathParts: [mePath.node.property.name] })
              },
            })
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
                  const key = `${dep.storeVar}.${dep.pathParts.join('.')}`
                  if (!existing.some((e) => `${e.storeVar}.${e.pathParts.join('.')}` === key)) {
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
                    const resolved = resolvePath(idPath.node, stateRefs)
                    if (!resolved?.parts?.length) return
                    if (!resolved.isImportedState) return
                    const observeKey = buildObserveKey(resolved.parts, resolved.storeVar)
                    guardStateKeys.add(observeKey)
                    if (!stateProps.has(observeKey)) stateProps.set(observeKey, [...resolved.parts])
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

            if (alreadyHandled) continue

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
                mergeObserveMethod(
                  observeKey,
                  generateArrayRelationalObserver(
                    propPath,
                    arrayMap,
                    bindings,
                    getObserveMethodName(propPath, storeVar),
                  ),
                )
              })
              continue
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
                generateConditionalSlotObserveMethod(propPath, storeVar, conditionalSlotIndices, !hasInlinePatches),
              )
            }

            if (hasInlinePatches) continue

            if (arrayHandled) continue
            if (isNestedArrayPath) continue
            if (analysis.arrayMaps.length > 0 && !guardStateKeys.has(observeKey)) continue
            if (unresolvedMapKeys.has(observeKey)) continue

            if (stateChildObserveKeys.has(observeKey)) {
              mergeObserveMethod(observeKey, generateStateChildSwapObserver(propPath, storeVar))
            }

            const handledByComponentArray = storeComponentArrayObservers.some(
              (obs) => obs.storeVar === storeVar && pathPartsToString(obs.pathParts) === pathPartsToString(propPath),
            )
            if (handledByComponentArray) continue
            if (stateChildObserveKeys.has(observeKey)) continue

            if (!childObserveGroups.has(observeKey)) {
              if (conditionalSlotIndices.length > 0) continue
              if (analysis.conditionalSlotScopedStoreKeys?.has(observeKey)) continue
              mergeObserveMethod(observeKey, generateRerenderObserver(propPath, storeVar))
            }
          }

          {
            childObserveGroups.forEach((children, observeKey) => {
              const { parts, storeVar } = parseObserveKey(observeKey)
              if (hasOnPropChange && !storeVar && parts[0] === 'props') return
              const methodName = getObserveMethodName(parts, storeVar)
              const existing = addedMethods.get(observeKey)
              const calls = children.map((child) =>
                t.expressionStatement(
                  t.callExpression(
                    t.memberExpression(
                      t.thisExpression(),
                      t.identifier(`__refreshChildProps_${child.instanceVar.replace(/^_/, '')}`),
                    ),
                    [],
                  ),
                ),
              )
              if (existing && t.isBlockStatement(existing.body)) {
                existing.body.body.push(...calls)
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
                mergeObserveMethod(
                  dep.observeKey,
                  generateUnresolvedRelationalObserver(
                    binding,
                    info,
                    relBinding,
                    getObserveMethodName(dep.pathParts, dep.storeVar),
                    getTemplatePropNames(classPath.node.body),
                    getTemplateParamIdentifier(classPath.node.body),
                  ),
                )
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

          const renderEventHandlers: EventHandler[] = []
          analysis.arrayMaps.forEach((arrayMap) => {
            const { method } = generateRenderItemMethod(
              arrayMap,
              imports,
              renderEventHandlers,
              eventIdCounter,
              classPath.node.body,
              tmplSetupCtx,
            )
            if (method) {
              classPath.node.body.body.push(method)
              applied = true
              const renderMethodName = (method.key as t.Identifier).name
              replaceInlineMapWithRenderCall(classPath, arrayMap, renderMethodName)
              replaceMapInConditionalSlots(analysis.conditionalSlots || [], arrayMap, renderMethodName)
            }

            const createMethod = generateCreateItemMethod(
              arrayMap,
              getTemplatePropNames(classPath.node.body),
              getTemplateParamIdentifier(classPath.node.body),
              tmplSetupCtx,
            )
            if (createMethod) {
              classPath.node.body.body.push(createMethod)
            }
            const observeKey = buildObserveKey(arrayMap.arrayPathParts, arrayMap.storeVar)
            generateArrayHandlers(arrayMap, getObserveMethodName(arrayMap.arrayPathParts, arrayMap.storeVar)).forEach(
              (h) => {
                mergeObserveMethod(observeKey, h)
              },
            )

            // No constructor init needed — element lookups use querySelector
          })

          if ((analysis.conditionalSlots || []).length > 0) {
            const templatePropNames = getTemplatePropNames(classPath.node.body)
            generateConditionalPatchMethods(
              classPath.node.body,
              analysis.conditionalSlots!,
              templatePropNames,
              getTemplateParamIdentifier(classPath.node.body),
            )
          }

          if (analysis.arrayMaps.length > 0) {
            const ensureArrayConfigsMethod = generateEnsureArrayConfigsMethod(analysis.arrayMaps)
            if (ensureArrayConfigsMethod) {
              classPath.node.body.body.push(ensureArrayConfigsMethod)
            }
          }

          if (renderEventHandlers.length > 0) {
            applied = appendCompiledEventMethods(classPath.node.body, renderEventHandlers) || applied
          }
          if (unresolvedEventHandlers.length > 0) {
            applied = appendCompiledEventMethods(classPath.node.body, unresolvedEventHandlers) || applied
          }

          if (applied) {
            const importedStores = new Map<
              string,
              {
                captureExpression: t.Expression
                observeHandlers: Map<string, { pathParts: PathParts; methodName: string }>
              }
            >()
            const localObserveHandlers = new Map<string, { pathParts: PathParts; methodName: string }>()

            const ensureStoreGroup = (storeVar: string) => {
              if (!importedStores.has(storeVar)) {
                const captureExpression = t.memberExpression(t.identifier(storeVar), t.identifier('__store'))
                importedStores.set(storeVar, {
                  captureExpression,
                  observeHandlers: new Map<string, { pathParts: PathParts; methodName: string }>(),
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
                    const wrapperMethodName = `${originalMethodName}__via`
                    if (
                      !classPath.node.body.body.some(
                        (m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === wrapperMethodName,
                      )
                    ) {
                      classPath.node.body.body.push(
                        t.classMethod(
                          'method',
                          t.identifier(wrapperMethodName),
                          [t.identifier('_v'), t.identifier('change')],
                          t.blockStatement([
                            t.expressionStatement(
                              t.callExpression(
                                t.memberExpression(t.thisExpression(), t.identifier(originalMethodName)),
                                [
                                  t.memberExpression(t.thisExpression(), t.identifier(parts[0])),
                                  t.identifier('change'),
                                ],
                              ),
                            ),
                          ]),
                        ),
                      )
                    }
                    for (const dep of compGetterDeps) {
                      const depKey = buildObserveKey(dep.pathParts, dep.storeVar) + `__getter_${parts[0]}`
                      ensureStoreGroup(dep.storeVar).observeHandlers.set(depKey, {
                        pathParts: dep.pathParts,
                        methodName: wrapperMethodName,
                      })
                    }
                  }
                  return
                }
                localObserveHandlers.set(observeKey, { pathParts: parts, methodName: getObserveMethodName(parts) })
                return
              }
              if (parts.length === 1) {
                const storeRef = stateRefs.get(storeVar)
                const getterDepPaths = storeRef?.getterDeps?.get(parts[0])
                if (getterDepPaths && getterDepPaths.length > 0) {
                  const originalMethodName = getObserveMethodName(parts, storeVar)
                  const wrapperMethodName = `${originalMethodName}__via`
                  if (
                    !classPath.node.body.body.some(
                      (m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === wrapperMethodName,
                    )
                  ) {
                    classPath.node.body.body.push(
                      t.classMethod(
                        'method',
                        t.identifier(wrapperMethodName),
                        [t.identifier('_v'), t.identifier('change')],
                        t.blockStatement([
                          t.expressionStatement(
                            t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(originalMethodName)), [
                              t.memberExpression(t.identifier(storeVar), t.identifier(parts[0])),
                              t.identifier('change'),
                            ]),
                          ),
                        ]),
                      ),
                    )
                  }
                  for (const depPath of getterDepPaths) {
                    const depKey = buildObserveKey(depPath, storeVar) + `__getter_${parts[0]}`
                    ensureStoreGroup(storeVar).observeHandlers.set(depKey, {
                      pathParts: depPath,
                      methodName: wrapperMethodName,
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

            for (const obs of mapSyncObservers) {
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
              ensureStoreGroup(obs.storeVar).observeHandlers.set(`__storeCompArray_${obs.refreshMethodName}`, {
                pathParts: obs.pathParts,
                methodName: obs.refreshMethodName,
              })
            }

            if (importedStores.size > 0 || localObserveHandlers.size > 0 || mapRegistrations.length > 0) {
              const storeConfigs = Array.from(importedStores.entries()).map(([storeVar, config]) => ({
                storeVar,
                captureExpression: config.captureExpression,
                observeHandlers: Array.from(config.observeHandlers.values()).map(({ pathParts, methodName }) => ({
                  pathParts,
                  methodName,
                })),
              }))

              if (storeConfigs.length > 0 || mapRegistrations.length > 0) {
                const createdHooksMethod = generateCreatedHooks(storeConfigs)
                if (mapRegistrations.length > 0) {
                  createdHooksMethod.body.body.push(...mapRegistrations)
                }
                classPath.node.body.body.push(createdHooksMethod)
              }
              if (localObserveHandlers.size > 0) {
                classPath.node.body.body.push(
                  generateLocalStateObserverSetup(Array.from(localObserveHandlers.values())),
                )
              }
              ensureObserverDispose(classPath.node.body)
            }
          }
        },
      })
    },
  })

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
  },
  unresolvedMap: UnresolvedMapInfo,
  relBinding: import('./ir').UnresolvedRelationalClassBinding,
  methodName: string,
  templatePropNames: Set<string>,
  wholeParamName?: string,
): t.ClassMethod {
  const arrayPathString = pathPartsToString(arrayMap.arrayPathParts)
  const containerName = `__${arrayPathString.replace(/\./g, '_')}_container`
  const containerRef = t.memberExpression(t.thisExpression(), t.identifier(containerName))

  const containerLookup =
    arrayMap.containerBindingId !== undefined
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

  const method = jsMethod`${id(methodName)}(value, change) {}`
  return appendToBody(
    method,
    js`if (!this.rendered_) return;`,
    lazyInit(containerName, containerLookup),
    ...jsBlockBody`if (!${containerRef}) return;`,
    ...setupStatements,
    t.variableDeclaration('var', [
      t.variableDeclarator(
        t.identifier('__arr'),
        t.conditionalExpression(
          t.callExpression(t.memberExpression(t.identifier('Array'), t.identifier('isArray')), [arrExpr]),
          t.cloneNode(arrExpr, true),
          t.arrayExpression([]),
        ),
      ),
    ]),
    ...jsBlockBody`
      for (var __i = 0; __i < ${containerRef}.children.length && __i < __arr.length; __i++) {
        var __child = ${containerRef}.children[__i];
        if (${itemComparison} === value) {
          __child.classList.${id(relBinding.matchWhenEqual ? 'add' : 'remove')}(${t.stringLiteral(relBinding.classToggleName)});
        } else {
          __child.classList.${id(relBinding.matchWhenEqual ? 'remove' : 'add')}(${t.stringLiteral(relBinding.classToggleName)});
        }
      }
    `,
  )
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

  const containerLookup =
    arrayMap.containerBindingId !== undefined
      ? t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('getElementById')), [
          t.binaryExpression(
            '+',
            t.memberExpression(t.thisExpression(), t.identifier('id')),
            t.stringLiteral('-' + arrayMap.containerBindingId),
          ),
        ])
      : (jsExpr`this.$(":scope")` as t.Expression)

  let arrExpr = t.cloneNode(unresolvedMap.computationExpr || t.arrayExpression([]), true) as t.Expression
  let setupStatements: t.Statement[] = []
  const needsReplace = (templatePropNames && templatePropNames.size > 0) || wholeParamName
  if (needsReplace) {
    arrExpr = replacePropRefsInExpression(arrExpr, templatePropNames || new Set(), wholeParamName)
    if (unresolvedMap.computationSetupStatements?.length) {
      setupStatements = replacePropRefsInStatements(
        unresolvedMap.computationSetupStatements.map((s) => t.cloneNode(s, true)),
        templatePropNames || new Set(),
        wholeParamName,
      )
    }
  }

  const prunedSetup = pruneUnusedSetupStatements(setupStatements, arrExpr)
  const getItemsBody: t.Statement[] = [...prunedSetup, t.returnStatement(arrExpr)]

  return t.expressionStatement(
    t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__geaRegisterMap')), [
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
    ]),
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
): void {
  if (!arrayExpr || !t.isBlockStatement(templateMethod.body)) return
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
          arrayExpr.property.name === mapObj.property.name)
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

      toReplace.replaceWith(
        t.callExpression(
          t.memberExpression(t.memberExpression(t.thisExpression(), t.identifier(itemsName)), t.identifier('join')),
          [t.stringLiteral('')],
        ),
      )
      replaced = true
    },
  })
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

function ensureConstructorCalls(classBody: t.ClassBody, methodName: string): void {
  let ctor = classBody.body.find(
    (member) => t.isClassMethod(member) && t.isIdentifier(member.key) && member.key.name === 'constructor',
  ) as t.ClassMethod | undefined

  if (!ctor) {
    ctor = appendToBody(
      jsMethod`${id('constructor')}(...args) {}`,
      t.expressionStatement(t.callExpression(t.super(), [t.spreadElement(t.identifier('args'))])),
      t.expressionStatement(t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(methodName)), [])),
    )
    classBody.body.unshift(ctor)
    return
  }

  ctor.body.body.push(
    t.expressionStatement(t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(methodName)), [])),
  )
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

  const childRefreshMethodNames = nonDirectChildren
    .filter((child) => child.dependencies.some((dep) => !dep.storeVar && dep.pathParts[0] === 'props'))
    .map((child) => `__refreshChildProps_${child.instanceVar.replace(/^_/, '')}`)
  const arrayRefreshMethodNames = arrayRefreshDeps.filter((d) => d.propNames.length > 0).map((d) => d.methodName)
  const refreshMethodNames = [...new Set([...childRefreshMethodNames, ...arrayRefreshMethodNames])]

  const refreshPropDeps = new Map<string, Set<string>>()
  for (const child of nonDirectChildren) {
    const methodName = `__refreshChildProps_${child.instanceVar.replace(/^_/, '')}`
    const depProps = new Set<string>()
    for (const dep of child.dependencies) {
      if (!dep.storeVar && dep.pathParts[0] === 'props' && dep.pathParts.length > 1) {
        depProps.add(dep.pathParts[1])
      }
    }
    if (depProps.size > 0) {
      refreshPropDeps.set(methodName, depProps)
    }
  }
  for (const { methodName, propNames } of arrayRefreshDeps) {
    if (propNames.length > 0) {
      refreshPropDeps.set(methodName, new Set(propNames))
    }
  }

  const refreshCalls: t.Statement[] = refreshMethodNames.map((name) => {
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
      t.tryStatement(
        t.blockStatement(bodyStmts.map((s) => t.cloneNode(s, true) as t.Statement)),
        t.catchClause(null, t.blockStatement([])),
      ),
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
): void {
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
          if (names.some((n) => !seen.has(n))) {
            names.forEach((n) => seen.add(n))
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
  const initSetup = pruneDeadParamDestructuring(
    rpStmts(allSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement)),
    rewrittenCondExprs,
  )
  const condAssignments: t.Statement[] = []
  for (let i = 0; i < slots.length; i++) {
    condAssignments.push(
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(t.thisExpression(), t.identifier(`__geaCond_${i}`)),
          t.unaryExpression('!', t.unaryExpression('!', rewrittenCondExprs[i])),
        ),
      ),
    )
  }

  const registerCondCalls: t.Statement[] = []
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]
    const rewrittenCondExpr = rpExpr(t.cloneNode(slot.conditionExpr, true))
    const condSetup = pruneDeadParamDestructuring(
      rpStmts(allSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement)),
      [rewrittenCondExpr],
    )

    const getCondBody: t.Statement[] = [...condSetup, t.returnStatement(rewrittenCondExpr)]

    const buildHtmlFn = (htmlExpr?: t.Expression): t.Expression => {
      if (!htmlExpr) return t.nullLiteral()
      const clonedHtmlExpr = rpExpr(t.cloneNode(htmlExpr, true))
      const htmlSetup = pruneDeadParamDestructuring(
        rpStmts(allHtmlSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement)),
        [clonedHtmlExpr],
      )
      if (htmlSetup.length > 0) {
        return t.arrowFunctionExpression([], t.blockStatement([...htmlSetup, t.returnStatement(clonedHtmlExpr)]))
      }
      return t.arrowFunctionExpression([], clonedHtmlExpr)
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
    evalStatements.length > 0
      ? [
          t.tryStatement(t.blockStatement(evalStatements), t.catchClause(null, t.blockStatement([]))),
          ...registerCondCalls,
        ]
      : registerCondCalls

  inlineIntoConstructor(classBody, initBody)
}

function getTemplatePropNames(classBody: t.ClassBody): Set<string> {
  const names = new Set<string>()
  const templateMethod = classBody.body.find(
    (m): m is t.ClassMethod => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'template',
  )
  if (templateMethod?.params[0] && t.isObjectPattern(templateMethod.params[0])) {
    templateMethod.params[0].properties.forEach((p) => {
      if (t.isObjectProperty(p) && t.isIdentifier(p.key)) names.add(p.key.name)
    })
  }
  return names
}

function getTemplateParamIdentifier(classBody: t.ClassBody): string | undefined {
  const templateMethod = classBody.body.find(
    (m): m is t.ClassMethod => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'template',
  )
  if (!templateMethod?.params[0]) return undefined
  const p = templateMethod.params[0]
  if (t.isIdentifier(p)) return p.name
  if (t.isTSParameterProperty(p) && t.isIdentifier(p.parameter)) return p.parameter.name
  return undefined
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
  if (!templateMethod.params[0] || !t.isObjectPattern(templateMethod.params[0])) return propName
  for (const p of templateMethod.params[0].properties) {
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

/** Inject data-gea-event and data-gea-item-id into template inline .map() items
 *  so event delegation works from the very first render without a rebuild. */
function injectMapItemAttrsIntoTemplate(
  templateMethod: t.ClassMethod,
  mapInfos: Array<{
    itemVariable: string
    itemIdProperty?: string
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
      const first = rootTL.quasis[0].value.raw
      const tagMatch = first.match(/^(<[\w-]+)/)
      if (!tagMatch) return
      const tagPart = tagMatch[1]
      const remainder = first.substring(tagPart.length)

      const itemIdExpr = info.itemIdProperty
        ? t.memberExpression(t.identifier(info.itemVariable), t.identifier(info.itemIdProperty))
        : t.callExpression(t.identifier('String'), [t.identifier(info.itemVariable)])
      const eventAttr = info.eventToken ? ` data-gea-event="${info.eventToken}"` : ''

      if (info.containerBindingId) {
        const idExpr = t.binaryExpression(
          '+',
          t.binaryExpression(
            '+',
            t.memberExpression(t.thisExpression(), t.identifier('id')),
            t.stringLiteral('-' + info.containerBindingId + '-'),
          ),
          t.callExpression(t.identifier('String'), [t.cloneNode(itemIdExpr)]),
        )
        rootTL.quasis = [
          t.templateElement({ raw: `${tagPart} id="`, cooked: `${tagPart} id="` }),
          t.templateElement({ raw: `" data-gea-item-id="`, cooked: `" data-gea-item-id="` }),
          t.templateElement(
            { raw: `"${eventAttr}${remainder}`, cooked: `"${eventAttr}${remainder}` },
            rootTL.quasis[0].tail,
          ),
          ...rootTL.quasis.slice(1),
        ]
        rootTL.expressions = [idExpr, itemIdExpr, ...rootTL.expressions]
      } else {
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

      const paramName = t.isIdentifier(arrowFn.params[0]) ? arrowFn.params[0].name : 'item'
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

function replaceMapInConditionalSlots(
  slots: import('./ir').ConditionalSlot[],
  arrayMap: { arrayPathParts: PathParts; itemVariable: string; indexVariable?: string },
  renderMethodName: string,
): void {
  const arrayLastSegment = arrayMap.arrayPathParts[arrayMap.arrayPathParts.length - 1]!
  for (const slot of slots) {
    for (const expr of [slot.truthyHtmlExpr, slot.falsyHtmlExpr]) {
      if (!expr) continue
      const tempProg = t.program([t.expressionStatement(expr)])
      traverse(tempProg, {
        noScope: true,
        CallExpression(path: NodePath<t.CallExpression>) {
          if (!t.isMemberExpression(path.node.callee)) return
          if (!t.isIdentifier(path.node.callee.property) || path.node.callee.property.name !== 'map') return
          const obj = path.node.callee.object
          if (!(t.isMemberExpression(obj) && t.isIdentifier(obj.property) && obj.property.name === arrayLastSegment))
            return
          const arrowFn = path.node.arguments[0]
          if (!t.isArrowFunctionExpression(arrowFn)) return
          const paramName = t.isIdentifier(arrowFn.params[0]) ? arrowFn.params[0].name : 'item'
          const indexParamName = t.isIdentifier(arrowFn.params[1]) ? arrowFn.params[1].name : undefined
          const renderArgs: t.Expression[] = [t.identifier(paramName)]
          if (indexParamName) renderArgs.push(t.identifier(indexParamName))
          arrowFn.body = t.callExpression(
            t.memberExpression(t.thisExpression(), t.identifier(renderMethodName)),
            renderArgs,
          )
          const alreadyHasJoin =
            path.parentPath?.isMemberExpression() &&
            t.isIdentifier(path.parentPath.node.property) &&
            path.parentPath.node.property.name === 'join' &&
            path.parentPath.parentPath?.isCallExpression()
          if (!alreadyHasJoin) {
            path.replaceWith(
              t.callExpression(t.memberExpression(path.node, t.identifier('join')), [t.stringLiteral('')]),
            )
          }
          path.stop()
        },
      })
    }
  }
}

function ensureObserverDispose(classBody: t.ClassBody): void {
  const statements = jsBlockBody`
    if (this.__observer_removers__) {
      this.__observer_removers__.forEach(fn => fn());
    }
  `

  const existingDispose = classBody.body.find(
    (member) => t.isClassMethod(member) && t.isIdentifier(member.key) && member.key.name === 'dispose',
  ) as t.ClassMethod | undefined

  if (existingDispose) {
    existingDispose.body.body.unshift(...statements)
    const hasSuperDispose = existingDispose.body.body.some(
      (statement) =>
        t.isExpressionStatement(statement) &&
        t.isCallExpression(statement.expression) &&
        t.isMemberExpression(statement.expression.callee) &&
        t.isSuper(statement.expression.callee.object) &&
        t.isIdentifier(statement.expression.callee.property) &&
        statement.expression.callee.property.name === 'dispose',
    )
    if (!hasSuperDispose) {
      existingDispose.body.body.push(js`super.dispose();` as t.ExpressionStatement)
    }
    return
  }

  classBody.body.push(
    appendToBody(jsMethod`${id('dispose')}() {}`, ...statements, js`super.dispose();` as t.ExpressionStatement),
  )
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

function generateRerenderObserver(pathParts: PathParts, storeVar?: string): t.ClassMethod {
  const method = jsMethod`${id(getObserveMethodName(pathParts, storeVar))}(value, change) {}`
  if (storeVar) {
    const prevProp = `__geaPrev_${getObserveMethodName(pathParts, storeVar)}`
    method.body.body.push(
      ...jsBlockBody`
        if (value === this.${id(prevProp)}) return;
        this.${id(prevProp)} = value;
      `,
    )
  }
  method.body.body.push(
    t.ifStatement(
      t.logicalExpression(
        '&&',
        t.memberExpression(t.thisExpression(), t.identifier('rendered_')),
        t.binaryExpression(
          '===',
          t.unaryExpression('typeof', t.memberExpression(t.thisExpression(), t.identifier('__geaRequestRender'))),
          t.stringLiteral('function'),
        ),
      ),
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

  const patchStatements: t.Statement[] = []
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
  })

  if (emitEarlyReturn) {
    const anyPatchedExpr = slotIndices
      .map((i) => t.memberExpression(t.thisExpression(), t.identifier(`__geaCondPatched_${i}`)) as t.Expression)
      .reduce((acc, expr) => t.logicalExpression('||', acc, expr))

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

  const swapCalls = stateChildSlots.map((slot) => {
    const guardClone = t.cloneNode(slot.guardExpr, true)
    return t.expressionStatement(
      t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__geaSwapChild')), [
        t.stringLiteral(slot.markerId),
        t.logicalExpression(
          '&&',
          guardClone,
          t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(slot.ensureMethodName)), []),
        ),
      ]),
    )
  })

  const filteredSetup = pruneUnusedSetupDestructuring(setupStatements, swapCalls)

  const method = t.classMethod(
    'method',
    t.identifier('__geaSwapStateChildren'),
    [],
    t.blockStatement([...filteredSetup, ...swapCalls]),
  )
  classBody.body.push(method)
}
