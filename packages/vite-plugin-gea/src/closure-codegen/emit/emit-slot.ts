import type { Expression, Statement } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

import { emitConditionalSlot } from './emit-conditional.ts'
import type { EmitContext } from './emit-context.ts'
import { containsJsx } from './emit-jsx-lowering.ts'
import { substituteBindings } from './emit-substitution.ts'
import { emitKeyedListSlot } from '../keyed-list/emit-keyed-list.ts'
import { emitMountSlot } from './emit-mount.ts'
import { expressionToPathOrGetter } from './emit-reactive-source.ts'
import { eventHandlerNeedsCurrentTarget } from './emit-event-current-target.ts'
import { normalizeEventAttrName, type Slot } from '../generator.ts'

export function emitSlot(slot: Slot, stmts: Statement[], ctx: EmitContext): void {
  // Substitute destructured identifiers with their source expressions so tracking works
  slot.expr = substituteBindings(slot.expr, ctx.bindings)
  if (slot.kind === 'text') {
    const markerId = t.identifier('marker' + slot.index)
    const textId = t.identifier('t' + slot.index)
    const pathOrGetter = expressionToPathOrGetter(slot.expr, ctx)
    if ((slot as any).directText) {
      // Template HTML emitted a text-node placeholder at this position;
      // the marker walk already points at the Text node. Skip createTextNode
      // + replaceWith entirely — alias `t<N>` = `marker<N>` so reactiveText
      // / patchRow emission stays identical to the comment-marker path.
      stmts.push(t.variableDeclaration('const', [t.variableDeclarator(textId, markerId)]))
    } else {
      stmts.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            textId,
            t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('createTextNode')), [
              t.stringLiteral(''),
            ]),
          ),
        ]),
        t.expressionStatement(t.callExpression(t.memberExpression(markerId, t.identifier('replaceWith')), [textId])),
      )
    }
    if (ctx.oneShotProps) {
      stmts.push(emitTextWrite(textId, slot.expr as Expression, slot.index, ctx))
    } else {
      const helperName = canUseScalarTextHelper(slot.expr as Expression) ? 'reactiveTextValue' : 'reactiveText'
      ctx.importsNeeded.add(helperName)
      stmts.push(
        t.expressionStatement(
          t.callExpression(t.identifier(helperName), [textId, t.identifier('d'), ctx.reactiveRoot, pathOrGetter.value]),
        ),
      )
    }
    return
  }
  if (slot.kind === 'event') {
    const attrName: string = slot.payload.attrName
    const eventType = normalizeEventAttrName(attrName)
    const fnId = t.identifier('h' + slot.index)
    // Auto-bind method references: `event={this.method}` → `e => this.method(e)`
    // so `this` inside the method body resolves to the component, not the DOM
    // node. Arrow-bound handlers and bare function expressions pass through.
    let handlerExpr: Expression = slot.expr as Expression
    const isDirectPropHandler = ctx.oneShotProps && (isPropsMember(handlerExpr) || isOneShotPropLocal(handlerExpr, ctx))
    const needsCurrentTarget = isDirectPropHandler ? false : eventHandlerNeedsCurrentTarget(handlerExpr)
    if (t.isMemberExpression(handlerExpr) && t.isThisExpression(handlerExpr.object) && !handlerExpr.computed) {
      const ev = t.identifier('e')
      handlerExpr = t.arrowFunctionExpression([ev], t.callExpression(handlerExpr, [ev]))
    }
    const reconcileExpr = ctx._inputValueExprByEventSlot?.get(slot.index)
    if (reconcileExpr) {
      const ev = t.identifier('e')
      const valueId = t.identifier('__v')
      const stringId = t.identifier('__s')
      handlerExpr = t.arrowFunctionExpression(
        [ev],
        t.blockStatement([
          t.expressionStatement(t.callExpression(handlerExpr, [ev])),
          t.variableDeclaration('const', [
            t.variableDeclarator(valueId, substituteBindings(reconcileExpr, ctx.bindings) as Expression),
          ]),
          t.ifStatement(
            t.binaryExpression('!==', valueId, t.identifier('undefined')),
            t.blockStatement([
              t.variableDeclaration('const', [
                t.variableDeclarator(
                  stringId,
                  t.conditionalExpression(
                    t.binaryExpression('==', valueId, t.nullLiteral()),
                    t.stringLiteral(''),
                    t.callExpression(t.identifier('String'), [valueId]),
                  ),
                ),
              ]),
              t.ifStatement(
                t.binaryExpression(
                  '!==',
                  t.memberExpression(t.identifier('evt' + slot.index), t.identifier('value')),
                  stringId,
                ),
                t.blockStatement([
                  t.expressionStatement(
                    t.assignmentExpression(
                      '=',
                      t.memberExpression(t.identifier('evt' + slot.index), t.identifier('value')),
                      stringId,
                    ),
                  ),
                ]),
              ),
            ]),
          ),
        ]),
      )
    }
    const inlineHandler = isDirectPropHandler && !reconcileExpr ? handlerExpr : null
    if (!inlineHandler) stmts.push(t.variableDeclaration('const', [t.variableDeclarator(fnId, handlerExpr)]))
    // Listener installation is deferred: compileJsxToBlock groups event slots
    // by eventType after the slot-emit loop and emits a SINGLE
    // `delegateEvent(root, type, handlers, d)` call per (root, type) pair.
    // Record this slot so the grouper can pick it up.
    if (!ctx._pendingEvents) ctx._pendingEvents = []
    ctx._pendingEvents.push({
      eventType,
      slotIndex: slot.index,
      needsCurrentTarget,
      handler: inlineHandler ?? undefined,
    })
    return
  }
  if (slot.kind === 'html') {
    // `dangerouslySetInnerHTML={expr}` — reactive innerHTML assignment.
    // Matches the React API name; implementation is a thin `el.innerHTML = v`
    // on change, so app code using rich-text editors (e.g. Quill) can hand
    // Gea the rendered HTML string and have it mounted into a node.
    const elId = t.identifier('el' + slot.index)
    const pathOrGetter = expressionToPathOrGetter(slot.expr, ctx)
    ctx.importsNeeded.add('reactiveHtml')
    stmts.push(
      t.expressionStatement(
        t.callExpression(t.identifier('reactiveHtml'), [elId, t.identifier('d'), ctx.reactiveRoot, pathOrGetter.value]),
      ),
    )
    return
  }
  if (
    slot.kind === 'attr' ||
    slot.kind === 'bool' ||
    slot.kind === 'class' ||
    slot.kind === 'style' ||
    slot.kind === 'value'
  ) {
    const elId = t.identifier('el' + slot.index)
    const pathOrGetter = expressionToPathOrGetter(slot.expr, ctx)
    const attrName: string = slot.payload?.attrName ?? ''

    if (slot.kind === 'attr') {
      if (ctx.oneShotProps) {
        stmts.push(...emitAttrWrite(elId, attrName, slot.expr as Expression, slot.index, ctx))
      } else {
        ctx.importsNeeded.add('reactiveAttr')
        stmts.push(
          t.expressionStatement(
            t.callExpression(t.identifier('reactiveAttr'), [
              elId,
              t.identifier('d'),
              ctx.reactiveRoot,
              t.stringLiteral(attrName),
              pathOrGetter.value,
            ]),
          ),
        )
      }
    } else if (slot.kind === 'bool') {
      const isVisible = attrName === 'visible'
      const target = isVisible ? 'display' : attrName
      const helperName = isVisible ? 'reactiveBool' : 'reactiveBoolAttr'
      ctx.importsNeeded.add(helperName)
      const args = [elId, t.identifier('d'), ctx.reactiveRoot, t.stringLiteral(target), pathOrGetter.value]
      if (isVisible) args.push(t.stringLiteral('visible'))
      stmts.push(t.expressionStatement(t.callExpression(t.identifier(helperName), args)))
    } else if (slot.kind === 'class') {
      const helperName = isStringClassExpression(slot.expr as Expression) ? 'reactiveClassName' : 'reactiveClass'
      ctx.importsNeeded.add(helperName)
      stmts.push(
        t.expressionStatement(
          t.callExpression(t.identifier(helperName), [elId, t.identifier('d'), ctx.reactiveRoot, pathOrGetter.value]),
        ),
      )
    } else if (slot.kind === 'style') {
      ctx.importsNeeded.add('reactiveStyle')
      stmts.push(
        t.expressionStatement(
          t.callExpression(t.identifier('reactiveStyle'), [
            elId,
            t.identifier('d'),
            ctx.reactiveRoot,
            pathOrGetter.value,
          ]),
        ),
      )
    } else if (slot.kind === 'value') {
      ctx.importsNeeded.add('reactiveValueRead')
      stmts.push(
        t.expressionStatement(
          t.callExpression(t.identifier('reactiveValueRead'), [
            elId,
            t.identifier('d'),
            ctx.reactiveRoot,
            pathOrGetter.value,
          ]),
        ),
      )
    }
    return
  }
  if (slot.kind === 'ref') {
    // `ref={this.foo}` → assign the element to `this.foo` after clone. The JSX
    // expression is a member chain (e.g. `this.inputEl`); compile-time we emit
    // the assignment with the substituted LHS.
    const elId = t.identifier('el' + slot.index)
    const target = substituteBindings(slot.expr, ctx.bindings)
    if (t.isMemberExpression(target) || t.isIdentifier(target)) {
      stmts.push(t.expressionStatement(t.assignmentExpression('=', target as any, elId)))
    }
    return
  }
  if (slot.kind === 'mount') {
    emitMountSlot(slot, stmts, ctx)
    return
  }
  if (slot.kind === 'direct-fn') {
    emitDirectFnSlot(slot, stmts, ctx)
    return
  }
  if (slot.kind === 'conditional') {
    emitConditionalSlot(slot, stmts, ctx)
    return
  }
  if (slot.kind === 'keyed-list') {
    emitKeyedListSlot(slot, stmts, ctx)
    return
  }
  throw new Error(`emit: unsupported slot kind '${slot.kind}'`)
}

function canUseScalarTextHelper(expr: Expression): boolean {
  if (containsJsx(expr)) return false
  if (isChildrenExpression(expr)) return false
  if (
    t.isIdentifier(expr) ||
    t.isMemberExpression(expr) ||
    t.isStringLiteral(expr) ||
    t.isNumericLiteral(expr) ||
    t.isBooleanLiteral(expr) ||
    t.isNullLiteral(expr) ||
    t.isTemplateLiteral(expr)
  ) {
    return true
  }
  if (t.isBinaryExpression(expr)) {
    return canUseScalarTextHelper(expr.left as Expression) && canUseScalarTextHelper(expr.right as Expression)
  }
  if (t.isLogicalExpression(expr)) {
    return canUseScalarTextHelper(expr.left as Expression) && canUseScalarTextHelper(expr.right as Expression)
  }
  if (t.isConditionalExpression(expr)) {
    return canUseScalarTextHelper(expr.consequent as Expression) && canUseScalarTextHelper(expr.alternate as Expression)
  }
  if (t.isUnaryExpression(expr)) return true
  if (t.isTSAsExpression(expr) || t.isTSTypeAssertion(expr) || t.isTSNonNullExpression(expr)) {
    return canUseScalarTextHelper(expr.expression as Expression)
  }
  return false
}

function isChildrenExpression(expr: Expression): boolean {
  if (t.isIdentifier(expr, { name: 'children' })) return true
  if (t.isMemberExpression(expr) && !expr.computed && t.isIdentifier(expr.property, { name: 'children' })) {
    return true
  }
  if (t.isTSAsExpression(expr) || t.isTSTypeAssertion(expr) || t.isTSNonNullExpression(expr)) {
    return isChildrenExpression(expr.expression as Expression)
  }
  return false
}

function isStringClassExpression(expr: Expression): boolean {
  if (t.isStringLiteral(expr) || t.isTemplateLiteral(expr)) return true
  if (t.isConditionalExpression(expr)) {
    return (
      isStringClassExpression(expr.consequent as Expression) && isStringClassExpression(expr.alternate as Expression)
    )
  }
  if (t.isBinaryExpression(expr, { operator: '+' })) {
    return isStringClassExpression(expr.left as Expression) || isStringClassExpression(expr.right as Expression)
  }
  return false
}

function emitTextWrite(textId: Expression, expr: Expression, slotIndex: number, ctx: EmitContext): Statement {
  if (isOneShotStringPropLocal(expr, ctx)) {
    return t.expressionStatement(
      t.assignmentExpression('=', t.memberExpression(textId, t.identifier('nodeValue')), expr),
    )
  }
  const value = t.identifier('__v' + slotIndex)
  return t.blockStatement([
    t.variableDeclaration('const', [t.variableDeclarator(value, expr)]),
    t.expressionStatement(
      t.assignmentExpression(
        '=',
        t.memberExpression(textId, t.identifier('nodeValue')),
        t.templateLiteral(
          [t.templateElement({ raw: '', cooked: '' }), t.templateElement({ raw: '', cooked: '' }, true)],
          [t.logicalExpression('??', t.cloneNode(value), t.stringLiteral(''))],
        ),
      ),
    ),
  ])
}

function emitAttrWrite(
  elId: Expression,
  attrName: string,
  expr: Expression,
  slotIndex: number,
  ctx: EmitContext,
): Statement[] {
  if (isOneShotStringPropLocal(expr, ctx)) {
    const attrTarget =
      attrName === 'id'
        ? t.memberExpression(elId, t.identifier('id'))
        : t.memberExpression(elId, t.identifier('setAttribute'))
    if (attrName === 'id') return [t.expressionStatement(t.assignmentExpression('=', attrTarget, expr))]
    return [t.expressionStatement(t.callExpression(attrTarget, [t.stringLiteral(attrName), expr]))]
  }
  const value = t.identifier('__v' + slotIndex)
  return [
    t.variableDeclaration('const', [t.variableDeclarator(value, expr)]),
    t.ifStatement(
      t.binaryExpression('==', t.cloneNode(value), t.nullLiteral()),
      t.expressionStatement(
        t.callExpression(t.memberExpression(elId, t.identifier('removeAttribute')), [t.stringLiteral(attrName)]),
      ),
      t.expressionStatement(
        t.callExpression(t.memberExpression(elId, t.identifier('setAttribute')), [
          t.stringLiteral(attrName),
          t.callExpression(t.identifier('String'), [t.cloneNode(value)]),
        ]),
      ),
    ),
  ]
}

function emitDirectFnSlot(slot: Slot, stmts: Statement[], ctx: EmitContext): void {
  const nodeId = t.identifier('__n' + slot.index)
  const positional = ctx.directFnComponentParams?.get(slot.payload.tag)
  const needsDisposer = ctx.directFnNoDisposer?.has(slot.payload.tag) !== true
  const disposerArg = needsDisposer ? [t.identifier('d')] : []
  const args = positional
    ? buildDirectPropsArgs(slot.payload.attrs, positional.props, ctx).concat(disposerArg)
    : [buildDirectPropsObject(slot.payload.attrs, ctx), ...disposerArg]
  const callee =
    args.length === 0 ? (ctx.directFnFactoryAliases?.get(slot.payload.tag) ?? slot.payload.tag) : slot.payload.tag
  const appendOnly = slot.payload.appendOnly
  if (appendOnly) {
    const parentId = t.identifier('parent' + appendOnly.groupId)
    const fragId = t.identifier('__f' + appendOnly.groupId)
    if (appendOnly.total > 1 && appendOnly.position === 0) {
      stmts.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            fragId,
            t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('createDocumentFragment')), []),
          ),
        ]),
      )
    }
    stmts.push(
      t.variableDeclaration('const', [t.variableDeclarator(nodeId, t.callExpression(t.identifier(callee), args))]),
      t.expressionStatement(
        t.callExpression(t.memberExpression(appendOnly.total > 1 ? fragId : parentId, t.identifier('appendChild')), [
          nodeId,
        ]),
      ),
    )
    emitDirectFnEventInstalls(slot, nodeId, stmts, ctx)
    if (appendOnly.total > 1 && appendOnly.position === appendOnly.total - 1) {
      stmts.push(
        t.expressionStatement(t.callExpression(t.memberExpression(parentId, t.identifier('appendChild')), [fragId])),
      )
    }
    return
  }
  const anchorId = t.identifier('anchor' + slot.index)
  stmts.push(
    t.variableDeclaration('const', [t.variableDeclarator(nodeId, t.callExpression(t.identifier(callee), args))]),
    t.expressionStatement(t.callExpression(t.memberExpression(anchorId, t.identifier('replaceWith')), [nodeId])),
  )
  emitDirectFnEventInstalls(slot, nodeId, stmts, ctx)
}

function emitDirectFnEventInstalls(slot: Slot, root: Expression, stmts: Statement[], ctx: EmitContext): void {
  const events = ctx.directFnEventTypes?.get(slot.payload.tag)
  if (!events) return
  for (const eventType of events.eventTypes) emitEmptyEventInstall(root, eventType, false, stmts, ctx)
  for (const eventType of events.fastEventTypes) emitEmptyEventInstall(root, eventType, true, stmts, ctx)
}

function emitEmptyEventInstall(
  root: Expression,
  eventType: string,
  fast: boolean,
  stmts: Statement[],
  ctx: EmitContext,
): void {
  const helperName = fast && eventType === 'click' ? 'delegateClick' : 'delegateEvent'
  if (helperName === 'delegateClick') {
    if (ctx._documentClickDelegateInstalled || pendingEventsWillInstallDelegateClick(ctx)) return
    ctx._documentClickDelegateInstalled = true
    ctx.importsNeeded.add('ensureClickDelegate')
    stmts.push(t.expressionStatement(t.callExpression(t.identifier('ensureClickDelegate'), [t.cloneNode(root)])))
    return
  }
  ctx.importsNeeded.add(helperName)
  const args = [t.cloneNode(root), t.stringLiteral(eventType), t.arrayExpression([]), t.identifier('d')]
  stmts.push(t.expressionStatement(t.callExpression(t.identifier(helperName), args)))
}

function pendingEventsWillInstallDelegateClick(ctx: EmitContext): boolean {
  const events = ctx._pendingEvents
  if (!events || events.length === 0) return false
  let hasClick = false
  for (const event of events) {
    if (event.eventType !== 'click') continue
    hasClick = true
    if (event.needsCurrentTarget) return false
  }
  return hasClick
}

function buildDirectPropsArgs(attrs: any[], propNames: string[], ctx: EmitContext): Expression[] {
  const values = new Map<string, Expression>()
  for (const attr of attrs) {
    if (!t.isJSXAttribute(attr)) continue
    const name = getAttrName(attr)
    if (!name || name === 'key') continue
    values.set(name, getDirectAttrValue(attr, ctx) ?? t.unaryExpression('void', t.numericLiteral(0), true))
  }
  appendStaticChildrenValue(values, attrs)
  return propNames.map((name) => values.get(name) ?? t.unaryExpression('void', t.numericLiteral(0), true))
}

function buildDirectPropsObject(attrs: any[], ctx: EmitContext): Expression {
  const properties: any[] = []
  const values = new Map<string, Expression>()
  for (const attr of attrs) {
    if (!t.isJSXAttribute(attr)) continue
    const name = getAttrName(attr)
    if (!name) continue
    if (name === 'key') continue
    const value = getDirectAttrValue(attr, ctx)
    if (!value) continue
    values.set(name, value)
  }
  appendStaticChildrenValue(values, attrs)
  for (const [name, value] of values) {
    properties.push(buildDirectObjectProperty(name, value))
  }
  return t.objectExpression(properties)
}

function appendStaticChildrenValue(values: Map<string, Expression>, attrs: any[]): void {
  if (values.has('children')) return
  const firstAttr = attrs.find((attr) => t.isJSXAttribute(attr))
  const children = firstAttr?.extra?.geaStaticChildren
  if (typeof children === 'string') values.set('children', t.stringLiteral(children))
}

function buildDirectObjectProperty(name: string, value: Expression): any {
  const isValidIdent = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
  const keyNode = isValidIdent ? t.identifier(name) : t.stringLiteral(name)
  return t.objectProperty(keyNode, value)
}

function getAttrName(attr: any): string | null {
  if (t.isJSXIdentifier(attr.name)) return attr.name.name
  if (t.isJSXNamespacedName(attr.name)) return `${attr.name.namespace.name}:${attr.name.name.name}`
  return null
}

function getDirectAttrValue(attr: any, ctx: EmitContext): Expression | null {
  if (!attr.value) return t.booleanLiteral(true)
  if (t.isStringLiteral(attr.value)) return t.stringLiteral(attr.value.value)
  if (t.isJSXExpressionContainer(attr.value))
    return substituteBindings(attr.value.expression, ctx.bindings) as Expression
  return null
}

function isPropsMember(expr: Expression): boolean {
  return (
    t.isMemberExpression(expr) &&
    t.isIdentifier(expr.object, { name: 'props' }) &&
    !expr.computed &&
    t.isIdentifier(expr.property)
  )
}

function isOneShotPropLocal(expr: Expression, ctx: EmitContext): boolean {
  return t.isIdentifier(expr) && ctx.oneShotPropLocals?.has(expr.name) === true
}

function isOneShotStringPropLocal(expr: Expression, ctx: EmitContext): boolean {
  return t.isIdentifier(expr) && ctx.oneShotStringPropLocals?.has(expr.name) === true
}
