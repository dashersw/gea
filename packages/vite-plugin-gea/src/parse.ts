import { parse as babelParse } from '@babel/parser'
import type { File } from '@babel/types'

/**
 * Parse TypeScript / TSX / JSX source into a Babel AST.
 */
export function parse(source: string): File {
  return babelParse(source, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  })
}
