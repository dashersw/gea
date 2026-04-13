import type { BlockStatement, Expression } from '@babel/types'

import { applyPatchRowPlan } from './keyed-list-patch-apply.ts'
import { collectPatchRowPlan } from './keyed-list-patch-scan.ts'

export { extractSharedHandlersFromBlock, isLowercaseJsxTagRoot } from './keyed-list-shared-handlers.ts'
export {
  createItemBodyReferencesItemInReactiveGetter,
  createItemBodyReferencesRowDisposer,
} from './keyed-list-usage.ts'

export function extractPatchRowFromBlock(block: BlockStatement, itemName: string, idxParam: any): Expression | null {
  const plan = collectPatchRowPlan(block, itemName)
  if (plan.patchStmts.length === 0) return null
  return applyPatchRowPlan(block, plan, itemName, idxParam)
}
