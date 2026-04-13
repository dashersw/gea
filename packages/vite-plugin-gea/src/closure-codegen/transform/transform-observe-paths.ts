import { parse } from '@babel/parser'
import type { File } from '@babel/types'

import { generate, t } from '../../utils/babel-interop.ts'

export interface ObservePathTransformResult {
  code: string
  changed: boolean
}

export function transformDottedObserveCalls(source: string): ObservePathTransformResult | null {
  if (!source.includes('observe') || !source.includes('.')) return null

  let ast: File
  try {
    ast = parse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'classProperties', 'classPrivateProperties', 'classPrivateMethods'],
      errorRecovery: false,
    })
  } catch {
    return null
  }

  let changed = false
  const visit = (node: any): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) visit(node[i])
      return
    }

    if (
      t.isCallExpression(node) &&
      t.isMemberExpression(node.callee) &&
      !node.callee.computed &&
      t.isIdentifier(node.callee.property, { name: 'observe' })
    ) {
      const first = node.arguments[0]
      if (t.isStringLiteral(first)) {
        const parts = first.value.split('.')
        if (parts.length > 1 && parts.every((part) => part.length > 0)) {
          node.arguments[0] = t.arrayExpression(parts.map((part) => t.stringLiteral(part)))
          changed = true
        }
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
      visit(node[key])
    }
  }
  visit(ast.program)

  if (!changed) return null
  return {
    code: generate(ast, { retainLines: false, compact: false, jsescOption: { minimal: true } }).code,
    changed: true,
  }
}
