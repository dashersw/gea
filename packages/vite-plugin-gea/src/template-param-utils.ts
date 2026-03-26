import * as t from '@babel/types'

/** Left-hand binding of `template`'s first param after unwrap (`= default`, TS parameter props). */
export function getTemplateParamBinding(
  param: t.FunctionParameter | undefined | null,
): t.Identifier | t.ObjectPattern | undefined {
  if (param == null) return undefined
  let node: t.Node = param
  if (t.isTSParameterProperty(param)) node = param.parameter
  if (t.isAssignmentPattern(node)) node = node.left
  if (t.isIdentifier(node) || t.isObjectPattern(node)) return node
  return undefined
}
