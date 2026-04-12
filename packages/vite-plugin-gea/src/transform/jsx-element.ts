import * as t from '@babel/types'
import type { SubstitutionMap } from '../analyze/index.js'
import type { RuntimeHelper } from '../utils.js'
import { isUpperCase, DOM_EVENTS, ATTR_TO_PROP, DOM_PROPERTIES } from '../utils.js'
import { classifyAttributes } from './jsx-attributes.js'
import { classifyChildren } from './jsx-children.js'
import { substituteExpression, exprToString } from './jsx-expression.js'
import { isConditionalPattern, getConditionalParts } from './conditional.js'
import { isKeyedListPattern, extractKeyedListInfo } from './keyed-list.js'

/** Check if an expression accesses `.children` (e.g., `props.children`) — may return DOM nodes */
function isChildrenAccess(node: t.Expression): boolean {
  return t.isMemberExpression(node) && t.isIdentifier(node.property, { name: 'children' })
}

/**
 * Check if an expression may resolve to a DOM node (not just text).
 * Any prop access may carry a component instance or DOM node — e.g., `header` from
 * `template({ header })` or `props.sidebar`. These need reactiveContent, not textContent.
 */
function isPropSlotAccess(node: t.Expression, subs: SubstitutionMap): boolean {
  // Direct member access: props.X, this.props.X, __props.X
  if (t.isMemberExpression(node) && t.isIdentifier(node.property)) {
    const obj = node.object
    if (t.isIdentifier(obj, { name: '__props' }) || t.isIdentifier(obj, { name: 'props' })) return true
    if (t.isMemberExpression(obj) && t.isIdentifier(obj.property, { name: 'props' }) && t.isThisExpression(obj.object)) return true
  }
  // Destructured prop identifier — check if it maps to __props.X in substitutions
  if (t.isIdentifier(node) && subs.has(node.name)) {
    const sub = subs.get(node.name)!
    // Substitution can be a string like "__props.header" or an AST node
    if (typeof sub === 'string' && sub.startsWith('__props.')) return true
    if (typeof sub !== 'string' && t.isMemberExpression(sub) && t.isIdentifier(sub.object, { name: '__props' })) return true
  }
  // Call expression on a prop: props.renderX() or renderX()
  if (t.isCallExpression(node)) {
    const callee = node.callee as t.Expression
    if (t.isMemberExpression(callee) && t.isIdentifier(callee.object, { name: 'props' })) return true
    if (t.isMemberExpression(callee) && t.isIdentifier(callee.object, { name: '__props' })) return true
    if (t.isIdentifier(callee) && subs.has(callee.name)) {
      const sub = subs.get(callee.name)!
      if (typeof sub === 'string' && sub.startsWith('__props.')) return true
      if (typeof sub !== 'string' && t.isMemberExpression(sub) && t.isIdentifier(sub.object, { name: '__props' })) return true
    }
  }
  return false
}

/**
 * Check if an expression AST node contains JSXElement nodes anywhere in its subtree.
 * Used to detect expressions like `.map(item => <Component />)` that produce DOM nodes.
 */
function containsJSX(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (containsJSX(node[i])) return true
    }
    return false
  }
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') return true
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue
    if (containsJSX(node[key])) return true
  }
  return false
}

export interface TransformContext {
  subs: SubstitutionMap
  usedHelpers: Set<RuntimeHelper>
  elementCounter: { value: number }
  anchorCounter: { value: number }
  compCounter: { value: number }
  templateDeclarations: t.Statement[]
  templateCounter: { value: number }
}

/**
 * Transform a JSX element into an array of imperative DOM statements.
 * Returns [statements, resultIdentifier].
 */
export function transformJSXElement(
  jsxEl: t.JSXElement,
  ctx: TransformContext,
): [t.Statement[], t.Identifier] {
  const opening = jsxEl.openingElement
  const tagName = getTagName(opening)

  if (isUpperCase(tagName)) {
    return transformComponentElement(jsxEl, tagName, ctx)
  }

  return transformHTMLElement(jsxEl, tagName, ctx)
}

function getTagName(opening: t.JSXOpeningElement): string {
  if (t.isJSXIdentifier(opening.name)) return opening.name.name
  if (t.isJSXMemberExpression(opening.name)) {
    return exprToString(jsxMemberToExpression(opening.name))
  }
  return ''
}

function jsxMemberToExpression(node: t.JSXMemberExpression): t.MemberExpression {
  const obj = t.isJSXIdentifier(node.object)
    ? t.identifier(node.object.name)
    : jsxMemberToExpression(node.object as t.JSXMemberExpression)
  return t.memberExpression(obj, t.identifier(node.property.name))
}

/**
 * A dynamic child entry in source order.
 */
type OrderedChild = {
  /** Index of the next static HTML element child — used to insertBefore the correct sibling */
  nextStaticElementIndex: number
} & (
  | { kind: 'reactiveText'; childIndex: number; expression: t.Expression; sole?: boolean }
  | { kind: 'conditional'; condition: t.Expression; element: t.JSXElement; elseElement?: t.JSXElement; fragment?: t.JSXFragment }
  | { kind: 'keyedList'; collection: t.Expression; itemParam: t.Identifier; indexParam?: t.Identifier; keyExpression: t.Expression; element: t.JSXElement; guardCondition?: t.Expression; preStatements?: t.Statement[] }
  | { kind: 'componentChild'; node: t.JSXElement }
  | { kind: 'dynamicContent'; expression: t.Expression }
)

/**
 * Information about a node in the static template tree that needs dynamic wiring.
 */
interface DynamicBinding {
  /** Path of firstElementChild / nextElementSibling steps from root to this node */
  walkPath: WalkStep[]
  /** Dynamic attributes to wire */
  dynamicAttrs: { name: string; expression: t.Expression; isProperty: boolean }[]
  /** Event handlers to wire */
  events: { event: string; handler: t.Expression }[]
  /** All dynamic children in source order (reactive texts, conditionals, keyed lists, etc.) */
  orderedChildren: OrderedChild[]
  /** Whether this is the root element */
  isRoot: boolean
  /** Number of static HTML element children (for insertBefore positioning) */
  staticElementCount: number
}

type WalkStep = 'firstElementChild' | 'nextElementSibling'

/**
 * Check if a JSX element tree can be template-optimized.
 * Returns false if the tree contains component elements or other non-templateable patterns at any level.
 */
function canUseTemplate(jsxEl: t.JSXElement, _ctx: TransformContext): boolean {
  // Only the root element must be an HTML tag — component children
  // are mounted dynamically after cloning, like reactive texts.
  const tagName = getTagName(jsxEl.openingElement)
  return !isUpperCase(tagName)
}

/**
 * Build the static HTML string for a JSX element tree, and collect dynamic bindings.
 * Returns the HTML string and an array of dynamic binding records.
 */
function analyzeStaticTree(
  jsxEl: t.JSXElement,
  ctx: TransformContext,
  walkPath: WalkStep[],
  bindings: DynamicBinding[],
  isRoot: boolean,
): string {
  const tagName = getTagName(jsxEl.openingElement)
  const attrs = jsxEl.openingElement.attributes as (t.JSXAttribute | t.JSXSpreadAttribute)[]

  let html = `<${tagName}`

  // Classify attributes for this element
  const classifiedAttrs = classifyAttributes(attrs, ctx.subs)

  const dynamicAttrs: DynamicBinding['dynamicAttrs'] = []
  const events: DynamicBinding['events'] = []

  for (const attr of classifiedAttrs) {
    if (attr.kind === 'static') {
      // For DOM properties like className, we need to use the HTML attribute name
      const htmlAttrName = propToHtmlAttr(attr.name)
      const escapedValue = attr.value.replace(/'/g, '&#39;')
      html += ` ${htmlAttrName}='${escapedValue}'`
    } else if (attr.kind === 'dynamic') {
      dynamicAttrs.push({ name: attr.name, expression: attr.expression, isProperty: attr.isProperty })
    } else if (attr.kind === 'event') {
      events.push({ event: attr.event, handler: attr.handler })
    }
  }

  html += '>'

  // Process children
  const children = classifyChildren(jsxEl.children)
  const orderedChildren: OrderedChild[] = []

  // Check if this node has mixed static text + reactive text children
  // (exclude expressions that contain JSX — those become dynamicContent, not reactive text)
  const hasReactiveText = children.some(c => c.kind === 'expression' &&
    !isConditionalPattern(c.expression) && !isKeyedListPattern(c.expression) && !containsJSX(c.expression) && !isChildrenAccess(c.expression))
  const hasStaticText = children.some(c => c.kind === 'text')
  const hasMixedText = hasReactiveText && hasStaticText

  // Check if this node has exactly ONE child that is a reactive text expression
  // If so, we can use a space placeholder in template + .firstChild.data or .textContent
  const isSoleReactiveText = children.length === 1 && hasReactiveText

  let elementChildIndex = 0
  for (const child of children) {
    if (child.kind === 'text') {
      // If mixed with reactive text, record as a reactive text with static value
      // so it's appended in correct order during wiring, not baked into template
      if (hasMixedText) {
        orderedChildren.push({ kind: 'reactiveText', childIndex: -1, expression: t.stringLiteral(child.value), nextStaticElementIndex: elementChildIndex })
      } else {
        html += escapeHtml(child.value)
      }
    } else if (child.kind === 'element') {
      const childTagName = getTagName(child.node.openingElement)
      if (isUpperCase(childTagName)) {
        // Component child — mount dynamically after cloning
        orderedChildren.push({ kind: 'componentChild', node: child.node, nextStaticElementIndex: elementChildIndex })
      } else {
        // HTML element child — include in template and recurse
        const childPath = elementChildIndex === 0
          ? [...walkPath, 'firstElementChild' as WalkStep]
          : buildSiblingPath(walkPath, elementChildIndex)
        analyzeStaticTree(child.node, ctx, childPath, bindings, false)
        html += buildStaticHtmlForElement(child.node, ctx)
        elementChildIndex++
      }
    } else if (child.kind === 'expression') {
      // Check for conditional
      if (isConditionalPattern(child.expression)) {
        const parts = getConditionalParts(child.expression)
        if (parts) {
          orderedChildren.push({ kind: 'conditional', condition: parts.condition, element: parts.element, elseElement: parts.elseElement, fragment: parts.fragment, nextStaticElementIndex: elementChildIndex })
          // When alternate is a keyed list (e.g., `cond ? <Empty/> : items.map(...)`)
          // also emit the keyed list — they coexist: conditional shows/hides empty state,
          // keyed list independently manages items (empty collection → no items shown)
          if (!parts.elseElement && t.isConditionalExpression(child.expression)) {
            const alt = child.expression.alternate
            if (isKeyedListPattern(alt)) {
              const info = extractKeyedListInfo(alt as t.CallExpression)
              if (info) {
                orderedChildren.push({ kind: 'keyedList', ...info, nextStaticElementIndex: elementChildIndex })
              }
            }
          }
          continue
        }
      }
      // Check for keyed list
      if (isKeyedListPattern(child.expression)) {
        const info = extractKeyedListInfo(child.expression as t.CallExpression)
        if (info) {
          orderedChildren.push({ kind: 'keyedList', ...info, nextStaticElementIndex: elementChildIndex })
          continue
        }
      }
      // Check if expression contains JSX (e.g., .map() with JSX, ternaries with JSX)
      // These produce DOM nodes and need reactiveContent, not reactiveText
      if (containsJSX(child.expression)) {
        orderedChildren.push({ kind: 'dynamicContent', expression: child.expression, nextStaticElementIndex: elementChildIndex })
        continue
      }
      // props.children may return DOM nodes — use reactiveContent to handle both text and DOM
      if (isChildrenAccess(child.expression)) {
        orderedChildren.push({ kind: 'dynamicContent', expression: child.expression, nextStaticElementIndex: elementChildIndex })
        continue
      }
      // Sole prop access may carry a DOM node (e.g., header={<Title />}) — use reactiveContent.
      // Only promote to dynamicContent when the prop is the sole child (no sibling text).
      // Mixed content like "Hello, {name}!" should stay as reactiveText.
      if (isSoleReactiveText && isPropSlotAccess(child.expression, ctx.subs)) {
        orderedChildren.push({ kind: 'dynamicContent', expression: child.expression, nextStaticElementIndex: elementChildIndex })
        continue
      }
      // Reactive text — record it, mark if sole child for textContent optimization
      orderedChildren.push({ kind: 'reactiveText', childIndex: elementChildIndex, expression: child.expression, sole: isSoleReactiveText, nextStaticElementIndex: elementChildIndex })
      // Add space placeholder in template for sole reactive text (enables .firstChild.data)
      if (isSoleReactiveText) {
        html += ' '
      }
    }
  }

  // Determine if the tag is void (self-closing)
  if (!isVoidElement(tagName)) {
    html += `</${tagName}>`
  }

  // Record bindings if this node has any dynamic parts
  if (dynamicAttrs.length > 0 || events.length > 0 || orderedChildren.length > 0 || isRoot) {
    bindings.push({
      walkPath: [...walkPath],
      dynamicAttrs,
      events,
      orderedChildren,
      isRoot,
      staticElementCount: elementChildIndex,
    })
  }

  return html
}

/**
 * Build the static HTML string for an element (recursive helper, doesn't collect bindings).
 */
function buildStaticHtmlForElement(jsxEl: t.JSXElement, ctx: TransformContext): string {
  const tagName = getTagName(jsxEl.openingElement)
  const attrs = jsxEl.openingElement.attributes as (t.JSXAttribute | t.JSXSpreadAttribute)[]

  let html = `<${tagName}`

  const classifiedAttrs = classifyAttributes(attrs, ctx.subs)
  for (const attr of classifiedAttrs) {
    if (attr.kind === 'static') {
      const htmlAttrName = propToHtmlAttr(attr.name)
      const escapedValue = attr.value.replace(/'/g, '&#39;')
      html += ` ${htmlAttrName}='${escapedValue}'`
    }
    // Dynamic attrs and events are not included in the template HTML
  }

  html += '>'

  const children = classifyChildren(jsxEl.children)
  // Check if this node has mixed static text + expressions
  const hasExprChild = children.some(c => c.kind === 'expression')
  const hasTextChild = children.some(c => c.kind === 'text')
  const mixed = hasExprChild && hasTextChild

  for (const child of children) {
    if (child.kind === 'text') {
      // Skip static text if mixed with expressions — will be appended during wiring
      if (!mixed) html += escapeHtml(child.value)
    } else if (child.kind === 'element') {
      const childTag = getTagName(child.node.openingElement)
      // Skip component children — they're mounted dynamically
      if (!isUpperCase(childTag)) {
        html += buildStaticHtmlForElement(child.node, ctx)
      }
    } else if (child.kind === 'expression') {
      // Add space placeholder for sole reactive text children (enables .firstChild.data)
      const isSole = children.length === 1 && !isConditionalPattern(child.expression) && !isKeyedListPattern(child.expression)
      if (isSole) html += ' '
    }
    // Other expressions (conditionals, keyed lists, components) are not in the template
  }

  if (!isVoidElement(tagName)) {
    html += `</${tagName}>`
  }

  return html
}

/**
 * Build a walk path for the Nth element sibling.
 * The first child uses [...parentPath, 'firstElementChild'].
 * Subsequent siblings chain nextElementSibling from the first child.
 */
function buildSiblingPath(parentPath: WalkStep[], elementIndex: number): WalkStep[] {
  const path = [...parentPath, 'firstElementChild' as WalkStep]
  for (let i = 0; i < elementIndex; i++) {
    path.push('nextElementSibling' as WalkStep)
  }
  return path
}

/**
 * Map DOM property names back to HTML attribute names for the template string.
 */
function propToHtmlAttr(name: string): string {
  if (name === 'className') return 'class'
  if (name === 'htmlFor') return 'for'
  return name
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

function isVoidElement(tag: string): boolean {
  return VOID_ELEMENTS.has(tag)
}

/**
 * Generate tree-walk statements to obtain references to nodes with dynamic bindings.
 */
function generateTreeWalkAndWiring(
  rootId: t.Identifier,
  bindings: DynamicBinding[],
  ctx: TransformContext,
): t.Statement[] {
  const stmts: t.Statement[] = []

  // For each binding, generate a variable that walks to the node, then wire dynamic parts
  let walkVarCounter = 0

  for (const binding of bindings) {
    let nodeId: t.Identifier

    if (binding.isRoot) {
      nodeId = rootId
    } else {
      // Generate walk expression: rootId.firstElementChild.nextElementSibling...
      let expr: t.Expression = rootId
      for (const step of binding.walkPath) {
        expr = t.memberExpression(expr, t.identifier(step))
      }

      nodeId = t.identifier(`__walk${walkVarCounter++}`)
      stmts.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(nodeId, expr),
        ]),
      )
    }

    // Wire dynamic attributes
    for (const attr of binding.dynamicAttrs) {
      // ref={this.myField} → this.myField = __elN (assign element to field)
      if (attr.name === 'ref') {
        stmts.push(
          t.expressionStatement(
            t.assignmentExpression('=', attr.expression, nodeId),
          ),
        )
        continue
      }
      // Detect selector pattern: signal === id ? trueVal : falseVal
      const selectorInfo = detectSelectorPattern(attr.expression)
      if (selectorInfo && attr.name === 'className') {
        ctx.usedHelpers.add('selectorAttr')
        stmts.push(
          t.expressionStatement(
            t.callExpression(t.identifier('selectorAttr'), [
              nodeId,
              t.stringLiteral(attr.name),
              selectorInfo.signal,
              selectorInfo.matchValue,
              selectorInfo.trueVal,
              selectorInfo.falseVal,
            ]),
          ),
        )
      } else {
        ctx.usedHelpers.add('reactiveAttr')
        stmts.push(
          t.expressionStatement(
            t.callExpression(t.identifier('reactiveAttr'), [
              nodeId,
              t.stringLiteral(attr.name),
              t.arrowFunctionExpression([], attr.expression),
            ]),
          ),
        )
      }
    }

    // Wire events — all delegated via single document-level listener per event type
    for (const evt of binding.events) {
      ctx.usedHelpers.add('delegateEvent')

      // MemberExpression handlers (e.g., store.method) lose `this` when extracted.
      // Wrap them: (e) => store.method(e) to preserve the receiver.
      let handler = evt.handler
      if (t.isMemberExpression(handler)) {
        const param = t.identifier('__e')
        handler = t.arrowFunctionExpression(
          [param],
          t.callExpression(handler, [param]),
        )
      }

      stmts.push(
        t.expressionStatement(
          t.callExpression(t.identifier('delegateEvent'), [
            nodeId,
            t.stringLiteral(evt.event),
            handler,
          ]),
        ),
      )
    }

    // Pre-capture reference nodes for dynamic children that need insertBefore.
    // Must be captured before any insertions to avoid shifted firstElementChild/nextElementSibling.
    const refNodes = new Map<number, t.Identifier>()
    for (const child of binding.orderedChildren) {
      if (child.nextStaticElementIndex < binding.staticElementCount) {
        const idx = child.nextStaticElementIndex
        if (!refNodes.has(idx)) {
          const refId = t.identifier(`__ref${ctx.anchorCounter.value++}`)
          let refExpr: t.Expression = t.memberExpression(nodeId, t.identifier('firstElementChild'))
          for (let i = 0; i < idx; i++) {
            refExpr = t.memberExpression(refExpr, t.identifier('nextElementSibling'))
          }
          stmts.push(
            t.variableDeclaration('const', [
              t.variableDeclarator(refId, refExpr),
            ]),
          )
          refNodes.set(idx, refId)
        }
      }
    }

    // Wire all dynamic children in source order
    for (const child of binding.orderedChildren) {
      switch (child.kind) {
        case 'reactiveText': {
          const rt = child
          const substituted = substituteExpression(rt.expression, ctx.subs)
          const rtRefId = refNodes.get(child.nextStaticElementIndex)

          // Helper: insert a node at the correct position
          const insertNode = (childExpr: t.Expression) => {
            if (rtRefId) {
              stmts.push(t.expressionStatement(t.callExpression(
                t.memberExpression(nodeId, t.identifier('insertBefore')), [childExpr, rtRefId])))
            } else {
              stmts.push(t.expressionStatement(t.callExpression(
                t.memberExpression(nodeId, t.identifier('appendChild')), [childExpr])))
            }
          }

          // Static string literal in mixed content
          if (t.isStringLiteral(substituted)) {
            insertNode(t.callExpression(
              t.memberExpression(t.identifier('document'), t.identifier('createTextNode')),
              [substituted]))
          }
          // Cached local (like __id) that's the sole child — use textContent (no Text node creation)
          else if (t.isIdentifier(substituted) && substituted.name.startsWith('__') && rt.sole) {
            stmts.push(
              t.expressionStatement(
                t.assignmentExpression(
                  '=',
                  t.memberExpression(nodeId, t.identifier('textContent')),
                  substituted,
                ),
              ),
            )
          }
          // Cached local in mixed content
          else if (t.isIdentifier(substituted) && substituted.name.startsWith('__')) {
            insertNode(t.callExpression(
              t.memberExpression(t.identifier('document'), t.identifier('createTextNode')),
              [t.callExpression(t.identifier('String'), [substituted])]))
          }
          // Reactive expression that's the sole child — use template placeholder + .firstChild.data
          else if (rt.sole) {
            // The template already has a space placeholder creating a text node
            // Wire computation to update it directly via .firstChild.data
            ctx.usedHelpers.add('computation')
            stmts.push(
              t.expressionStatement(
                t.callExpression(t.identifier('computation'), [
                  t.arrowFunctionExpression([], substituted),
                  t.arrowFunctionExpression(
                    [t.identifier('__v')],
                    t.assignmentExpression(
                      '=',
                      t.memberExpression(
                        t.memberExpression(nodeId, t.identifier('firstChild')),
                        t.identifier('data'),
                      ),
                      t.identifier('__v'),
                    ),
                  ),
                ]),
              ),
            )
          }
          // Reactive expression in mixed content
          else {
            ctx.usedHelpers.add('reactiveText')
            insertNode(t.callExpression(t.identifier('reactiveText'), [
              t.arrowFunctionExpression([], substituted)]))
          }
          break
        }

        case 'conditional': {
          const condRefId = refNodes.get(child.nextStaticElementIndex)
          const condStmts = transformConditional(child.condition, child.element, nodeId, ctx, child.elseElement, condRefId, child.fragment)
          stmts.push(...condStmts)
          break
        }

        case 'keyedList': {
          const listRefId = refNodes.get(child.nextStaticElementIndex)
          const listStmts = transformKeyedList(child.collection, child.itemParam, child.keyExpression, child.element, nodeId, ctx, child.guardCondition, listRefId, child.preStatements, child.indexParam)
          stmts.push(...listStmts)
          break
        }

        case 'componentChild': {
          const [compStmts, compId] = transformJSXElement(child.node, ctx)
          stmts.push(...compStmts)
          const refId = refNodes.get(child.nextStaticElementIndex)
          if (refId) {
            // Insert before the next static HTML element to preserve source order
            stmts.push(
              t.expressionStatement(
                t.callExpression(
                  t.memberExpression(nodeId, t.identifier('insertBefore')),
                  [compId, refId],
                ),
              ),
            )
          } else {
            // Component is after all static elements — appendChild
            stmts.push(
              t.expressionStatement(
                t.callExpression(
                  t.memberExpression(nodeId, t.identifier('appendChild')),
                  [compId],
                ),
              ),
            )
          }
          break
        }

        case 'dynamicContent': {
          const substituted = substituteExpression(child.expression, ctx.subs)
          const anchorId = t.identifier(`__anchor${ctx.anchorCounter.value++}`)

          // Create anchor comment
          stmts.push(
            t.variableDeclaration('const', [
              t.variableDeclarator(
                anchorId,
                t.callExpression(
                  t.memberExpression(t.identifier('document'), t.identifier('createComment')),
                  [t.stringLiteral('')],
                ),
              ),
            ]),
          )

          // Insert anchor at correct position
          const dcRefId = refNodes.get(child.nextStaticElementIndex)
          if (dcRefId) {
            stmts.push(
              t.expressionStatement(
                t.callExpression(
                  t.memberExpression(nodeId, t.identifier('insertBefore')),
                  [anchorId, dcRefId],
                ),
              ),
            )
          } else {
            stmts.push(
              t.expressionStatement(
                t.callExpression(
                  t.memberExpression(nodeId, t.identifier('appendChild')),
                  [anchorId],
                ),
              ),
            )
          }

          // reactiveContent(parent, anchor, () => expr)
          ctx.usedHelpers.add('reactiveContent')
          stmts.push(
            t.expressionStatement(
              t.callExpression(t.identifier('reactiveContent'), [
                nodeId,
                anchorId,
                t.arrowFunctionExpression([], substituted),
              ]),
            ),
          )
          break
        }
      }
    }
  }

  return stmts
}

function transformHTMLElement(
  jsxEl: t.JSXElement,
  tagName: string,
  ctx: TransformContext,
): [t.Statement[], t.Identifier] {
  // Try template optimization
  if (canUseTemplate(jsxEl, ctx)) {
    return transformHTMLElementWithTemplate(jsxEl, tagName, ctx)
  }

  // Fallback to createElement approach (shouldn't happen for pure HTML trees)
  return transformHTMLElementLegacy(jsxEl, tagName, ctx)
}

function transformHTMLElementWithTemplate(
  jsxEl: t.JSXElement,
  tagName: string,
  ctx: TransformContext,
): [t.Statement[], t.Identifier] {
  const stmts: t.Statement[] = []
  const elId = `__el${ctx.elementCounter.value++}`
  const elIdentifier = t.identifier(elId)

  // Analyze the static tree and build the template HTML
  const bindings: DynamicBinding[] = []
  const templateHtml = buildStaticHtmlForElement(jsxEl, ctx)
  analyzeStaticTree(jsxEl, ctx, [], bindings, true)

  // Generate template declaration at module level
  const tmplId = `_tmpl${ctx.templateCounter.value++}`
  const tmplIdentifier = t.identifier(tmplId)

  ctx.usedHelpers.add('template')
  ctx.templateDeclarations.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        tmplIdentifier,
        t.callExpression(t.identifier('template'), [t.stringLiteral(templateHtml)]),
      ),
    ]),
  )

  // Clone: const __elN = _tmplN()
  stmts.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        elIdentifier,
        t.callExpression(tmplIdentifier, []),
      ),
    ]),
  )

  // Generate tree-walk and dynamic wiring
  const wiringStmts = generateTreeWalkAndWiring(elIdentifier, bindings, ctx)
  stmts.push(...wiringStmts)

  return [stmts, elIdentifier]
}

/**
 * Legacy createElement-based transform (fallback for trees with components mixed in).
 */
function transformHTMLElementLegacy(
  jsxEl: t.JSXElement,
  tagName: string,
  ctx: TransformContext,
): [t.Statement[], t.Identifier] {
  const stmts: t.Statement[] = []
  const elId = `__el${ctx.elementCounter.value++}`
  const elIdentifier = t.identifier(elId)

  // const __elN = createElement("tag")
  ctx.usedHelpers.add('createElement')
  stmts.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        elIdentifier,
        t.callExpression(t.identifier('createElement'), [t.stringLiteral(tagName)]),
      ),
    ]),
  )

  // Process attributes
  const attrs = classifyAttributes(
    jsxEl.openingElement.attributes as (t.JSXAttribute | t.JSXSpreadAttribute)[],
    ctx.subs,
  )

  for (const attr of attrs) {
    if (attr.kind === 'static') {
      ctx.usedHelpers.add('staticAttr')
      stmts.push(
        t.expressionStatement(
          t.callExpression(t.identifier('staticAttr'), [
            elIdentifier,
            t.stringLiteral(attr.name),
            t.stringLiteral(attr.value),
          ]),
        ),
      )
    } else if (attr.kind === 'dynamic') {
      ctx.usedHelpers.add('reactiveAttr')
      stmts.push(
        t.expressionStatement(
          t.callExpression(t.identifier('reactiveAttr'), [
            elIdentifier,
            t.stringLiteral(attr.name),
            t.arrowFunctionExpression([], attr.expression),
          ]),
        ),
      )
    } else if (attr.kind === 'event') {
      ctx.usedHelpers.add('delegateEvent')
      let handler = attr.handler
      if (t.isMemberExpression(handler)) {
        const param = t.identifier('__e')
        handler = t.arrowFunctionExpression(
          [param],
          t.callExpression(handler, [param]),
        )
      }
      stmts.push(
        t.expressionStatement(
          t.callExpression(t.identifier('delegateEvent'), [
            elIdentifier,
            t.stringLiteral(attr.event),
            handler,
          ]),
        ),
      )
    }
  }

  // Process children
  const children = classifyChildren(jsxEl.children)

  for (const child of children) {
    if (child.kind === 'text') {
      stmts.push(
        t.expressionStatement(
          t.callExpression(
            t.memberExpression(elIdentifier, t.identifier('appendChild')),
            [
              t.callExpression(
                t.memberExpression(t.identifier('document'), t.identifier('createTextNode')),
                [t.stringLiteral(child.value)],
              ),
            ],
          ),
        ),
      )
    } else if (child.kind === 'expression') {
      if (isConditionalPattern(child.expression)) {
        const parts = getConditionalParts(child.expression)
        if (parts) {
          const condStmts = transformConditional(parts.condition, parts.element, elIdentifier, ctx, parts.elseElement, undefined, parts.fragment)
          stmts.push(...condStmts)
          continue
        }
      }

      if (isKeyedListPattern(child.expression)) {
        const info = extractKeyedListInfo(child.expression as t.CallExpression)
        if (info) {
          const listStmts = transformKeyedList(info.collection, info.itemParam, info.keyExpression, info.element, elIdentifier, ctx, info.guardCondition, undefined, info.preStatements, info.indexParam)
          stmts.push(...listStmts)
          continue
        }
      }

      const substituted = substituteExpression(child.expression, ctx.subs)
      // props.children or any prop slot may return DOM nodes — use reactiveContent
      if (isChildrenAccess(child.expression) || isPropSlotAccess(child.expression, ctx.subs)) {
        ctx.usedHelpers.add('reactiveContent')
        const anchorId = t.identifier(`__anchor${ctx.anchorCounter.value++}`)
        stmts.push(
          t.variableDeclaration('const', [
            t.variableDeclarator(anchorId,
              t.callExpression(
                t.memberExpression(t.identifier('document'), t.identifier('createComment')),
                [t.stringLiteral('')],
              ),
            ),
          ]),
        )
        stmts.push(t.expressionStatement(
          t.callExpression(t.memberExpression(elIdentifier, t.identifier('appendChild')), [anchorId]),
        ))
        stmts.push(t.expressionStatement(
          t.callExpression(t.identifier('reactiveContent'), [
            elIdentifier, anchorId, t.arrowFunctionExpression([], substituted),
          ]),
        ))
      } else {
        ctx.usedHelpers.add('reactiveText')
        stmts.push(
          t.expressionStatement(
            t.callExpression(
              t.memberExpression(elIdentifier, t.identifier('appendChild')),
              [
                t.callExpression(t.identifier('reactiveText'), [
                  t.arrowFunctionExpression([], substituted),
                ]),
              ],
            ),
          ),
        )
      }
    } else if (child.kind === 'element') {
      const [childStmts, childId] = transformJSXElement(child.node, ctx)
      stmts.push(...childStmts)
      stmts.push(
        t.expressionStatement(
          t.callExpression(
            t.memberExpression(elIdentifier, t.identifier('appendChild')),
            [childId],
          ),
        ),
      )
    }
  }

  return [stmts, elIdentifier]
}

function transformComponentElement(
  jsxEl: t.JSXElement,
  tagName: string,
  ctx: TransformContext,
): [t.Statement[], t.Identifier] {
  const stmts: t.Statement[] = []
  const compId = `__comp${ctx.compCounter.value++}`
  const compIdentifier = t.identifier(compId)

  ctx.usedHelpers.add('mount')

  // Build prop thunks object (excluding key)
  const props: t.ObjectProperty[] = []
  const attrs = jsxEl.openingElement.attributes

  for (const attr of attrs) {
    if (!t.isJSXAttribute(attr)) continue
    const name = t.isJSXIdentifier(attr.name) ? attr.name.name : ''
    if (!name || name === 'key') continue

    let valueExpr: t.Expression

    if (t.isStringLiteral(attr.value)) {
      valueExpr = attr.value
    } else if (t.isJSXExpressionContainer(attr.value) && t.isExpression(attr.value.expression)) {
      valueExpr = substituteExpression(attr.value.expression, ctx.subs)
    } else {
      continue
    }

    // Each prop is a getter thunk: () => expr
    // Two-way binding for objects works through shared references — the child gets
    // the same __wrapObject proxy as the parent. Mutations via the proxy go to the parent.
    // Reassignment is local (one-way for primitives, local override for objects).
    const propKey = name.includes('-') ? t.stringLiteral(name) : t.identifier(name)
    props.push(
      t.objectProperty(
        propKey,
        t.arrowFunctionExpression([], valueExpr),
      ),
    )
  }

  // Process JSX children → children prop thunk
  const children = classifyChildren(jsxEl.children)
  if (children.length > 0) {
    const childBodyStmts: t.Statement[] = []
    const childIds: t.Identifier[] = []

    for (const child of children) {
      if (child.kind === 'text') {
        const textId = t.identifier(`__txt${ctx.elementCounter.value++}`)
        childBodyStmts.push(
          t.variableDeclaration('const', [
            t.variableDeclarator(textId,
              t.callExpression(
                t.memberExpression(t.identifier('document'), t.identifier('createTextNode')),
                [t.stringLiteral(child.value)],
              ),
            ),
          ]),
        )
        childIds.push(textId)
      } else if (child.kind === 'element') {
        const [childStmts, childId] = transformJSXElement(child.node, ctx)
        childBodyStmts.push(...childStmts)
        childIds.push(childId)
      } else if (child.kind === 'expression') {
        const substituted = substituteExpression(child.expression, ctx.subs)
        // Single text expression — return the value directly (string/number)
        if (children.length === 1) {
          childBodyStmts.push(t.returnStatement(substituted))
          props.push(
            t.objectProperty(
              t.identifier('children'),
              t.arrowFunctionExpression([], t.blockStatement(childBodyStmts)),
            ),
          )
          break
        }
        // Mixed content — create text node from expression
        const textId = t.identifier(`__txt${ctx.elementCounter.value++}`)
        ctx.usedHelpers.add('reactiveText')
        childBodyStmts.push(
          t.variableDeclaration('const', [
            t.variableDeclarator(textId,
              t.callExpression(t.identifier('reactiveText'), [
                t.arrowFunctionExpression([], substituted),
              ]),
            ),
          ]),
        )
        childIds.push(textId)
      }
    }

    // Only build fragment if we didn't already return (single expression case)
    if (childIds.length > 0) {
      let returnExpr: t.Expression
      if (childIds.length === 1) {
        returnExpr = childIds[0]
      } else {
        const fragId = t.identifier('__frag')
        childBodyStmts.unshift(
          t.variableDeclaration('const', [
            t.variableDeclarator(fragId,
              t.callExpression(
                t.memberExpression(t.identifier('document'), t.identifier('createDocumentFragment')),
                [],
              ),
            ),
          ]),
        )
        for (const cid of childIds) {
          childBodyStmts.push(
            t.expressionStatement(
              t.callExpression(
                t.memberExpression(fragId, t.identifier('appendChild')),
                [cid],
              ),
            ),
          )
        }
        returnExpr = fragId
      }
      childBodyStmts.push(t.returnStatement(returnExpr))
      props.push(
        t.objectProperty(
          t.identifier('children'),
          t.arrowFunctionExpression([], t.blockStatement(childBodyStmts)),
        ),
      )
    }
  }

  stmts.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        compIdentifier,
        t.callExpression(t.identifier('mount'), [
          t.identifier(tagName),
          t.objectExpression(props),
        ]),
      ),
    ]),
  )

  return [stmts, compIdentifier]
}

export function transformJSXFragment(
  fragment: t.JSXFragment,
  ctx: TransformContext,
): [t.Statement[], t.Identifier] {
  const stmts: t.Statement[] = []
  const fragId = t.identifier(`__frag${ctx.elementCounter.value++}`)

  // const __fragN = document.createDocumentFragment()
  stmts.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(fragId,
        t.callExpression(
          t.memberExpression(t.identifier('document'), t.identifier('createDocumentFragment')),
          [],
        ),
      ),
    ]),
  )

  // Process fragment children
  const children = classifyChildren(fragment.children)
  for (const child of children) {
    if (child.kind === 'text') {
      stmts.push(
        t.expressionStatement(
          t.callExpression(
            t.memberExpression(fragId, t.identifier('appendChild')),
            [t.callExpression(
              t.memberExpression(t.identifier('document'), t.identifier('createTextNode')),
              [t.stringLiteral(child.value)],
            )],
          ),
        ),
      )
    } else if (child.kind === 'element') {
      const [childStmts, childId] = transformJSXElement(child.node, ctx)
      stmts.push(...childStmts)
      stmts.push(
        t.expressionStatement(
          t.callExpression(
            t.memberExpression(fragId, t.identifier('appendChild')),
            [childId],
          ),
        ),
      )
    } else if (child.kind === 'expression') {
      const substituted = substituteExpression(child.expression, ctx.subs)
      ctx.usedHelpers.add('reactiveText')
      stmts.push(
        t.expressionStatement(
          t.callExpression(
            t.memberExpression(fragId, t.identifier('appendChild')),
            [t.callExpression(t.identifier('reactiveText'), [
              t.arrowFunctionExpression([], substituted),
            ])],
          ),
        ),
      )
    }
  }

  return [stmts, fragId]
}

function transformConditional(
  condition: t.Expression,
  element: t.JSXElement | null,
  parentId: t.Identifier,
  ctx: TransformContext,
  elseElement?: t.JSXElement,
  refNode?: t.Identifier,
  fragment?: t.JSXFragment,
): t.Statement[] {
  const stmts: t.Statement[] = []
  const anchorId = `__anchor${ctx.anchorCounter.value++}`
  const anchorIdentifier = t.identifier(anchorId)

  ctx.usedHelpers.add('conditional')

  // const __anchorN = document.createComment("")
  stmts.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        anchorIdentifier,
        t.callExpression(
          t.memberExpression(t.identifier('document'), t.identifier('createComment')),
          [t.stringLiteral('')],
        ),
      ),
    ]),
  )

  // Insert anchor at correct position
  if (refNode) {
    stmts.push(
      t.expressionStatement(
        t.callExpression(
          t.memberExpression(parentId, t.identifier('insertBefore')),
          [anchorIdentifier, refNode],
        ),
      ),
    )
  } else {
    stmts.push(
      t.expressionStatement(
        t.callExpression(
          t.memberExpression(parentId, t.identifier('appendChild')),
          [anchorIdentifier],
        ),
      ),
    )
  }

  // Transform the element (or fragment) inside the conditional
  let elStmts: t.Statement[]
  let elId: t.Identifier
  if (fragment) {
    ;[elStmts, elId] = transformJSXFragment(fragment, ctx)
  } else {
    ;[elStmts, elId] = transformJSXElement(element!, ctx)
  }

  // Build the create function body
  const createBody = t.blockStatement([
    ...elStmts,
    t.returnStatement(elId),
  ])

  // Substitute the condition
  const subCondition = substituteExpression(condition, ctx.subs)

  // Build args: conditional(parent, anchor, condFn, createFn[, elseFn])
  const args: t.Expression[] = [
    parentId,
    anchorIdentifier,
    t.arrowFunctionExpression([], subCondition),
    t.arrowFunctionExpression([], createBody),
  ]

  // If there's an else branch, transform it and add as 5th argument
  if (elseElement) {
    const [elseStmts, elseId] = transformJSXElement(elseElement, ctx)
    const elseBody = t.blockStatement([
      ...elseStmts,
      t.returnStatement(elseId),
    ])
    args.push(t.arrowFunctionExpression([], elseBody))
  }

  stmts.push(
    t.expressionStatement(
      t.callExpression(t.identifier('conditional'), args),
    ),
  )

  return stmts
}

function transformKeyedList(
  collection: t.Expression,
  itemParam: t.Identifier,
  keyExpr: t.Expression,
  element: t.JSXElement,
  parentId: t.Identifier,
  ctx: TransformContext,
  guardCondition?: t.Expression,
  refNode?: t.Identifier,
  preStatements?: t.Statement[],
  indexParam?: t.Identifier,
): t.Statement[] {
  const stmts: t.Statement[] = []
  const anchorId = `__anchor${ctx.anchorCounter.value++}`
  const anchorIdentifier = t.identifier(anchorId)

  ctx.usedHelpers.add('keyedList')

  // const __anchorN = document.createComment("")
  stmts.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        anchorIdentifier,
        t.callExpression(
          t.memberExpression(t.identifier('document'), t.identifier('createComment')),
          [t.stringLiteral('')],
        ),
      ),
    ]),
  )

  // Insert anchor at correct position
  if (refNode) {
    stmts.push(
      t.expressionStatement(
        t.callExpression(
          t.memberExpression(parentId, t.identifier('insertBefore')),
          [anchorIdentifier, refNode],
        ),
      ),
    )
  } else {
    stmts.push(
      t.expressionStatement(
        t.callExpression(
          t.memberExpression(parentId, t.identifier('appendChild')),
          [anchorIdentifier],
        ),
      ),
    )
  }

  // Substitute collection
  const subCollection = substituteExpression(collection, ctx.subs)

  // Key function: (itemParam, indexParam?) => keyExpr
  // If there are preStatements, the key expression may depend on local variables from them,
  // so generate a block-body key function: (item) => { ...preStatements; return keyExpr; }
  // If the key expression uses the index parameter, include it in the key function params
  // (the runtime passes keyFn(item, index))
  const keyFnParams: t.Identifier[] = [t.identifier(itemParam.name)]
  if (indexParam) keyFnParams.push(t.identifier(indexParam.name))
  const keyFn = preStatements
    ? t.arrowFunctionExpression(
        keyFnParams,
        t.blockStatement([...preStatements, t.returnStatement(keyExpr)]),
      )
    : t.arrowFunctionExpression(keyFnParams, keyExpr)

  // Create function: (__itemGetter) => { const item = __itemGetter(); ... return __el/comp }
  const itemGetterParam = t.identifier('__itemGetter')

  // Inside the create function, the item param should resolve to __itemGetter()
  // We need to build a new substitution map for inside the create fn
  // The item variable references inside JSX props should use __itemGetter().prop
  const innerSubs = new Map(ctx.subs)
  // Remove the item param from subs if it's there (it shouldn't be, but just in case)
  // The item inside the create fn is local

  // Build the element transform with a modified context
  // Inside keyedList, component props that reference the item should use __itemGetter()
  const [elStmts, elId] = transformKeyedListElement(element, itemParam, ctx)

  // Extract key property name (e.g., `id` from `row.id`) and cache it
  // This avoids Proxy trap on every select/event handler
  let keyPropName: string | null = null
  if (
    t.isMemberExpression(keyExpr) &&
    t.isIdentifier(keyExpr.object, { name: itemParam.name }) &&
    t.isIdentifier(keyExpr.property)
  ) {
    keyPropName = keyExpr.property.name
  }

  const indexGetterParam = indexParam ? t.identifier('__indexGetter') : undefined

  const createBodyStmts: t.Statement[] = [
    // const item = __itemGetter()
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(itemParam.name),
        t.callExpression(itemGetterParam, []),
      ),
    ]),
  ]

  // const i = __indexGetter() — if the .map() callback has an index param
  if (indexParam && indexGetterParam) {
    createBodyStmts.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier(indexParam.name),
          t.callExpression(indexGetterParam, []),
        ),
      ]),
    )
  }

  // Include any pre-return statements from block body (e.g., local variable declarations)
  if (preStatements) {
    createBodyStmts.push(...preStatements)
  }

  // Cache the key property: const __id = item.id
  // Then replace item.id references in generated code with __id
  if (keyPropName) {
    const cachedIdName = '__' + keyPropName
    createBodyStmts.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier(cachedIdName),
          t.memberExpression(t.identifier(itemParam.name), t.identifier(keyPropName)),
        ),
      ]),
    )
    // Replace `item.propName` with `__propName` in the generated element statements
    for (const stmt of elStmts) {
      replaceItemPropWithCached(stmt, itemParam.name, keyPropName, cachedIdName)
    }

    // Optimize: after replacement, computation(() => __cachedId, setter) calls
    // where the getter is a constant (__-prefixed identifier) can be replaced
    // with a direct DOM assignment — avoids allocating a Computation that would
    // immediately self-dispose (0 deps).
    optimizeConstantComputations(elStmts)

    // Proxy elimination: in computation getters, replace item.prop access
    // with __itemSignal(item, 'prop').value — subscribes to the signal directly
    // without going through an item Proxy. The keyed-list now passes raw items.
    transformItemSignalAccess(elStmts, itemParam.name, ctx.usedHelpers)

    // Level 4: merge 2+ remaining computation() calls into a single
    // mergedComputation() call — one EffectNode instead of N.
    mergeAdjacentComputations(elStmts, ctx.usedHelpers)

    // Level 5: hoist event handlers that only capture the cached key id.
    // Build set of local names (anything defined inside the create function).
    const localNames = new Set<string>()
    localNames.add(itemParam.name)
    if (indexParam) localNames.add(indexParam.name)
    localNames.add(cachedIdName)
    // Collect __el* identifiers from variable declarations in elStmts
    for (const stmt of elStmts) {
      if (t.isVariableDeclaration(stmt)) {
        for (const decl of stmt.declarations) {
          if (t.isIdentifier(decl.id)) localNames.add(decl.id.name)
        }
      }
    }
    hoistEventHandlers(elStmts, cachedIdName, localNames, ctx)

    // Level 6: cache ensureItemSignal() calls and .firstChild text nodes
    // in computation getters/setters to avoid repeated function calls and
    // DOM traversals on every reactive update.
    cacheComputationPaths(elStmts, ctx)

    // Level 7: replace computation(() => sig.value, setter) with signalEffect(sig, setter)
    // for single-signal bindings — avoids Computation class instantiation entirely.
    convertToSignalEffect(elStmts, ctx.usedHelpers)
  }

  // Guard condition from ternary body: if (!(condition)) return comment node
  if (guardCondition) {
    createBodyStmts.push(
      t.ifStatement(
        t.unaryExpression('!', guardCondition),
        t.returnStatement(
          t.callExpression(
            t.memberExpression(t.identifier('document'), t.identifier('createComment')),
            [t.stringLiteral('')],
          ),
        ),
      ),
    )
  }

  createBodyStmts.push(...elStmts, t.returnStatement(elId))

  const createBody = t.blockStatement(createBodyStmts)

  // keyedList(parent, __anchorN, () => collection, (item) => item.id, (__itemGetter, __indexGetter) => { ... })
  const createFnParams = indexGetterParam
    ? [itemGetterParam, indexGetterParam]
    : [itemGetterParam]
  const keyedListArgs: t.Expression[] = [
    parentId,
    anchorIdentifier,
    t.arrowFunctionExpression([], subCollection),
    keyFn,
    t.arrowFunctionExpression(createFnParams, createBody),
  ]
  // When index param is unused, pass noIndex=true to skip index signal allocation
  if (!indexParam) {
    keyedListArgs.push(t.booleanLiteral(true))
  }
  stmts.push(
    t.expressionStatement(
      t.callExpression(t.identifier('keyedList'), keyedListArgs),
    ),
  )

  return stmts
}

/**
 * Transform a JSX element inside a keyedList create function.
 * Component props that reference the item param should use __itemGetter().prop
 * instead of direct item.prop access, for reactivity.
 */
function transformKeyedListElement(
  jsxEl: t.JSXElement,
  itemParam: t.Identifier,
  ctx: TransformContext,
): [t.Statement[], t.Identifier] {
  const opening = jsxEl.openingElement
  const tagName = getTagName(opening)

  if (isUpperCase(tagName)) {
    return transformKeyedListComponentElement(jsxEl, tagName, itemParam, ctx)
  }

  // For HTML elements inside keyed lists, the item var is already defined as local
  return transformHTMLElement(jsxEl, tagName, ctx)
}

function transformKeyedListComponentElement(
  jsxEl: t.JSXElement,
  tagName: string,
  itemParam: t.Identifier,
  ctx: TransformContext,
): [t.Statement[], t.Identifier] {
  const stmts: t.Statement[] = []
  const compId = `__comp${ctx.compCounter.value++}`
  const compIdentifier = t.identifier(compId)

  ctx.usedHelpers.add('mount')

  const props: t.ObjectProperty[] = []
  const attrs = jsxEl.openingElement.attributes

  for (const attr of attrs) {
    if (!t.isJSXAttribute(attr)) continue
    const name = t.isJSXIdentifier(attr.name) ? attr.name.name : ''
    if (!name || name === 'key') continue

    let valueExpr: t.Expression

    if (t.isStringLiteral(attr.value)) {
      valueExpr = attr.value
    } else if (t.isJSXExpressionContainer(attr.value) && t.isExpression(attr.value.expression)) {
      valueExpr = substituteExpression(attr.value.expression, ctx.subs)
    } else {
      continue
    }

    // For keyed list items, prop thunks that reference the item should use __itemGetter()
    // Replace references to the item param with __itemGetter() in prop thunks
    const thunkBody = replaceItemWithGetter(valueExpr, itemParam.name)
    const propKey = name.includes('-') ? t.stringLiteral(name) : t.identifier(name)
    props.push(
      t.objectProperty(
        propKey,
        t.arrowFunctionExpression([], thunkBody),
      ),
    )
  }

  // Process JSX children → children prop thunk
  const children = classifyChildren(jsxEl.children)
  if (children.length > 0) {
    const childBodyStmts: t.Statement[] = []
    const childIds: t.Identifier[] = []

    for (const child of children) {
      if (child.kind === 'text') {
        const textId = t.identifier(`__txt${ctx.elementCounter.value++}`)
        childBodyStmts.push(
          t.variableDeclaration('const', [
            t.variableDeclarator(textId,
              t.callExpression(
                t.memberExpression(t.identifier('document'), t.identifier('createTextNode')),
                [t.stringLiteral(child.value)],
              ),
            ),
          ]),
        )
        childIds.push(textId)
      } else if (child.kind === 'element') {
        const [childStmts, childId] = transformJSXElement(child.node, ctx)
        childBodyStmts.push(...childStmts)
        childIds.push(childId)
      } else if (child.kind === 'expression') {
        const substituted = substituteExpression(child.expression, ctx.subs)
        const subExpr = replaceItemWithGetter(substituted, itemParam.name)
        if (children.length === 1) {
          childBodyStmts.push(t.returnStatement(subExpr))
          props.push(
            t.objectProperty(
              t.identifier('children'),
              t.arrowFunctionExpression([], t.blockStatement(childBodyStmts)),
            ),
          )
          break
        }
        const textId = t.identifier(`__txt${ctx.elementCounter.value++}`)
        ctx.usedHelpers.add('reactiveText')
        childBodyStmts.push(
          t.variableDeclaration('const', [
            t.variableDeclarator(textId,
              t.callExpression(t.identifier('reactiveText'), [
                t.arrowFunctionExpression([], subExpr),
              ]),
            ),
          ]),
        )
        childIds.push(textId)
      }
    }

    if (childIds.length > 0) {
      let returnExpr: t.Expression
      if (childIds.length === 1) {
        returnExpr = childIds[0]
      } else {
        const fragId = t.identifier('__frag')
        childBodyStmts.unshift(
          t.variableDeclaration('const', [
            t.variableDeclarator(fragId,
              t.callExpression(
                t.memberExpression(t.identifier('document'), t.identifier('createDocumentFragment')),
                [],
              ),
            ),
          ]),
        )
        for (const cid of childIds) {
          childBodyStmts.push(
            t.expressionStatement(
              t.callExpression(t.memberExpression(fragId, t.identifier('appendChild')), [cid]),
            ),
          )
        }
        returnExpr = fragId
      }
      childBodyStmts.push(t.returnStatement(returnExpr))
      props.push(
        t.objectProperty(
          t.identifier('children'),
          t.arrowFunctionExpression([], t.blockStatement(childBodyStmts)),
        ),
      )
    }
  }

  stmts.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        compIdentifier,
        t.callExpression(t.identifier('mount'), [
          t.identifier(tagName),
          t.objectExpression(props),
        ]),
      ),
    ]),
  )

  return [stmts, compIdentifier]
}

/**
 * Replace references to `itemName` with `__itemGetter()` in an expression.
 * E.g., `todo.id` → `__itemGetter().id`, `todo` → `__itemGetter()`
 */
function replaceItemWithGetter(expr: t.Expression, itemName: string): t.Expression {
  const cloned = t.cloneDeep(expr)
  return replaceItemInNode(cloned, itemName) as t.Expression
}

function replaceItemInNode(node: t.Node, itemName: string): t.Node {
  // If this is a MemberExpression like `item.prop`, replace item with __itemGetter()
  if (t.isMemberExpression(node) && t.isIdentifier(node.object, { name: itemName })) {
    node.object = t.callExpression(t.identifier('__itemGetter'), []) as any
    // Still recurse into the property if computed
    if (node.computed && node.property) {
      node.property = replaceItemInNode(node.property, itemName) as t.Expression
    }
    return node
  }

  // Standalone identifier
  if (t.isIdentifier(node) && node.name === itemName) {
    return t.callExpression(t.identifier('__itemGetter'), [])
  }

  // Recurse
  for (const key of t.VISITOR_KEYS[node.type] || []) {
    const child = (node as any)[key]
    if (Array.isArray(child)) {
      for (let i = 0; i < child.length; i++) {
        if (child[i] && typeof child[i].type === 'string') {
          child[i] = replaceItemInNode(child[i], itemName)
        }
      }
    } else if (child && typeof child === 'object' && typeof child.type === 'string') {
      // Don't replace in non-computed property names
      if (t.isMemberExpression(node) && key === 'property' && !node.computed) continue
      if (t.isObjectProperty(node) && key === 'key' && !node.computed) continue
      // Don't replace in arrow/function params
      if ((t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) && key === 'params') continue

      ;(node as any)[key] = replaceItemInNode(child, itemName)
    }
  }

  return node
}

/**
 * Post-process keyed-list element statements: replace computation() calls
 * whose getter returns a constant (__-prefixed identifier) with a direct
 * DOM assignment.  This eliminates Computation allocation + self-disposal
 * overhead for static values like the cached key property.
 *
 * Before:  computation(() => __id, (__v) => __el0.firstChild.data = __v)
 * After:   __el0.firstChild.data = __id
 */
function optimizeConstantComputations(stmts: t.Statement[]): void {
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i]
    if (!t.isExpressionStatement(stmt)) continue
    const expr = stmt.expression
    if (!t.isCallExpression(expr)) continue
    if (!t.isIdentifier(expr.callee, { name: 'computation' })) continue
    if (expr.arguments.length !== 2) continue

    const getter = expr.arguments[0]
    if (!t.isArrowFunctionExpression(getter)) continue
    const getterBody = getter.body
    // Only optimize if the getter returns a __-prefixed identifier (cached constant)
    if (!t.isIdentifier(getterBody) || !getterBody.name.startsWith('__')) continue

    const cachedName = getterBody.name
    const setter = expr.arguments[1]
    if (!t.isArrowFunctionExpression(setter)) continue
    if (setter.params.length !== 1 || !t.isIdentifier(setter.params[0])) continue

    const paramName = setter.params[0].name
    const setterBody = setter.body

    // Expression body: (__v) => el.firstChild.data = __v
    if (t.isAssignmentExpression(setterBody)) {
      const newAssignment = t.cloneDeep(setterBody)
      replaceIdentifierByName(newAssignment, paramName, cachedName)
      // #5: Wrap the RHS in String() when assigning to .data
      // (.data expects a string; implicit conversion is slower than explicit)
      if (t.isMemberExpression(newAssignment.left) &&
          t.isIdentifier(newAssignment.left.property, { name: 'data' })) {
        newAssignment.right = t.callExpression(t.identifier('String'), [newAssignment.right])
      }
      stmts[i] = t.expressionStatement(newAssignment)
    }
  }
}

/**
 * Level 4 optimization: merge 2+ adjacent computation() calls into a single
 * mergedComputation([[getter1, setter1], [getter2, setter2], ...]) call.
 *
 * This creates one EffectNode instead of N, reducing per-row allocation
 * in keyed lists. Only merges consecutive computation() statements — any
 * non-computation statement breaks the run.
 */
function mergeAdjacentComputations(
  stmts: t.Statement[],
  usedHelpers: Set<RuntimeHelper>,
): void {
  // Find runs of consecutive computation() calls
  let runStart = -1
  let runLength = 0

  // Process backwards so splicing doesn't invalidate earlier indices
  const runs: [number, number][] = [] // [start, length]

  for (let i = 0; i < stmts.length; i++) {
    if (isComputationCall(stmts[i])) {
      if (runStart === -1) runStart = i
      runLength++
    } else {
      if (runLength >= 2) {
        runs.push([runStart, runLength])
      }
      runStart = -1
      runLength = 0
    }
  }
  // Final run
  if (runLength >= 2) {
    runs.push([runStart, runLength])
  }

  if (runs.length === 0) return

  // Process runs in reverse order so splicing is safe
  for (let r = runs.length - 1; r >= 0; r--) {
    const [start, len] = runs[r]
    const pairs: t.Expression[] = []

    for (let i = start; i < start + len; i++) {
      const stmt = stmts[i] as t.ExpressionStatement
      const call = stmt.expression as t.CallExpression
      const getter = call.arguments[0] as t.Expression
      const setter = call.arguments[1] as t.Expression
      pairs.push(t.arrayExpression([getter, setter]))
    }

    const mergedCall = t.expressionStatement(
      t.callExpression(t.identifier('mergedComputation'), [
        t.arrayExpression(pairs),
      ]),
    )

    stmts.splice(start, len, mergedCall)
  }

  usedHelpers.add('mergedComputation')
}

/** Check if a statement is `computation(getter, setter)` */
function isComputationCall(stmt: t.Statement): boolean {
  if (!t.isExpressionStatement(stmt)) return false
  const expr = stmt.expression
  if (!t.isCallExpression(expr)) return false
  if (!t.isIdentifier(expr.callee, { name: 'computation' })) return false
  return expr.arguments.length === 2
}

/**
 * Proxy elimination: in computation() getters inside keyed lists, replace
 * `item.prop` with `__itemSignal(item, 'prop').value`.
 *
 * This makes the computation subscribe to the signal directly, without
 * needing an item Proxy. The keyed-list passes raw (non-proxied) items,
 * so reactive access must go through __itemSignal().
 *
 * Before:  computation(() => item.label, setter)
 * After:   computation(() => __itemSignal(item, 'label').value, setter)
 */
function transformItemSignalAccess(
  stmts: t.Statement[],
  itemParamName: string,
  usedHelpers: Set<RuntimeHelper>,
): void {
  let transformed = false

  for (const stmt of stmts) {
    if (!t.isExpressionStatement(stmt)) continue
    const expr = stmt.expression
    if (!t.isCallExpression(expr)) continue
    // Match computation(), mergedComputation(), reactiveAttr(), reactiveText()
    const calleeName = t.isIdentifier(expr.callee) ? expr.callee.name : null
    if (!calleeName || !['computation', 'mergedComputation', 'reactiveAttr', 'reactiveText'].includes(calleeName)) continue

    // For reactiveAttr(el, name, getter): transform getter (3rd arg)
    if (calleeName === 'reactiveAttr' && expr.arguments.length === 3) {
      const getter = expr.arguments[2]
      if (t.isArrowFunctionExpression(getter)) {
        const result = transformGetterBody(getter, itemParamName)
        if (result) transformed = true
      }
    }

    // For reactiveText(el, getter): transform getter (2nd arg)
    if (calleeName === 'reactiveText' && expr.arguments.length === 2) {
      const getter = expr.arguments[1]
      if (t.isArrowFunctionExpression(getter)) {
        const result = transformGetterBody(getter, itemParamName)
        if (result) transformed = true
      }
    }

    // For computation(getter, setter): transform getter
    // For mergedComputation([[getter, setter], ...]): transform each getter
    if (calleeName === 'computation' && expr.arguments.length === 2) {
      const getter = expr.arguments[0]
      if (t.isArrowFunctionExpression(getter)) {
        const result = transformGetterBody(getter, itemParamName)
        if (result) transformed = true
      }
    } else if (calleeName === 'mergedComputation' && expr.arguments.length === 1) {
      const pairsArr = expr.arguments[0]
      if (t.isArrayExpression(pairsArr)) {
        for (const pair of pairsArr.elements) {
          if (t.isArrayExpression(pair) && pair.elements.length === 2) {
            const getter = pair.elements[0]
            if (t.isArrowFunctionExpression(getter)) {
              const result = transformGetterBody(getter, itemParamName)
              if (result) transformed = true
            }
          }
        }
      }
    }
  }

  if (transformed) {
    usedHelpers.add('itemSignal')
  }
}

/**
 * Transform an arrow function getter's body, handling both:
 * - Direct: () => item.prop  (body IS the MemberExpression)
 * - Nested: () => item.a + item.b  (body contains MemberExpressions)
 */
function transformGetterBody(
  getter: t.ArrowFunctionExpression,
  itemName: string,
): boolean {
  const body = getter.body
  // Direct case: () => item.prop
  if (isItemMember(body, itemName)) {
    getter.body = makeItemSignalAccess(itemName, (body as t.MemberExpression).property as t.Identifier)
    return true
  }
  // Nested case: walk the body and replace item.prop nodes
  return replaceItemMemberWithSignal(body, itemName)
}

function isItemMember(node: any, itemName: string): boolean {
  return t.isMemberExpression(node) &&
    !node.computed &&
    t.isIdentifier(node.object, { name: itemName }) &&
    t.isIdentifier(node.property)
}

function makeItemSignalAccess(itemName: string, prop: t.Identifier): t.MemberExpression {
  return t.memberExpression(
    t.callExpression(t.identifier('itemSignal'), [
      t.identifier(itemName),
      t.stringLiteral(prop.name),
    ]),
    t.identifier('value'),
  )
}

/**
 * Recursively replace `item.prop` MemberExpression nodes with
 * `__itemSignal(item, 'prop').value` in an AST subtree.
 * Returns true if any replacement was made.
 */
function replaceItemMemberWithSignal(node: any, itemName: string): boolean {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) {
    let changed = false
    for (let i = 0; i < node.length; i++) {
      if (replaceItemMemberWithSignal(node[i], itemName)) changed = true
    }
    return changed
  }
  if (!node.type) return false

  let changed = false

  // Walk child nodes first (bottom-up), then check this node's parent context
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue
    const child = node[key]
    if (!child || typeof child !== 'object') continue

    // Check if child is item.prop MemberExpression
    if (child.type === 'MemberExpression' &&
        !child.computed &&
        child.object?.type === 'Identifier' &&
        child.object.name === itemName &&
        child.property?.type === 'Identifier') {
      const propName = child.property.name
      // Replace item.prop with __itemSignal(item, 'prop').value
      node[key] = t.memberExpression(
        t.callExpression(t.identifier('itemSignal'), [
          t.identifier(itemName),
          t.stringLiteral(propName),
        ]),
        t.identifier('value'),
      )
      changed = true
    } else {
      if (replaceItemMemberWithSignal(child, itemName)) changed = true
    }
  }

  return changed
}

/** Replace all Identifier nodes with name `oldName` → `newName` in an AST subtree. */
function replaceIdentifierByName(node: any, oldName: string, newName: string): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) replaceIdentifierByName(node[i], oldName, newName)
    return
  }
  if (node.type === 'Identifier' && node.name === oldName) {
    node.name = newName
    return
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue
    replaceIdentifierByName(node[key], oldName, newName)
  }
}

/**
 * Walk an AST node and replace `itemName.propName` with `cachedName`.
 * This caches the key property (like `id`) to avoid Proxy trap on every access.
 */
function replaceItemPropWithCached(
  node: any,
  itemName: string,
  propName: string,
  cachedName: string,
): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) replaceItemPropWithCached(node[i], itemName, propName, cachedName)
    return
  }
  // Match: MemberExpression with object=Identifier(itemName) and property=Identifier(propName)
  if (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.object?.type === 'Identifier' &&
    node.object.name === itemName &&
    node.property?.type === 'Identifier' &&
    node.property.name === propName
  ) {
    // Replace with Identifier(cachedName)
    node.type = 'Identifier'
    node.name = cachedName
    delete node.object
    delete node.property
    delete node.computed
    delete node.optional
    return
  }
  // Recurse into all properties
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue
    replaceItemPropWithCached(node[key], itemName, propName, cachedName)
  }
}

/**
 * Hoist event handlers in keyed lists that only capture the cached key id.
 * Eliminates per-row closure allocation by using a shared module-level handler
 * and storing the key as a data expando on the element.
 * Also inlines the event expando assignment to avoid delegateEvent function call overhead.
 *
 * Before:  delegateEvent(__el0, "click", () => store.select(__id))
 * After:   __el0.__gea_d = __id; __el0.__gea_click = _h0
 *          // module level: ensureDelegation("click")
 *          //               const _h0 = (__e) => store.select(__e.currentTarget.__gea_d)
 */
function hoistEventHandlers(
  stmts: t.Statement[],
  cachedIdName: string,
  localNames: Set<string>,
  ctx: TransformContext,
): void {
  const ensuredEvents = new Set<string>()
  for (let i = stmts.length - 1; i >= 0; i--) {
    const stmt = stmts[i]
    if (!t.isExpressionStatement(stmt)) continue
    const expr = stmt.expression
    if (!t.isCallExpression(expr)) continue
    if (!t.isIdentifier(expr.callee, { name: 'delegateEvent' })) continue
    if (expr.arguments.length !== 3) continue

    const elNode = expr.arguments[0]
    const eventLiteral = expr.arguments[1]
    const handler = expr.arguments[2]
    if (!t.isArrowFunctionExpression(handler)) continue
    if (handler.params.length !== 0) continue // only no-param arrows
    if (!t.isStringLiteral(eventLiteral)) continue

    const eventName = eventLiteral.value

    // Collect all Identifier references in the handler body
    const refs = new Set<string>()
    collectIdentifiers(handler.body, refs)

    // Check which locals are referenced
    const localRefs = new Set<string>()
    for (const ref of refs) {
      if (localNames.has(ref)) localRefs.add(ref)
    }

    // Only hoist if the sole local reference is the cached key id
    if (localRefs.size !== 1 || !localRefs.has(cachedIdName)) continue

    // Hoist: create module-level handler
    const handlerId = `_h${ctx.templateCounter.value++}`
    const handlerIdentifier = t.identifier(handlerId)
    const paramId = t.identifier('__e')

    // Clone the handler body and replace cachedIdName with __e.currentTarget.__gea_d
    const hoistedBody = t.cloneDeep(handler.body) as t.Expression
    replaceIdentifierWithExpr(hoistedBody, cachedIdName,
      t.memberExpression(
        t.memberExpression(paramId, t.identifier('currentTarget')),
        t.identifier('__gea_d'),
      ),
    )

    ctx.templateDeclarations.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          handlerIdentifier,
          t.arrowFunctionExpression([paramId], hoistedBody),
        ),
      ]),
    )

    // Emit ensureDelegation("event") once at module level per event type
    if (!ensuredEvents.has(eventName)) {
      ensuredEvents.add(eventName)
      ctx.usedHelpers.add('ensureDelegation')
      ctx.templateDeclarations.push(
        t.expressionStatement(
          t.callExpression(t.identifier('ensureDelegation'), [t.stringLiteral(eventName)]),
        ),
      )
    }

    // Replace the delegateEvent call with inline expando assignments:
    // el.__gea_d = __id; el.__gea_<event> = _hoistedHandler
    const assignData = t.expressionStatement(
      t.assignmentExpression('=',
        t.memberExpression(elNode as t.Expression, t.identifier('__gea_d')),
        t.identifier(cachedIdName),
      ),
    )
    const assignHandler = t.expressionStatement(
      t.assignmentExpression('=',
        t.memberExpression(elNode as t.Expression, t.identifier(`__gea_${eventName}`)),
        handlerIdentifier,
      ),
    )

    // Replace the delegateEvent statement with data + handler assignments
    stmts.splice(i, 1, assignData, assignHandler)
  }
}

/** Collect all Identifier names referenced in an AST subtree. */
function collectIdentifiers(node: any, out: Set<string>): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) collectIdentifiers(node[i], out)
    return
  }
  if (node.type === 'Identifier') {
    out.add(node.name)
    return
  }
  // Don't descend into nested function scopes (they have their own locals)
  if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') return
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue
    collectIdentifiers(node[key], out)
  }
}

/** Replace all Identifier nodes with a given name by a cloned expression. */
function replaceIdentifierWithExpr(node: any, name: string, replacement: t.Expression): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (node[i]?.type === 'Identifier' && node[i].name === name) {
        node[i] = t.cloneDeep(replacement)
      } else {
        replaceIdentifierWithExpr(node[i], name, replacement)
      }
    }
    return
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue
    const child = node[key]
    if (!child || typeof child !== 'object') continue
    if (child.type === 'Identifier' && child.name === name) {
      node[key] = t.cloneDeep(replacement)
    } else {
      replaceIdentifierWithExpr(child, name, replacement)
    }
  }
}

/**
 * Cache computation paths: extract ensureItemSignal() calls from getters into
 * local variables, and pre-cache .firstChild text node references from setters.
 *
 * Before:  computation(() => ensureItemSignal(row, "label").value, (__v) => __walk1.firstChild.data = __v)
 * After:   const __sig0 = ensureItemSignal(row, "label");
 *          const __txt0 = __walk1.firstChild;
 *          computation(() => __sig0.value, (__v) => __txt0.data = __v)
 */
function cacheComputationPaths(
  stmts: t.Statement[],
  ctx: TransformContext,
): void {
  let sigCounter = 0
  let txtCounter = 0

  // Collect all computation/mergedComputation pairs to process
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i]
    if (!t.isExpressionStatement(stmt)) continue
    const expr = stmt.expression
    if (!t.isCallExpression(expr)) continue

    const pairs: [t.Expression, t.Expression][] = []
    if (t.isIdentifier(expr.callee, { name: 'computation' }) && expr.arguments.length === 2) {
      pairs.push([expr.arguments[0] as t.Expression, expr.arguments[1] as t.Expression])
    } else if (t.isIdentifier(expr.callee, { name: 'mergedComputation' }) && expr.arguments.length === 1) {
      const arr = expr.arguments[0]
      if (t.isArrayExpression(arr)) {
        for (const el of arr.elements) {
          if (t.isArrayExpression(el) && el.elements.length === 2) {
            pairs.push([el.elements[0] as t.Expression, el.elements[1] as t.Expression])
          }
        }
      }
    } else {
      continue
    }

    const insertions: t.Statement[] = []

    for (const [getter, setter] of pairs) {
      // #3: Cache ensureItemSignal(item, "prop") from getter
      // Pattern: () => ensureItemSignal(item, "prop").value
      if (t.isArrowFunctionExpression(getter) && t.isMemberExpression(getter.body) &&
          t.isIdentifier(getter.body.property, { name: 'value' }) &&
          t.isCallExpression(getter.body.object) &&
          (t.isIdentifier(getter.body.object.callee, { name: 'ensureItemSignal' }) ||
           t.isIdentifier(getter.body.object.callee, { name: 'itemSignal' }))) {
        const sigId = `__sig${sigCounter++}`
        insertions.push(
          t.variableDeclaration('const', [
            t.variableDeclarator(
              t.identifier(sigId),
              getter.body.object, // the ensureItemSignal(...) call
            ),
          ]),
        )
        // Replace getter body: ensureItemSignal(...).value → __sigN.value
        getter.body = t.memberExpression(t.identifier(sigId), t.identifier('value'))
      }

      // #4: Cache .firstChild text node from setter
      // Pattern: (__v) => expr.firstChild.data = __v
      if (t.isArrowFunctionExpression(setter) && t.isAssignmentExpression(setter.body) &&
          t.isMemberExpression(setter.body.left) &&
          t.isIdentifier(setter.body.left.property, { name: 'data' }) &&
          t.isMemberExpression(setter.body.left.object) &&
          t.isIdentifier(setter.body.left.object.property, { name: 'firstChild' })) {
        const txtId = `__txt${txtCounter++}`
        insertions.push(
          t.variableDeclaration('const', [
            t.variableDeclarator(
              t.identifier(txtId),
              setter.body.left.object, // the el.firstChild expression
            ),
          ]),
        )
        // Replace setter target: el.firstChild.data → __txtN.data
        setter.body.left = t.memberExpression(t.identifier(txtId), t.identifier('data'))
      }
    }

    if (insertions.length > 0) {
      stmts.splice(i, 0, ...insertions)
      i += insertions.length // skip past the insertions
    }
  }
}

/**
 * Detect the pattern: signalExpr === matchExpr ? trueVal : falseVal
 * Used to optimize select-row with O(1) __selectorAttr instead of O(n) reactiveAttr.
 *
 * Returns the signal expression, match value, true value, and false value,
 * or null if the pattern doesn't match.
 */
function detectSelectorPattern(expr: t.Expression): {
  signal: t.Expression
  matchValue: t.Expression
  trueVal: t.Expression
  falseVal: t.Expression
} | null {
  // Must be a ConditionalExpression: test ? consequent : alternate
  if (!t.isConditionalExpression(expr)) return null

  const test = expr.test
  // Test must be BinaryExpression with ===
  if (!t.isBinaryExpression(test) || test.operator !== '===') return null

  const { left, right } = test

  // One side should be a MemberExpression (signal read, e.g., store.selected)
  // The other should be an Identifier (cached value, e.g., __id)
  let signalExpr: t.Expression | null = null
  let matchExpr: t.Expression | null = null

  // One side is the signal (MemberExpression like store.selected)
  // The other is the match value (Identifier like __id, or MemberExpression like row.id)
  if (t.isMemberExpression(left) && (t.isIdentifier(right) || t.isMemberExpression(right))) {
    // Left could be the signal, right could be the match — or vice versa.
    // Heuristic: the signal is the one whose object is a known store (not the item param).
    // For now, assume left is signal if right looks like item.prop
    signalExpr = left
    matchExpr = right
  } else if ((t.isIdentifier(left) || t.isMemberExpression(left)) && t.isMemberExpression(right)) {
    signalExpr = right
    matchExpr = left
  } else {
    return null
  }

  // The MemberExpression should access a store property (e.g., store.selected)
  // For selectorAttr, we need the actual signal object, not a getter call.
  // The compiled Store has `get selected() { return wrapSignalValue(this[_SIG_SELECTED]) }`
  // So `store.selected` goes through the getter. We need `store[Symbol.for('gea.field.selected')]` (the signal itself).
  if (!t.isMemberExpression(signalExpr) || !t.isIdentifier(signalExpr.property)) return null
  const propName = signalExpr.property.name
  const directSignalExpr = t.memberExpression(
    t.cloneNode(signalExpr.object),
    t.callExpression(
      t.memberExpression(t.identifier('Symbol'), t.identifier('for')),
      [t.stringLiteral(`gea.field.${propName}`)],
    ),
    true,
  )

  // Consequent and alternate should be string literals (or at least expressions)
  return {
    signal: directSignalExpr,
    matchValue: matchExpr as t.Expression,
    trueVal: expr.consequent,
    falseVal: expr.alternate,
  }
}

/**
 * Level 7: Convert computation(() => sig.value, setter) to signalEffect(sig, setter)
 * when the getter is a simple .value read on a known signal identifier.
 * This eliminates the Computation class instantiation (14 fields + .bind()).
 *
 * Pattern detected:
 *   computation(() => __sigN.value, (v) => ...)
 * Replaced with:
 *   signalEffect(__sigN, (v) => ...)
 */
function convertToSignalEffect(stmts: t.Statement[], usedHelpers: Set<string>): void {
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i]
    if (!t.isExpressionStatement(stmt)) continue
    const expr = stmt.expression
    if (!t.isCallExpression(expr)) continue
    if (!t.isIdentifier(expr.callee, { name: 'computation' })) continue
    if (expr.arguments.length !== 2) continue

    const getter = expr.arguments[0]
    const setter = expr.arguments[1]

    // Check getter is () => __sigN.value
    if (!t.isArrowFunctionExpression(getter)) continue
    if (getter.params.length !== 0) continue
    const body = getter.body
    if (!t.isMemberExpression(body)) continue
    if (!t.isIdentifier(body.property, { name: 'value' })) continue
    if (!t.isIdentifier(body.object)) continue
    // The object should be a cached signal variable (starts with __sig)
    const sigName = body.object.name
    if (!sigName.startsWith('__sig')) continue

    // Replace: computation(() => __sigN.value, setter) → signalEffect(__sigN, setter)
    usedHelpers.add('signalEffect')
    stmts[i] = t.expressionStatement(
      t.callExpression(t.identifier('signalEffect'), [
        t.identifier(sigName),
        setter as t.Expression,
      ]),
    )
  }
}

/**
 * Transform `__props.X.Y` → `__itemSignal(__props.X, 'Y').value` in component
 * template code. This ensures that when a store array item is passed as a prop
 * and its properties are read in reactive contexts (reactiveAttr, computation),
 * the read goes through the item's signal for proper subscription.
 *
 * Only transforms nested property access on __props (not __props.X itself,
 * which goes through the props proxy thunks).
 */
export function transformPropItemAccess(
  stmts: t.Statement[],
  usedHelpers: Set<RuntimeHelper>,
): void {
  let transformed = false
  for (const stmt of stmts) {
    walkPropItemAccess(stmt, () => { transformed = true })
  }
  if (transformed) {
    usedHelpers.add('itemSignal')
  }
}

/**
 * Check if a node is a `__props.X.Y` pattern:
 *   - The node is a non-computed MemberExpression with identifier property Y
 *   - Its object is `__props.X` (non-computed, identifier X)
 */
// Properties that should NOT be wrapped with __itemSignal (built-in, non-configurable, or methods)
const SKIP_ITEM_SIGNAL_PROPS = new Set([
  'length', 'constructor', 'prototype', '__proto__',
  'toString', 'valueOf', 'toLocaleString', 'hasOwnProperty',
  'isPrototypeOf', 'propertyIsEnumerable',
])

function isPropsItemAccess(node: t.MemberExpression): { propIdent: string; fieldName: string } | null {
  if (node.computed || !t.isIdentifier(node.property)) return null
  if (SKIP_ITEM_SIGNAL_PROPS.has(node.property.name)) return null
  const obj = node.object
  if (!t.isMemberExpression(obj) || obj.computed) return null
  if (!t.isIdentifier(obj.object, { name: '__props' })) return null
  if (!t.isIdentifier(obj.property)) return null
  return { propIdent: obj.property.name, fieldName: node.property.name }
}

function walkPropItemAccess(node: any, onTransform: () => void): void {
  if (!node || typeof node !== 'object') return

  // For CallExpressions: if the callee is __props.X.Y(...), DON'T transform
  // the callee (it's a method call like .filter(), .bind(), .find(), etc.)
  // but DO recurse into arguments
  if (t.isCallExpression(node)) {
    // Skip callee — don't transform method calls
    // Recurse into arguments only
    for (const arg of node.arguments) {
      if (arg && typeof arg === 'object' && (arg as any).type) {
        walkPropItemAccess(arg, onTransform)
      }
    }
    return
  }

  // Detect __props.X.Y pattern and transform (only when not a method callee)
  if (t.isMemberExpression(node)) {
    const match = isPropsItemAccess(node)
    if (match) {
      // Transform to __itemSignal(__props.X, 'Y').value
      const propsAccess = t.memberExpression(
        t.identifier('__props'),
        t.identifier(match.propIdent),
      )
      const itemSignalCall = t.callExpression(t.identifier('itemSignal'), [
        propsAccess,
        t.stringLiteral(match.fieldName),
      ])
      ;(node as any).object = itemSignalCall
      ;(node as any).property = t.identifier('value')
      ;(node as any).computed = false
      onTransform()
      return
    }
  }

  // Generic recursion
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' ||
        key === 'leadingComments' || key === 'trailingComments') continue
    const child = (node as any)[key]
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && item.type) {
          walkPropItemAccess(item, onTransform)
        }
      }
    } else if (child && typeof child === 'object' && child.type) {
      walkPropItemAccess(child, onTransform)
    }
  }
}
