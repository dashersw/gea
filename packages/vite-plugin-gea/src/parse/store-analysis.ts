import { parse } from '@babel/parser'
import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '../utils/babel-interop.ts'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

// ─── Caches ────────────────────────────────────────────────────────────────

const getterDepsCache = new Map<string, Map<string, string[][]>>()
const reactiveFieldsCache = new Map<string, Set<string>>()

/** Clear all file-read caches. */
export function clearCaches(): void {
  getterDepsCache.clear()
  reactiveFieldsCache.clear()
}

// ─── Import resolution ─────────────────────────────────────────────────────

/**
 * Resolve a relative import source to an absolute file path.
 * Tries bare path, then .ts/.js/.tsx/.jsx extensions, then index files.
 */
export function resolveImportPath(importSource: string, currentFile: string): string | null {
  const base = resolve(dirname(currentFile), importSource)
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    resolve(base, 'index.ts'),
    resolve(base, 'index.tsx'),
    resolve(base, 'index.js'),
    resolve(base, 'index.jsx'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

// ─── Store getter analysis ─────────────────────────────────────────────────

/**
 * Iterate over storeImports, resolve each import source relative to
 * sourceFile, and return a per-storeVar map of getter dependency paths.
 *
 * @returns storeVar -> (getter name -> dependency paths)
 */
export function analyzeStoreGetters(
  sourceFile: string,
  storeImports: Map<string, string>,
): Map<string, Map<string, string[][]>> {
  const result = new Map<string, Map<string, string[][]>>()
  for (const [storeVar, source] of storeImports) {
    const resolvedPath = resolveImportPath(source, sourceFile)
    if (!resolvedPath) continue
    const getterMap = analyzeStoreGettersForFile(resolvedPath)
    if (getterMap.size > 0) {
      result.set(storeVar, getterMap)
    }
  }
  return result
}

/**
 * Parse a store file and extract getter dependency paths.
 *
 * For each getter in any class extending Store, returns the `this.*`
 * property paths that the getter reads. Transitive getter deps are
 * resolved (if getter A reads getter B, A's deps include B's deps).
 *
 * Results are cached per file path.
 *
 * @returns getter name -> array of dependency paths (each path is string[])
 */
function analyzeStoreGettersForFile(filePath: string): Map<string, string[][]> {
  const cached = getterDepsCache.get(filePath)
  if (cached) return cached

  const ast = parseStoreFile(filePath)
  if (!ast) return new Map()

  const result = new Map<string, string[][]>()

  traverse(ast, {
    ClassDeclaration(classPath: NodePath<t.ClassDeclaration>) {
      if (!isStoreClass(classPath.node)) return

      for (const member of classPath.node.body.body) {
        if (!t.isClassMethod(member) || member.kind !== 'get' || !t.isIdentifier(member.key)) {
          continue
        }
        const deps = extractGetterDeps(member)
        if (deps.length > 0) {
          result.set(member.key.name, deps)
        }
      }
    },
  })

  // Resolve transitive getter dependencies
  resolveTransitiveGetterDeps(result)

  if (result.size > 0) {
    getterDepsCache.set(filePath, result)
  }

  return result
}

// ─── Store reactive fields ─────────────────────────────────────────────────

/**
 * Iterate over storeImports, resolve each import source relative to
 * sourceFile, and return a per-storeVar map of reactive field names.
 *
 * @returns storeVar -> set of reactive field names
 */
export function analyzeStoreReactiveFields(
  sourceFile: string,
  storeImports: Map<string, string>,
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  for (const [storeVar, source] of storeImports) {
    const resolvedPath = resolveImportPath(source, sourceFile)
    if (!resolvedPath) continue
    const fields = analyzeStoreReactiveFieldsForFile(resolvedPath)
    if (fields.size > 0) {
      result.set(storeVar, fields)
    }
  }
  return result
}

/**
 * Parse a store file and extract reactive class field names.
 *
 * A reactive field is any class property with an initializer in a
 * class extending Store. Results are cached per file path.
 */
function analyzeStoreReactiveFieldsForFile(filePath: string): Set<string> {
  const cached = reactiveFieldsCache.get(filePath)
  if (cached) return cached

  const ast = parseStoreFile(filePath)
  if (!ast) return new Set()

  const fields = new Set<string>()

  traverse(ast, {
    ClassDeclaration(classPath: NodePath<t.ClassDeclaration>) {
      if (!isStoreClass(classPath.node)) return

      for (const member of classPath.node.body.body) {
        if (t.isClassProperty(member) && t.isIdentifier(member.key) && member.value != null) {
          fields.add(member.key.name)
        }
      }
    },
  })

  if (fields.size > 0) {
    reactiveFieldsCache.set(filePath, fields)
  }

  return fields
}

// ─── Internals ─────────────────────────────────────────────────────────────

/** Read and parse a file. Returns null on failure. */
function parseStoreFile(filePath: string): t.File | null {
  if (!existsSync(filePath)) return null

  let source: string
  try {
    source = readFileSync(filePath, 'utf8')
  } catch {
    return null
  }

  try {
    return parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
    })
  } catch {
    return null
  }
}

/** Check if a class declaration extends Store. */
function isStoreClass(node: t.ClassDeclaration): boolean {
  return (
    !!node.superClass &&
    t.isIdentifier(node.superClass) &&
    node.superClass.name === 'Store'
  )
}

/** Check if a name follows the private convention (_prefix or suffix_). */
function isPrivateName(name: string): boolean {
  return name.charCodeAt(0) === 95 || name.charCodeAt(name.length - 1) === 95
}

/**
 * Extract the `this.*` property paths a getter method reads.
 *
 * Handles both `this.foo` member expressions and `const { foo } = this`
 * destructuring patterns.
 */
function extractGetterDeps(method: t.ClassMethod): string[][] {
  if (!t.isBlockStatement(method.body)) return []

  const paths = new Map<string, string[]>()

  // Wrap the body statements in a program so traverse can walk them
  const program = t.program(method.body.body.map((s) => t.cloneNode(s, true) as t.Statement))

  traverse(program, {
    noScope: true,

    MemberExpression(path: NodePath<t.MemberExpression>) {
      if (!t.isThisExpression(path.node.object) || !t.isIdentifier(path.node.property)) return
      const name = path.node.property.name
      if (!isPrivateName(name) && !paths.has(name)) {
        paths.set(name, [name])
      }
    },

    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      if (!t.isObjectPattern(path.node.id) || !t.isThisExpression(path.node.init)) return
      for (const prop of path.node.id.properties) {
        if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue
        const name = prop.key.name
        if (!isPrivateName(name) && !paths.has(name)) {
          paths.set(name, [name])
        }
      }
    },
  })

  return Array.from(paths.values())
}

/**
 * Resolve transitive getter dependencies in place.
 *
 * If getter A depends on getter B (a single-segment path matching another
 * getter name), replace that dep with B's underlying deps. Iterates until
 * stable or a max iteration limit is reached.
 */
function resolveTransitiveGetterDeps(result: Map<string, string[][]>): void {
  if (result.size === 0) return

  const MAX_ITERATIONS = 10
  let changed = true
  let iteration = 0

  while (changed && iteration++ < MAX_ITERATIONS) {
    changed = false
    for (const [getterName, deps] of result) {
      const expanded: string[][] = []
      for (const dep of deps) {
        // A single-segment dep that matches another getter (not self) gets expanded
        if (dep.length === 1 && result.has(dep[0]) && dep[0] !== getterName) {
          for (const transitiveDep of result.get(dep[0])!) {
            if (!containsPath(expanded, transitiveDep)) {
              expanded.push(transitiveDep)
            }
          }
          changed = true
        } else {
          if (!containsPath(expanded, dep)) {
            expanded.push(dep)
          }
        }
      }
      result.set(getterName, expanded)
    }
  }
}

/** Check if a path array list already contains an equivalent path. */
function containsPath(list: string[][], path: string[]): boolean {
  return list.some(
    (existing) => existing.length === path.length && existing.every((v, i) => v === path[i]),
  )
}
