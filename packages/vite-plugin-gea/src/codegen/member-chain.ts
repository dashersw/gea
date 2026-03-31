import { t } from '../utils/babel-interop.ts'
import { id, jsImport } from 'eszter'
import type { PathParts } from '../ir/types.ts'
import type { StateRefMeta } from '../parse/state-refs.ts'

// ─── Import management ──────────────────────────────────────────────

export function ensureImport(
  ast: t.File,
  source: string,
  specifier: string,
  isDefault = false,
): boolean {
  const program = ast.program

  const buildSpecifier = () =>
    isDefault
      ? t.importDefaultSpecifier(id(specifier))
      : t.importSpecifier(id(specifier), id(specifier))

  if (isDefault) {
    const alreadyHasDefault = program.body.some(
      (node) =>
        t.isImportDeclaration(node) &&
        node.source.value === source &&
        node.specifiers.some((s) => t.isImportDefaultSpecifier(s)),
    )
    if (alreadyHasDefault) return false
    const insertIndex = Math.max(
      0,
      program.body.reduce(
        (idx, node, i) => (t.isImportDeclaration(node) ? i + 1 : idx),
        0,
      ),
    )
    program.body.splice(
      insertIndex,
      0,
      isDefault
        ? (jsImport`import ${id(specifier)} from ${source};`)
        : (jsImport`import { ${id(specifier)} } from ${source};`),
    )
    return true
  }

  const declaration = program.body.find(
    (node) => t.isImportDeclaration(node) && node.source.value === source,
  ) as t.ImportDeclaration | undefined

  if (!declaration) {
    const insertIndex = Math.max(
      0,
      program.body.reduce(
        (idx, node, i) => (t.isImportDeclaration(node) ? i + 1 : idx),
        0,
      ),
    )
    program.body.splice(
      insertIndex,
      0,
      jsImport`import { ${id(specifier)} } from ${source};`,
    )
    return true
  }

  const exists = declaration.specifiers.some(
    (s) =>
      t.isImportSpecifier(s) &&
      t.isIdentifier(s.local) &&
      s.local.name === specifier,
  )

  if (!exists) {
    declaration.specifiers.push(buildSpecifier())
    return true
  }

  return false
}

// ─── Member-chain builders ──────────────────────────────────────────

export function buildMemberChain(
  base: t.Expression,
  path: string,
): t.Expression {
  return buildMemberChainFromParts(base, path ? path.split('.') : [])
}

export function buildMemberChainFromParts(
  base: t.Expression,
  parts: PathParts,
): t.Expression {
  if (parts.length === 0) return base
  return parts.reduce<t.Expression>((acc, prop) => {
    const isIndex = /^\d+$/.test(prop)
    return t.memberExpression(
      acc,
      isIndex ? t.numericLiteral(Number(prop)) : id(prop),
      isIndex,
    )
  }, base)
}

export function buildOptionalMemberChain(
  base: t.Expression,
  path: string,
): t.Expression {
  return buildOptionalMemberChainFromParts(base, path ? path.split('.') : [])
}

export function buildOptionalMemberChainFromParts(
  base: t.Expression,
  parts: PathParts,
): t.Expression {
  if (parts.length === 0) return base
  return parts.reduce<t.Expression>((acc, prop) => {
    const isIndex = /^\d+$/.test(prop)
    return t.optionalMemberExpression(
      acc,
      isIndex ? t.numericLiteral(Number(prop)) : id(prop),
      isIndex,
      true,
    )
  }, base)
}

// ─── Observe key/method names ───────────────────────────────────────

function sanitizeObserveName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_$]/g, '_')
}

export function normalizePathParts(path: string | PathParts): PathParts {
  return Array.isArray(path) ? path : path ? path.split('.') : []
}

export function pathPartsToString(parts: string | PathParts): string {
  return normalizePathParts(parts).join('.')
}

export function buildObserveKey(
  parts: string | PathParts,
  storeVar?: string,
): string {
  return JSON.stringify({
    storeVar: storeVar || null,
    parts: normalizePathParts(parts),
  })
}

export function parseObserveKey(
  key: string,
): { parts: PathParts; storeVar?: string } {
  const parsed = JSON.parse(key) as {
    storeVar: string | null
    parts: PathParts
  }
  return {
    parts: parsed.parts,
    ...(parsed.storeVar ? { storeVar: parsed.storeVar } : {}),
  }
}

export function getObserveMethodName(
  parts: string | PathParts,
  storeVar?: string,
): string {
  const owner = sanitizeObserveName(storeVar || 'local')
  const normalized = normalizePathParts(parts)
  const observePath = sanitizeObserveName(
    normalized.length > 0 ? normalized.join('__') : 'root',
  )
  return `__observe_${owner}_${observePath}`
}

// ─── Path resolution ────────────────────────────────────────────────

export function resolvePath(
  expr:
    | t.MemberExpression
    | t.Identifier
    | t.ThisExpression
    | t.CallExpression,
  stateRefs: Map<string, StateRefMeta>,
  context: { inMap?: boolean; mapItemVar?: string } = {},
): {
  parts: PathParts | null
  isImportedState?: boolean
  storeVar?: string
} | null {
  if (t.isIdentifier(expr)) {
    if (context.inMap && context.mapItemVar === expr.name) {
      return { parts: null }
    }
    if (stateRefs.has(expr.name)) {
      const ref = stateRefs.get(expr.name)!
      if (ref.kind === 'derived') return { parts: null }
      if (ref.kind === 'local-destructured' && ref.propName) {
        return { parts: [ref.propName] }
      }
      if (ref.kind === 'store-alias' && ref.storeVar && ref.propName) {
        return {
          parts: [ref.propName],
          isImportedState: true,
          storeVar: ref.storeVar,
        }
      }
      if (
        ref.kind === 'imported-destructured' &&
        ref.storeVar &&
        ref.propName
      ) {
        return {
          parts: [ref.propName],
          isImportedState: true,
          storeVar: ref.storeVar,
        }
      }
      return {
        parts: [],
        isImportedState: ref.kind === 'imported',
        storeVar: ref.kind === 'imported' ? expr.name : undefined,
      }
    }
    return { parts: null }
  }

  if (t.isThisExpression(expr)) return { parts: [] }

  if (t.isCallExpression(expr) && t.isMemberExpression(expr.callee)) {
    return resolvePath(
      expr.callee.object as
        | t.MemberExpression
        | t.Identifier
        | t.ThisExpression,
      stateRefs,
      context,
    )
  }

  if (t.isMemberExpression(expr)) {
    const objectResult = resolvePath(
      expr.object as t.MemberExpression | t.Identifier | t.ThisExpression,
      stateRefs,
      context,
    )
    if (!objectResult || !objectResult.parts) {
      if (
        context.inMap &&
        t.isIdentifier(expr.object) &&
        expr.object.name === context.mapItemVar
      ) {
        if (t.isIdentifier(expr.property)) {
          return { parts: [expr.property.name] }
        }
      }
      return { parts: null }
    }

    if (
      objectResult.isImportedState &&
      objectResult.storeVar &&
      objectResult.parts.length === 0 &&
      t.isIdentifier(expr.property)
    ) {
      const ref = stateRefs.get(objectResult.storeVar)
      const propName = expr.property.name
      if (ref?.reactiveFields) {
        if (
          ref.reactiveFields.has(propName) ||
          ref.getterDeps?.has(propName)
        ) {
          return {
            parts: [propName],
            isImportedState: true,
            storeVar: objectResult.storeVar,
          }
        }
        return null
      }
      return {
        parts: [propName],
        isImportedState: true,
        storeVar: objectResult.storeVar,
      }
    }

    if (t.isIdentifier(expr.property)) {
      return {
        parts: [...objectResult.parts, expr.property.name],
        isImportedState: objectResult.isImportedState,
        storeVar: objectResult.storeVar,
      }
    } else if (t.isNumericLiteral(expr.property)) {
      return {
        parts: [...objectResult.parts, String(expr.property.value)],
        isImportedState: objectResult.isImportedState,
        storeVar: objectResult.storeVar,
      }
    }
  }

  return { parts: null }
}
