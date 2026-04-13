import type { ClassMethod, Expression, Statement } from '@babel/types'

import { t } from '../../src/utils/babel-interop.ts'
import type { TemplateSpec } from '../../src/closure-codegen/generator.ts'
import { createEmitContext } from '../../src/closure-codegen/emit/emit-context.ts'
import { emitWalkCapture, findInputValueReconciliations } from '../../src/closure-codegen/emit/emit-core.ts'
import { emitSlot } from '../../src/closure-codegen/emit/emit-slot.ts'
import { emitTemplateCloneExpression } from '../../src/closure-codegen/emit/template-decl.ts'

let tplCounter = 0

export function resetTemplateCounter(): void {
  tplCounter = 0
}

export function nextTemplateName(): string {
  return '_tpl' + tplCounter++
}

export function emitCreateTemplateMethod(
  spec: TemplateSpec,
  tplName: string,
): { method: ClassMethod; importsNeeded: Set<string> } {
  const ctx = createEmitContext()
  const stmts: Statement[] = []
  stmts.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(t.identifier('root'), emitTemplateCloneExpression(tplName, spec.html)),
    ]),
  )
  for (const slot of spec.slots) emitWalkCapture(slot, stmts)
  ctx._pendingEvents = []
  ctx._inputValueExprByEventSlot = findInputValueReconciliations(spec)
  for (const slot of spec.slots) emitSlot(slot, stmts, ctx)
  const events = ctx._pendingEvents
  if (events.length > 0) {
    ctx.importsNeeded.add('delegateEvent')
    const groups = new Map<string, typeof events>()
    for (const event of events) {
      const slots = groups.get(event.eventType)
      if (slots) slots.push(event)
      else groups.set(event.eventType, [event])
    }
    for (const [eventType, slots] of groups) {
      const pairs = slots.map((event) => {
        const pair: Expression[] = [t.identifier('evt' + event.slotIndex), t.identifier('h' + event.slotIndex)]
        if (!event.needsCurrentTarget) pair.push(t.booleanLiteral(false))
        return t.arrayExpression(pair)
      })
      stmts.push(
        t.expressionStatement(
          t.callExpression(t.identifier('delegateEvent'), [
            t.identifier('root'),
            t.stringLiteral(eventType),
            t.arrayExpression(pairs),
            t.identifier('d'),
          ]),
        ),
      )
    }
  }
  stmts.push(t.returnStatement(t.identifier('root')))
  const method = t.classMethod(
    'method',
    t.identifier('GEA_CREATE_TEMPLATE'),
    [t.identifier('d')],
    t.blockStatement(stmts),
    true,
    false,
  )
  return { method, importsNeeded: ctx.importsNeeded }
}
