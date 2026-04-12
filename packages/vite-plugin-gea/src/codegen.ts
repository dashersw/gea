import type { File } from '@babel/types'
import _generate from '@babel/generator'

// Handle ESM / CJS compat for @babel/generator
const generate = (typeof (_generate as any).default === 'function'
  ? (_generate as any).default
  : _generate) as typeof _generate

/**
 * Convert a Babel AST back to source code.
 */
export function codegen(ast: File): string {
  const { code } = generate(ast, {
    retainLines: false,
    compact: false,
    jsescOption: { minimal: true },
  })
  return code
}
