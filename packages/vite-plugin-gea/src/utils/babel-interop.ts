/**
 * Single-source Babel interop.
 *
 * @babel/traverse and @babel/generator sometimes wrap their default export
 * inside a `{ default: fn }` object depending on the CJS/ESM interop layer.
 * Every file in the compiler imports from here instead of handling this itself.
 */
import _traverse from '@babel/traverse'
import _generate from '@babel/generator'
import * as t from '@babel/types'

type TraverseFn = typeof _traverse
type GenerateFn = typeof _generate

export const traverse: TraverseFn =
  typeof (_traverse as any).default === 'function' ? (_traverse as any).default : _traverse

export const generate: GenerateFn =
  typeof (_generate as any).default === 'function' ? (_generate as any).default : _generate

export { t }
export type { NodePath } from '@babel/traverse'
