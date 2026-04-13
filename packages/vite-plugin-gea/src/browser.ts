import babelGenerator from '@babel/generator'
import babelTraverse from '@babel/traverse'
import { parseSource } from './parse/parser.ts'
import { transformFile } from './closure-codegen/transform.ts'
import { convertFunctionalToClass } from './preprocess/functional-to-class.ts'
import { isComponentTag } from './utils/component-tags.ts'
import { ensureGeaCompilerSymbolImports } from './utils/imports.ts'
import { clearCaches as clearStoreCaches } from './parse/store-analysis.ts'

const traverse = typeof (babelTraverse as any).default === 'function' ? (babelTraverse as any).default : babelTraverse
const generate =
  typeof (babelGenerator as any).default === 'function' ? (babelGenerator as any).default : babelGenerator

interface CompileResult {
  compiledModules: Record<string, string>
  errors: Array<{ file: string; message: string }>
}

function resolveVirtualFile(source: string, files: Record<string, string>): string | null {
  const base = source.replace(/^\.\//, '')
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`]
  for (const c of candidates) {
    if (c in files) return c
  }
  return null
}

function isComponentImportSource(source: string): boolean {
  if (source.startsWith('.')) return true
  if (source.startsWith('node:')) return false
  return true
}

export function compileForBrowser(files: Record<string, string>): CompileResult {
  const compiledModules: Record<string, string> = {}
  const errors: Array<{ file: string; message: string }> = []

  clearStoreCaches()
  ;(globalThis as any).__geaPlaygroundFiles = files
  ;(globalThis as any).__geaResolveFile = (filePath: string): string | null => {
    const name = filePath.replace(/^\/virtual\//, '')
    return files[name] ?? null
  }

  const storeModules = new Set<string>()
  const componentModules = new Set<string>()
  const classComponentModules = new Set<string>()
  const functionComponentModules = new Set<string>()

  for (const [filename, code] of Object.entries(files)) {
    if (code.includes('extends Store') || code.includes('new Store(')) {
      storeModules.add(`/virtual/${filename}`)
    }
    if (code.includes('extends Component')) {
      componentModules.add(`/virtual/${filename}`)
      classComponentModules.add(`/virtual/${filename}`)
    } else if (/export\s+default\s+function\b/.test(code) || /export\s+default\s*\([^)]*\)\s*=>\s*/.test(code)) {
      componentModules.add(`/virtual/${filename}`)
      functionComponentModules.add(`/virtual/${filename}`)
    }
  }

  for (const [filename, code] of Object.entries(files)) {
    try {
      const parsed = parseSource(code)
      if (!parsed) {
        compiledModules[filename] = code
        continue
      }

      let { ast, imports } = parsed
      const { functionalComponentInfo, hasJSX } = parsed

      if (!hasJSX) {
        const output = generate(ast)
        compiledModules[filename] = output.code
        continue
      }

      if (functionalComponentInfo) {
        convertFunctionalToClass(ast, functionalComponentInfo, imports)
        const freshCode = generate(ast).code
        const freshParsed = parseSource(freshCode)
        if (freshParsed) {
          ast = freshParsed.ast
          imports = freshParsed.imports
        }
      }

      const virtualSourceFile = `/virtual/${filename}`
      const storeImports = new Map<string, string>()
      const knownComponentImports = new Set<string>()
      const knownClassComponentImports = new Set<string>()
      const knownFactoryComponentImports = new Set<string>()
      const namedImportSources = new Map<string, string>()

      traverse(ast, {
        ImportDeclaration(path: any) {
          const source = path.node.source.value
          if (!isComponentImportSource(source)) return

          const resolvedName = source.startsWith('.') ? resolveVirtualFile(source, files) : null
          const resolvedPath = resolvedName ? `/virtual/${resolvedName}` : null
          const isComp = resolvedPath ? componentModules.has(resolvedPath) : false

          path.node.specifiers.forEach((spec: any) => {
            if (isComp) knownComponentImports.add(spec.local.name)
            if (resolvedPath && classComponentModules.has(resolvedPath)) knownClassComponentImports.add(spec.local.name)
            if (resolvedPath && functionComponentModules.has(resolvedPath))
              knownFactoryComponentImports.add(spec.local.name)

            if (spec.type === 'ImportDefaultSpecifier') {
              if (resolvedPath && !storeModules.has(resolvedPath)) return
              if (!source.startsWith('.') && source.startsWith('@geajs/core') && spec.local.name === 'router') {
                storeImports.set(spec.local.name, source)
              } else if (resolvedPath && storeModules.has(resolvedPath)) {
                storeImports.set(spec.local.name, source)
              }
            } else if (spec.type === 'ImportSpecifier') {
              namedImportSources.set(spec.local.name, source)
              if (resolvedPath && storeModules.has(resolvedPath)) {
                storeImports.set(spec.local.name, source)
              } else if (source.startsWith('@geajs/core') && spec.local.name === 'router') {
                storeImports.set(spec.local.name, source)
              }
              const importedName = spec.imported?.name ?? spec.local.name
              const geaCoreBaseClasses = ['Component', 'Store']
              if (
                source === '@geajs/core' &&
                isComponentTag(importedName) &&
                !geaCoreBaseClasses.includes(importedName)
              ) {
                knownComponentImports.add(spec.local.name)
              }
            }
          })
        },
        VariableDeclarator(path: any) {
          const init = path.node.init
          if (
            init &&
            init.type === 'NewExpression' &&
            init.callee?.type === 'Identifier' &&
            namedImportSources.has(init.callee.name) &&
            path.node.id?.type === 'Identifier'
          ) {
            const source = namedImportSources.get(init.callee.name)!
            storeImports.set(path.node.id.name, source)
          }
        },
      })

      let transformed = false
      // Use the closure-compiled transformer (Phase 3+). Pass source code (not AST)
      // and splice the resulting AST back in so downstream passes still run.
      const emitted = transformFile(code, virtualSourceFile, {
        directClassComponents: knownClassComponentImports,
        directFactoryComponents: knownFactoryComponentImports,
      })
      if (emitted.changed) {
        const reparsed = parseSource(emitted.code)
        if (reparsed) {
          ast.program.body = reparsed.ast.program.body
          transformed = true
        }
      }

      if (transformed) {
        ensureGeaCompilerSymbolImports(ast)
        const output = generate(ast)
        compiledModules[filename] = output.code
      } else {
        compiledModules[filename] = code
      }
    } catch (error: any) {
      errors.push({ file: filename, message: error.message || String(error) })
      compiledModules[filename] = code
    }
  }

  return { compiledModules, errors }
}
