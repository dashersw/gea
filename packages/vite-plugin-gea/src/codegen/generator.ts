/**
 * Top-level component transformation orchestrator.
 *
 * Replaces the old transform-component.ts — coordinates template analysis,
 * JSX transformation, event compilation, child component injection,
 * clone generation, reactivity wiring, and post-processing optimizations.
 */
import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '../utils/babel-interop.ts'
import type { ClassMethod, ReturnStatement } from '@babel/types'
import { appendToBody, id, jsExpr, jsImport, jsMethod } from 'eszter'
import type { ChildComponent, EventHandler } from '../ir/types.ts'
import type { AnalysisResult } from '../analyze/analyzer.ts'
import { analyzeTemplate } from '../analyze/analyzer.ts'
import { collectStateReferences } from '../parse/state-refs.ts'
import {
  transformJSXToTemplate,
  transformJSXFragmentToTemplate,
  transformJSXExpression,
  collectComponentTags,
  type Ctx,
  type StateChildSlot,
} from './gen-template.ts'
import { generateCloneMembers } from './gen-clone.ts'
import { appendCompiledEventMethods } from './gen-events.ts'
import {
  injectChildComponents,
  injectComponentRegistrations,
  getDirectPropMappings,
  type DirectPropMapping,
} from './gen-children.ts'
import { getTemplateParamBinding } from '../analyze/template-param-utils.ts'
import { pruneUnusedSetupDestructuring } from './prop-ref-utils.ts'
import {
  cacheThisIdInMethod,
  wrapEventsGetterWithCache,
  wrapSubpathCacheGuards,
} from './postprocess-helpers.ts'
import { applyStaticReactivity } from './reactivity.ts'
import {
  analyzeStoreGetters,
  analyzeStoreReactiveFields,
} from '../parse/store-analysis.ts'

// ─── Shared helpers ──────────────────────────────────────────────────────

/** Transform any JSX return statements nested in if/switch/block inside a template method body. */
function transformNestedReturns(stmts: t.Statement[], mainReturn: t.Statement, ctx: Ctx): boolean {
  let transformed = false
  for (const stmt of stmts) {
    if (t.isReturnStatement(stmt) && stmt !== mainReturn && stmt.argument) {
      if (t.isJSXElement(stmt.argument)) {
        stmt.argument = transformJSXToTemplate(stmt.argument, ctx)
        transformed = true
      } else if (t.isJSXFragment(stmt.argument)) {
        stmt.argument = transformJSXFragmentToTemplate(stmt.argument, ctx)
        transformed = true
      } else if (t.isExpression(stmt.argument)) {
        stmt.argument = transformJSXExpression(stmt.argument, ctx)
        transformed = true
      }
    } else if (t.isIfStatement(stmt)) {
      if (t.isBlockStatement(stmt.consequent)) transformed = transformNestedReturns(stmt.consequent.body, mainReturn, ctx) || transformed
      else if (t.isReturnStatement(stmt.consequent)) transformed = transformNestedReturns([stmt.consequent], mainReturn, ctx) || transformed
      if (stmt.alternate) {
        if (t.isBlockStatement(stmt.alternate)) transformed = transformNestedReturns(stmt.alternate.body, mainReturn, ctx) || transformed
        else if (t.isIfStatement(stmt.alternate)) transformed = transformNestedReturns([stmt.alternate], mainReturn, ctx) || transformed
        else if (t.isReturnStatement(stmt.alternate)) transformed = transformNestedReturns([stmt.alternate], mainReturn, ctx) || transformed
      }
    } else if (t.isBlockStatement(stmt)) {
      transformed = transformNestedReturns(stmt.body, mainReturn, ctx) || transformed
    } else if (t.isSwitchStatement(stmt)) {
      for (const c of stmt.cases) transformed = transformNestedReturns(c.consequent, mainReturn, ctx) || transformed
    }
  }
  return transformed
}

/** Walk an AST node tree using t.VISITOR_KEYS. */
function walkNode(node: t.Node | null | undefined, visit: (n: t.Node) => void): void {
  if (!node || typeof node !== 'object') return
  visit(node)
  for (const key of t.VISITOR_KEYS[node.type] || []) {
    const child = (node as any)[key]
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && typeof item.type === 'string') walkNode(item, visit)
      }
    } else if (child && typeof child === 'object' && typeof child.type === 'string') {
      walkNode(child, visit)
    }
  }
}

export function transformComponentFile(
  ast: t.File,
  imports: Map<string, string>,
  storeImports: Map<string, string>,
  className: string,
  sourceFile: string,
  _originalAST: t.File,
  _compImportsUsedAsTags: Set<string>,
  knownComponentImports: Set<string>,
  ssr: boolean = false,
): boolean {
  let transformed = false
  const stateRefs = collectStateReferences(ast, storeImports)

  // Enrich imported store refs with getter dependency info
  for (const [storeVar, getterMap] of analyzeStoreGetters(sourceFile, storeImports)) {
    const ref = stateRefs.get(storeVar)
    if (ref && ref.kind === 'imported') ref.getterDeps = getterMap
  }

  for (const [storeVar, fields] of analyzeStoreReactiveFields(sourceFile, storeImports)) {
    const ref = stateRefs.get(storeVar)
    if (ref && ref.kind === 'imported') ref.reactiveFields = fields
  }

  const compiledChildren: ChildComponent[] = []
  const eventIdCounter = { value: 0 }
  const preTransformAnalysis = new Map<string, AnalysisResult>()
  const compImportsUsedAsTags = new Set<string>()

  traverse(ast, {
    ClassMethod(path: NodePath<ClassMethod>) {
      if (!t.isIdentifier(path.node.key) || path.node.key.name !== 'template') return

      const ownerClass = path.findParent((p) => t.isClassDeclaration(p.node)) as NodePath<t.ClassDeclaration> | null
      if (ownerClass && t.isIdentifier(ownerClass.node.id) && ownerClass.node.id.name !== className) return

      const body = path.node.body.body
      const retStmt = body.find((s): s is ReturnStatement => t.isReturnStatement(s) && s.argument !== null)
      if (!retStmt?.argument) return

      const allComponentTags = new Set<string>(knownComponentImports)
      const instanceTags: string[] = []
      if (t.isJSXElement(retStmt.argument)) collectComponentTags(retStmt.argument, imports, instanceTags)
      else if (t.isJSXFragment(retStmt.argument)) collectComponentTags(retStmt.argument, imports, instanceTags)

      const componentInstances = new Map<string, ChildComponent[]>()
      const tagCounts = new Map<string, number>()
      instanceTags.forEach((tag, dfsIndex) => {
        const nextCount = (tagCounts.get(tag) || 0) + 1
        tagCounts.set(tag, nextCount)
        const instanceName =
          nextCount === 1
            ? `_${tag.charAt(0).toLowerCase() + tag.slice(1)}`
            : `_${tag.charAt(0).toLowerCase() + tag.slice(1)}${nextCount}`
        const instances = componentInstances.get(tag) || []
        instances.push({
          tagName: tag,
          instanceVar: instanceName,
          slotId: instanceName,
          propsExpression: t.objectExpression([]),
          dependencies: [],
          dfsIndex,
        })
        componentInstances.set(tag, instances)
      })

      const allComponentInstances = new Map<string, string>()
      allComponentTags.forEach((tag) => {
        allComponentInstances.set(tag, tag.charAt(0).toLowerCase() + tag.slice(1))
        const src = imports.get(tag)
        if (src) compImportsUsedAsTags.add(src.startsWith('./') ? src : `./${src}`)
      })

      const eventHandlers: EventHandler[] = []
      const returnIndex = body.indexOf(retStmt)
      const classPath = path.findParent((p) => t.isClassDeclaration(p.node)) as NodePath<t.ClassDeclaration> | null
      const classBody = t.isClassBody(path.parent) ? path.parent : undefined
      const analysis = analyzeTemplate(path.node, stateRefs, classBody)
      if (classPath?.node.id && t.isIdentifier(classPath.node.id)) {
        preTransformAnalysis.set(classPath.node.id.name, analysis)
      }
      const conditionalSlotInfos = analysis.conditionalSlots.map(
        (s) =>
          ({ slotId: s.slotId }) as { slotId: string; truthyHtmlExpr?: t.Expression; falsyHtmlExpr?: t.Expression },
      )
      const slotInfoById = new Map(conditionalSlotInfos.map((info) => [info.slotId, info]))
      const conditionalSlotNodeMap = new Map<
        t.Node,
        { slotId: string; truthyHtmlExpr?: t.Expression; falsyHtmlExpr?: t.Expression }
      >()
      for (const [node, slotId] of analysis.conditionalSlotNodeMap) {
        const info = slotInfoById.get(slotId)
        if (info) conditionalSlotNodeMap.set(node, info)
      }
      const stateChildSlots: StateChildSlot[] = []
      const refBindings: { refId: string; targetExpr: t.Expression }[] = []
      const ctx: Ctx = {
        imports,
        componentInstances,
        componentInstanceCursors: new Map<string, number>(),
        eventHandlers,
        eventIdCounter,
        stateRefs,
        elementPathToBindingId: analysis.elementPathToBindingId,
        elementPathToUserIdExpr: analysis.elementPathToUserIdExpr,
        templateSetupContext: {
          params: path.node.params,
          statements: returnIndex >= 0 ? body.slice(0, returnIndex) : [],
          earlyReturnBarrierIndex: analysis.earlyReturnBarrierIndex,
        },
        sourceFile,
        isRoot: true,
        conditionalSlots: conditionalSlotInfos,
        conditionalSlotCursor: { value: 0 },
        conditionalSlotNodeMap,
        stateChildSlots,
        stateChildSlotCounter: { value: 0 },
        refBindings,
        refCounter: { value: 0 },
      }

      let cloneRoot: t.JSXElement | null = null
      const preReturnStmts = returnIndex >= 0 ? body.slice(0, returnIndex) : []
      const preCloneEligible =
        t.isJSXElement(retStmt.argument) &&
        preReturnStmts.length === 0 &&
        componentInstances.size === 0 &&
        analysis.conditionalSlots.length === 0 &&
        analysis.arrayMaps.length === 0 &&
        analysis.unresolvedMaps.length === 0 &&
        analysis.earlyReturnGuard === undefined
      if (preCloneEligible && t.isJSXElement(retStmt.argument)) {
        cloneRoot = t.cloneNode(retStmt.argument, true) as t.JSXElement
      }

      if (t.isJSXElement(retStmt.argument)) {
        retStmt.argument = transformJSXToTemplate(retStmt.argument, ctx)
        transformed = true
      } else if (t.isJSXFragment(retStmt.argument)) {
        retStmt.argument = transformJSXFragmentToTemplate(retStmt.argument, ctx)
        transformed = true
      } else if (t.isExpression(retStmt.argument)) {
        retStmt.argument = transformJSXExpression(retStmt.argument, ctx)
        transformed = true
      }

      const earlyReturnCtx: Ctx = {
        imports,
        stateRefs,
        sourceFile,
        isRoot: true,
        eventHandlers: [] as EventHandler[],
        eventIdCounter,
      }
      transformed = transformNestedReturns(body, retStmt, earlyReturnCtx) || transformed

      if (!ssr && earlyReturnCtx.eventHandlers!.length > 0) {
        const earlyClassPath = path.findParent((p) =>
          t.isClassDeclaration(p.node),
        ) as NodePath<t.ClassDeclaration> | null
        if (earlyClassPath) {
          transformed =
            appendCompiledEventMethods(
              earlyClassPath.node.body,
              earlyReturnCtx.eventHandlers!,
              storeImports,
              knownComponentImports,
              [],
              sourceFile,
              imports,
              stateRefs,
            ) || transformed
        }
      }

      for (const info of conditionalSlotInfos) {
        const slot = analysis.conditionalSlots.find((s) => s.slotId === info.slotId)
        if (slot) {
          slot.truthyHtmlExpr = info.truthyHtmlExpr
          slot.falsyHtmlExpr = info.falsyHtmlExpr
        }
      }

      if (stateChildSlots.length > 0) {
        analysis.stateChildSlots = stateChildSlots
      }

      if (!ssr && cloneRoot && stateChildSlots.length === 0 && classPath && t.isClassBody(classPath.node.body)) {
        const cloneCtxForPatches: Ctx = {
          ...ctx,
          eventIdCounter: { value: 0 },
          refCounter: { value: 0 },
          eventHandlers: [],
          refBindings: [],
          componentInstanceCursors: new Map(ctx.componentInstanceCursors),
        }
        const cloneMembers = generateCloneMembers(
          cloneRoot,
          analysis,
          path.node.params,
          sourceFile,
          imports,
          cloneCtxForPatches,
        )
        if (cloneMembers) {
          classPath.node.body.body.push(...cloneMembers)
          transformed = true
        }
      }

      if (!ssr && eventHandlers.length > 0) {
        const classPath = path.findParent((p) => t.isClassDeclaration(p.node)) as NodePath<t.ClassDeclaration> | null
        if (classPath) {
          const setupStatements = returnIndex >= 0 ? body.slice(0, returnIndex) : []
          transformed =
            appendCompiledEventMethods(
              classPath.node.body,
              eventHandlers,
              storeImports,
              knownComponentImports,
              setupStatements,
              sourceFile,
              imports,
              stateRefs,
            ) || transformed
        }
      }

      if (refBindings.length > 0) {
        const classPath = path.findParent((p) => t.isClassDeclaration(p.node)) as NodePath<t.ClassDeclaration> | null
        if (classPath) {
          const refStatements: t.Statement[] = refBindings.flatMap((ref) => {
            const target = ref.targetExpr as t.LVal
            const q = jsExpr`this.element_.querySelector(${`[data-gea-ref="${ref.refId}"]`})`
            return [
              t.expressionStatement(t.assignmentExpression('=', target, t.nullLiteral())),
              t.expressionStatement(t.assignmentExpression('=', target, q)),
            ]
          })
          const existingSetup = classPath.node.body.body.find(
            (m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === '__setupRefs',
          )
          if (existingSetup && t.isClassMethod(existingSetup)) {
            existingSetup.body.body.push(...refStatements)
          } else {
            classPath.node.body.body.push(
              appendToBody(jsMethod`${id('__setupRefs')}() {}`, ...refStatements),
            )
          }
          transformed = true
        }
      }

      if (componentInstances.size > 0) {
        const templateParamNames = new Set<string>()
        const binding = getTemplateParamBinding(path.node.params[0])
        if (binding && t.isObjectPattern(binding)) {
          binding.properties.forEach((p) => {
            if (t.isObjectProperty(p) && t.isIdentifier(p.key)) templateParamNames.add(p.key.name)
          })
        }

        const directForwardingSet = new Set<string>()
        const directMappingsMap = new Map<string, DirectPropMapping[]>()
        for (const children of componentInstances.values()) {
          for (const child of children) {
            if (child.lazy) continue
            const mappings = getDirectPropMappings(child, templateParamNames)
            if (mappings) {
              directForwardingSet.add(child.instanceVar)
              directMappingsMap.set(child.instanceVar, mappings)
            }
          }
        }

        const preReturnStmts = returnIndex >= 0 ? body.slice(0, returnIndex) : []
        const earlyReturnGuards = preReturnStmts.filter(
          (s): s is t.IfStatement =>
            t.isIfStatement(s) &&
            (t.isReturnStatement(s.consequent) ||
              (t.isBlockStatement(s.consequent) && s.consequent.body.some((b) => t.isReturnStatement(b))),
              true),
        )

        let guardSetupStatements: t.Statement[] = []
        if (earlyReturnGuards.length > 0) {
          const guardIdents = new Set<string>()
          for (const guard of earlyReturnGuards) {
            walkNode(guard.test, (node) => { if (t.isIdentifier(node)) guardIdents.add(node.name) })
          }

          const declBindsGuardIdent = (pattern: t.LVal): boolean => {
            if (t.isIdentifier(pattern)) return guardIdents.has(pattern.name)
            if (t.isObjectPattern(pattern))
              return pattern.properties.some((p) =>
                t.isRestElement(p)
                  ? declBindsGuardIdent(p.argument)
                  : declBindsGuardIdent((p as t.ObjectProperty).value as t.LVal),
              )
            if (t.isArrayPattern(pattern)) return pattern.elements.some((e) => e && declBindsGuardIdent(e))
            return false
          }

          guardSetupStatements = preReturnStmts.filter((s) => {
            if (!t.isVariableDeclaration(s)) return false
            return s.declarations.some((d) => declBindsGuardIdent(d.id as t.LVal))
          })
        }

        const allChildren = Array.from(componentInstances.values()).flat()
        for (const child of allChildren) {
          const mappings = directMappingsMap.get(child.instanceVar)
          if (mappings) child.directMappings = mappings
          if (earlyReturnGuards.length > 0) {
            child.earlyReturnGuards = earlyReturnGuards
            child.guardSetupStatements = guardSetupStatements
          }
        }

        injectChildComponents(ast, className, componentInstances, imports, storeImports, knownComponentImports, directForwardingSet)
        compiledChildren.push(...allChildren)
        transformed = true
      }
      if (allComponentInstances.size > 0) {
        ensureComponentImport(ast, imports)
        injectComponentRegistrations(ast, className, allComponentInstances, knownComponentImports)
        transformed = true
      }

      if (transformed) {
        const currentReturnIndex = body.indexOf(retStmt)
        if (currentReturnIndex > 0) {
          const setupStmts = body.slice(0, currentReturnIndex)
          const prunedSetup = pruneUnusedSetupDestructuring(setupStmts, [retStmt])
          if (prunedSetup.length < setupStmts.length) {
            body.splice(0, currentReturnIndex, ...prunedSetup)
          }
        }
      }
    },
  })

  transformRemainingJSX(ast, imports)
  addJoinToMapCallsInTemplates(ast)

  if (!ssr) {
    transformed =
      applyStaticReactivity(
        ast,
        ast,
        className,
        sourceFile,
        imports,
        stateRefs,
        storeImports,
        compiledChildren,
        eventIdCounter,
        preTransformAnalysis,
      ) || transformed
  }

  transformRemainingJSX(ast, imports)

  if (!ssr && transformed) {
    traverse(ast, {
      ClassDeclaration(path: NodePath<t.ClassDeclaration>) {
        if (!t.isIdentifier(path.node.id) || path.node.id.name !== className) return
        const subpathPcCounter = { value: 0 }
        for (const member of path.node.body.body) {
          if (!t.isClassMethod(member) || member.kind === 'constructor') continue
          const name = t.isIdentifier(member.key) ? member.key.name : null
          if (!name) continue
          const isCompilerGenerated =
            name === 'template' || (name === 'events' && member.kind === 'get') || name.startsWith('__')
          if (isCompilerGenerated) cacheThisIdInMethod(member)
          if (name === 'events' && member.kind === 'get') wrapEventsGetterWithCache(member)
          if (name === '__onPropChange') wrapSubpathCacheGuards(member, subpathPcCounter, path.node.body)
        }
        path.stop()
      },
    })
  }

  return transformed
}

export function transformNonComponentJSX(ast: t.File, imports?: Map<string, string>): boolean {
  if (!imports) {
    imports = new Map<string, string>()
    for (const stmt of ast.program.body) {
      if (t.isImportDeclaration(stmt)) {
        for (const spec of stmt.specifiers) {
          if (t.isImportSpecifier(spec) || t.isImportDefaultSpecifier(spec)) {
            imports.set(spec.local.name, stmt.source.value)
          }
        }
      }
    }
  }
  return transformNonComponentJSXWithImports(ast, imports)
}

// ─── Internal helpers ──────────────────────────────────────────────────────

function transformNonComponentJSXWithImports(ast: t.File, imports: Map<string, string>): boolean {
  let transformed = false
  traverse(ast, {
    ClassMethod(path: NodePath<ClassMethod>) {
      if (!t.isIdentifier(path.node.key) || path.node.key.name !== 'template') return
      const body = path.node.body.body
      const retStmt = body.find((s): s is ReturnStatement => t.isReturnStatement(s) && s.argument !== null)
      if (!retStmt?.argument) return
      const ctx: Ctx = { imports, isRoot: true }
      if (t.isJSXElement(retStmt.argument)) {
        retStmt.argument = transformJSXToTemplate(retStmt.argument, ctx)
        transformed = true
      } else if (t.isJSXFragment(retStmt.argument)) {
        retStmt.argument = transformJSXFragmentToTemplate(retStmt.argument, ctx)
        transformed = true
      } else if (t.isExpression(retStmt.argument)) {
        retStmt.argument = transformJSXExpression(retStmt.argument, ctx)
        transformed = true
      }
      transformed = transformNestedReturns(body, retStmt, ctx) || transformed
    },
  })
  transformRemainingJSX(ast, imports)
  return transformed
}

/** Add .join('') to .map() calls inside template literals to prevent Array.toString() commas.
 *  Covers both template() and __buildProps_* methods.
 *  Uses a manual walk because Babel's traverse may not visit dynamically-injected class methods. */
function addJoinToMapCallsInTemplates(ast: t.File): void {
  const processed = new WeakSet<t.Node>()

  const isUnwrappedMapCall = (node: t.Node): node is t.CallExpression =>
    t.isCallExpression(node) &&
    !processed.has(node) &&
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.property) &&
    node.callee.property.name === 'map' &&
    node.arguments.length >= 1 &&
    t.isArrowFunctionExpression(node.arguments[0])

  for (const stmt of ast.program.body) {
    walkNode(stmt, (node) => {
      if (!t.isTemplateLiteral(node)) return
      for (let i = 0; i < node.expressions.length; i++) {
        const expr = node.expressions[i]
        if (isUnwrappedMapCall(expr)) {
          processed.add(expr)
          node.expressions[i] = t.callExpression(
            t.memberExpression(expr, id('join')),
            [t.stringLiteral('')],
          )
        }
      }
    })
  }
}

function ensureComponentImport(ast: t.File, imports: Map<string, string>): void {
  if (imports.has('Component')) return

  let geaImportPath: NodePath<t.ImportDeclaration> | null = null
  traverse(ast, {
    ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
      if (path.node.source.value === '@geajs/core') {
        geaImportPath = path
        path.stop()
      }
    },
  })

  if (geaImportPath) {
    ;(geaImportPath as NodePath<t.ImportDeclaration>).node.specifiers.push(
      t.importSpecifier(id('Component'), id('Component')),
    )
  } else {
    ast.program.body.unshift(jsImport`import { Component } from '@geajs/core'`)
  }
  imports.set('Component', '@geajs/core')
}

function transformRemainingJSX(ast: t.File, imports: Map<string, string>): void {
  traverse(ast, {
    noScope: true,
    JSXElement(path: NodePath<t.JSXElement>) {
      const classMethod = path.findParent((p) => t.isClassMethod(p.node))
      if (
        classMethod &&
        t.isClassMethod(classMethod.node) &&
        t.isIdentifier(classMethod.node.key) &&
        classMethod.node.key.name === 'template'
      )
        return
      try {
        path.replaceWith(transformJSXToTemplate(path.node, { imports }))
      } catch (err) {
        console.warn('[gea] Failed to transform JSX element:', err instanceof Error ? err.message : err)
      }
    },
    JSXFragment(path: NodePath<t.JSXFragment>) {
      const classMethod = path.findParent((p) => t.isClassMethod(p.node))
      if (
        classMethod &&
        t.isClassMethod(classMethod.node) &&
        t.isIdentifier(classMethod.node.key) &&
        classMethod.node.key.name === 'template'
      )
        return
      try {
        path.replaceWith(transformJSXFragmentToTemplate(path.node, { imports }))
      } catch (err) {
        console.warn('[gea] Failed to transform JSX fragment:', err instanceof Error ? err.message : err)
      }
    },
  })
}
