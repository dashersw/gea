import type { Expression } from '@babel/types'
import { t } from '../../utils/babel-interop.ts'
import { substituteBindings } from '../emit/emit-substitution.ts'

/** Read through the row observable so primitive replacements remain reactive too. */
export function useObservableItem(createItem: Expression, importsNeeded: Set<string>): void {
  if (!t.isArrowFunctionExpression(createItem)) throw new Error('Expected a keyed-list row factory')
  const item = createItem.params[0]
  // Outer row substitutions also enter nested row factories. Never reuse a
  // nested factory's parameter name, or outer reads would bind to its item.
  const names = new Set<string>()
  t.traverseFast(createItem, (node) => {
    if (t.isIdentifier(node)) names.add(node.name)
  })
  let name = '__geaItemObservable'
  while (names.has(name)) name += '_'
  const observable = t.identifier(name)
  const read = t.callExpression(t.identifier('readItem'), [observable])
  const bindings = new Map<string, Expression>()
  if (t.isIdentifier(item)) {
    bindings.set(item.name, read)
  } else {
    // Preserve array/nested/rest/default destructuring semantics, but evaluate
    // the pattern against the current row at each read instead of capturing
    // the first item's values in the row factory's parameters.
    for (const name of Object.keys(t.getBindingIdentifiers(item))) {
      bindings.set(
        name,
        t.callExpression(t.arrowFunctionExpression([t.cloneNode(item, true)], t.identifier(name)), [
          t.cloneNode(read, true),
        ]),
      )
    }
  }
  createItem.body = substituteBindings(createItem.body, bindings)
  createItem.params[0] = observable
  importsNeeded.add('readItem')
}
