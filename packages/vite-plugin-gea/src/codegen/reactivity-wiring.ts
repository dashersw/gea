/**
 * reactivity-wiring.ts
 *
 * Final observer collection, grouping by store, createdHooks generation,
 * local state observer setup, private field injection, after-render hooks,
 * and module-level unwrap helper.
 *
 * Extracted from the END of the former gen-reactivity.ts applyStaticReactivity().
 */

import { t, generate } from '../utils/babel-interop.ts'
import { appendToBody, id, js, jsExpr, jsMethod, jsPrivateProp } from 'eszter'

import type { ArrayMapBinding, PathParts } from '../ir/types.ts'
import type { StateRefMeta } from '../parse/state-refs.ts'

import {
  generateCreatedHooks,
  generateLocalStateObserverSetup,
  classMethodUsesParam,
} from './gen-observer-wiring.ts'
import { generateMapRegistration } from './gen-map-helpers.ts'
import {
  buildObserveKey,
  getObserveMethodName,
  parseObserveKey,
  pathPartsToString,
} from './member-chain.ts'
import { buildValueUnwrapHelper } from './array-compiler.ts'

import type { ReactivityContext } from './reactivity-types.ts'

// ═══════════════════════════════════════════════════════════════════════════
// mergeObserveMethod — shared helper used across all reactivity sub-modules
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Merge an observe method into the class body. If a method for the same
 * observeKey (or method name) already exists, append the new body statements
 * into the existing method. Otherwise add it as a new class method.
 */
export function mergeObserveMethod(ctx: ReactivityContext, observeKey: string, method: t.ClassMethod): void {
  const methodName = getMethodName(method)
  const existing =
    ctx.addedMethods.get(observeKey) || (methodName ? ctx.addedMethodsByName.get(methodName) : undefined)
  if (existing && t.isBlockStatement(existing.body) && t.isBlockStatement(method.body)) {
    if (method.params.length > existing.params.length) {
      existing.params = method.params.map((param) => t.cloneNode(param, true) as typeof param)
    }
    existing.body.body.push(
      ...ctx.alignMethodBodyParams(method, existing.params as (t.Identifier | t.Pattern | t.RestElement)[]),
    )
    return
  }
  ctx.classPath.node.body.body.push(method)
  ctx.addedMethods.set(observeKey, method)
  if (methodName) ctx.addedMethodsByName.set(methodName, method)
  ctx.applied = true
}

function getMethodName(method: t.ClassMethod): string | null {
  return t.isIdentifier(method.key) ? method.key.name : t.isStringLiteral(method.key) ? method.key.value : null
}

// ═══════════════════════════════════════════════════════════════════════════
// wireObservers — final observer registration and hooks
// ═══════════════════════════════════════════════════════════════════════════

export function wireObservers(
  ctx: ReactivityContext,
  stateRefs: Map<string, StateRefMeta>,
  htmlArrayMaps: ArrayMapBinding[],
  mapRegistrations: t.ExpressionStatement[],
  mapSyncObservers: Array<{ storeVar: string; pathParts: PathParts; delegateName: string }>,
  storeComponentArrayObservers: Array<{
    storeVar: string
    refreshMethodName: string
    pathParts: PathParts
  }>,
  observeListConfigs: Array<{
    storeVar: string
    pathParts: PathParts
    arrayPropName: string
    componentTag: string
    containerBindingId?: string
    containerUserIdExpr?: t.Expression
    itemIdProperty?: string
  }>,
  staticArrayRefreshOnMount: string[],
  initialHtmlArrayRefreshOnMount: t.Statement[],
  guardStateKeys: Set<string>,
  componentGetterStoreDeps: Map<
    string,
    Array<{ storeVar: string; pathParts: PathParts; dynamicKeyExpr?: t.Expression }>
  >,
  ownClassMethodNames: Set<string>,
  hasOnPropChange: boolean,
  unresolvedBindings: Array<{ info: any; binding: any }>,
): void {
  if (!ctx.applied) return

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
      importedStores.set(storeVar, {
        captureExpression: jsExpr`${id(storeVar)}.__store` as t.Expression,
        observeHandlers: new Map<string, ObserverEntry>(),
      })
    }
    return importedStores.get(storeVar)!
  }

  ctx.addedMethods.forEach((_method, observeKey) => {
    const { parts, storeVar } = parseObserveKey(observeKey)
    if (!storeVar) {
      if (hasOnPropChange && parts[0] === 'props') return
      if (parts.length === 1 && ownClassMethodNames.has(parts[0])) {
        const compGetterDeps = componentGetterStoreDeps.get(parts[0])
        if (compGetterDeps && compGetterDeps.length > 0) {
          const originalMethodName = getObserveMethodName(parts)
          const originalMethod = ctx.addedMethodsByName.get(originalMethodName)
          for (const dep of compGetterDeps) {
            const depKey = buildObserveKey(dep.pathParts, dep.storeVar) + `__getter_${parts[0]}`
            ensureStoreGroup(dep.storeVar).observeHandlers.set(depKey, {
              pathParts: dep.pathParts,
              methodName: originalMethodName,
              isVia: true,
              rereadExpr: jsExpr`this.${id(parts[0])}` as t.Expression,
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
        const originalMethod = ctx.addedMethodsByName.get(originalMethodName)
        let rereadExpr: t.Expression = t.memberExpression(t.identifier(storeVar), t.identifier(parts[0]))
        for (let i = 1; i < parts.length; i++) {
          rereadExpr = t.optionalMemberExpression(rereadExpr, t.identifier(parts[i]), false, true)
        }
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

  // Map sync observers
  const consolidatedMapSync = new Map<string, (typeof mapSyncObservers)[0]>()
  for (const obs of mapSyncObservers) {
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
    const existingMethod = ctx.addedMethods.get(existingObserveKey)
    if (existingMethod && t.isBlockStatement(existingMethod.body)) {
      const alreadyCalls = existingMethod.body.body.some((stmt) => {
        if (!t.isExpressionStatement(stmt)) return false
        const expr = stmt.expression
        if (!t.isCallExpression(expr) || !t.isMemberExpression(expr.callee)) return false
        return t.isIdentifier(expr.callee.property) && expr.callee.property.name === obs.refreshMethodName
      })
      if (alreadyCalls) continue
    }
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

  // Inject null guards for observer methods under early-return guards
  if (guardStateKeys.size > 0) {
    ctx.addedMethods.forEach((method, observeKey) => {
      const { parts, storeVar: sv } = parseObserveKey(observeKey)
      if (!sv) return

      if (parts.length >= 2) {
        for (let prefixLen = 1; prefixLen < parts.length; prefixLen++) {
          const prefixKey = buildObserveKey(parts.slice(0, prefixLen), sv)
          if (guardStateKeys.has(prefixKey)) {
            if (t.isBlockStatement(method.body)) {
              method.body.body.unshift(js`if (${id(sv)}.${id(parts[prefixLen - 1])} == null) return;`)
            }
            break
          }
        }
      } else if (parts.length === 1) {
        const storeRef = stateRefs.get(sv)
        if (storeRef?.getterDeps) {
          for (const [getterName, depPaths] of storeRef.getterDeps) {
            const isDepOfGetter = depPaths.some((dp) => dp.length === 1 && dp[0] === parts[0])
            if (!isDepOfGetter) continue
            const guardKey = buildObserveKey([getterName], sv)
            if (!guardStateKeys.has(guardKey)) continue
            if (t.isBlockStatement(method.body)) {
              method.body.body.unshift(js`if (${id(sv)}.${id(getterName)} == null) return;`)
            }
            break
          }
        }
      }
    })
  }

  // Deduplicate observer methods with identical bodies
  {
    const seen = new Set<t.ClassMethod>()
    const methodEntries: Array<{ observeKey: string; method: t.ClassMethod; name: string }> = []
    ctx.addedMethods.forEach((method, observeKey) => {
      if (seen.has(method)) return
      seen.add(method)
      const name = getMethodName(method)
      if (name) methodEntries.push({ observeKey, method, name })
    })

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
        const idx = ctx.classPath.node.body.body.indexOf(dup.method)
        if (idx !== -1) ctx.classPath.node.body.body.splice(idx, 1)
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

  // ── Emit createdHooks, local observers, after-render hooks ──
  if (importedStores.size > 0 || localObserveHandlers.size > 0 || mapRegistrations.length > 0) {
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

    for (const olc of observeListConfigs) {
      ensureStoreGroup(olc.storeVar)
    }

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
      const existingCreatedHooks = ctx.classPath.node.body.body.find(
        (m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'createdHooks',
      ) as t.ClassMethod | undefined
      if (existingCreatedHooks) {
        existingCreatedHooks.body.body.unshift(...generatedCreatedHooksBody)
      } else {
        ctx.classPath.node.body.body.push(createdHooksMethod)
      }
    }
    if (staticArrayRefreshOnMount.length > 0 || initialHtmlArrayRefreshOnMount.length > 0) {
      const refreshStmts: t.Statement[] = [
        ...[...new Set(staticArrayRefreshOnMount)].map((name) => js`this.${id(name)}();`),
        ...initialHtmlArrayRefreshOnMount,
      ]
      const existingHook = ctx.classPath.node.body.body.find(
        (m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'onAfterRenderHooks',
      ) as t.ClassMethod | undefined
      if (existingHook) existingHook.body.body.push(...refreshStmts)
      else
        ctx.classPath.node.body.body.push(
          appendToBody(jsMethod`onAfterRenderHooks() {}`, ...refreshStmts),
        )
    }
    if (localObserveHandlers.size > 0) {
      ctx.classPath.node.body.body.push(
        generateLocalStateObserverSetup(Array.from(localObserveHandlers.values()), htmlArrayMaps.length > 0),
      )
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// injectPrivateFields — inject private class fields
// ═══════════════════════════════════════════════════════════════════════════

export function injectPrivateFields(
  ctx: ReactivityContext,
  classLevelPrivateFields: Set<string>,
  needsClassLevelRawStoreField: boolean,
): void {
  if (needsClassLevelRawStoreField) classLevelPrivateFields.add('__rs')
  for (const fieldName of classLevelPrivateFields) {
    const alreadyHas = ctx.classPath.node.body.body.some(
      (n) => t.isClassPrivateProperty(n) && t.isIdentifier(n.key.id) && n.key.id.name === fieldName,
    )
    if (!alreadyHas) {
      ctx.classPath.node.body.body.unshift(jsPrivateProp`#${id(fieldName)}`)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// injectModuleLevelUnwrapHelper — top-level __v helper
// ═══════════════════════════════════════════════════════════════════════════

export function injectModuleLevelUnwrapHelper(ast: t.File, needed: boolean): void {
  if (!needed) return
  const alreadyHas = ast.program.body.some(
    (stmt) =>
      t.isVariableDeclaration(stmt) && stmt.declarations.some((d) => t.isIdentifier(d.id) && d.id.name === '__v'),
  )
  if (!alreadyHas) {
    ast.program.body.unshift(buildValueUnwrapHelper())
  }
}
