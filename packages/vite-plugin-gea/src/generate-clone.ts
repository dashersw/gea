import * as t from '@babel/types'
import type { AnalysisResult } from './analyze.ts'
import { buildElementNavExpr, childPathRefName, templateRequiresRerender } from './generate-array-patch.ts'
import { transformJSXExpression, type Ctx } from './transform-jsx.ts'
import {
  getHoistableRootEvent,
  getPropContext,
  getRootClassSelector,
  toGeaEventType,
  EVENT_NAMES,
} from './component-event-helpers.ts'
import {
  buildTrimmedClassValueExpression,
  camelToKebab,
  getDirectChildElements,
  getJSXTagName,
  isComponentTag,
  replacePropRefsInExpression,
} from './utils.ts'

const EVENT_TYPES = new Set([
  'click',
  'dblclick',
  'change',
  'input',
  'keydown',
  'keyup',
  'blur',
  'focus',
  'mousedown',
  'mouseup',
  'submit',
  'tap',
  'longTap',
  'swipeRight',
  'swipeUp',
  'swipeLeft',
  'swipeDown',
  'dragstart',
  'dragend',
  'dragover',
  'dragleave',
  'drop',
])

/** HTML parent tags where it is safe to insert an arbitrary placeholder child element. */
const SAFE_CLONE_PARENTS = new Set([
  'div', 'span', 'section', 'article', 'header', 'footer', 'main', 'nav', 'figure',
])

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

function toHtmlAttrName(attrName: string, isComponent: boolean): string {
  if (isComponent) return `data-prop-${camelToKebab(attrName)}`
  if (attrName === 'className') return 'class'
  return attrName
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Match transform-jsx normalizeJSXText for static text emission. */
function normalizeJSXText(raw: string): string {
  const lines = raw.split(/\r\n|\n|\r/)
  let lastNonEmptyLine = 0
  for (let i = 0; i < lines.length; i++) {
    if (/[^ \t]/.test(lines[i])) lastNonEmptyLine = i
  }
  let str = ''
  for (let i = 0; i < lines.length; i++) {
    const isFirstLine = i === 0
    const isLastLine = i === lines.length - 1
    const isLastNonEmptyLine = i === lastNonEmptyLine
    let trimmed = lines[i].replace(/\t/g, ' ')
    if (!isFirstLine) trimmed = trimmed.replace(/^[ ]+/, '')
    if (!isLastLine) trimmed = trimmed.replace(/[ ]+$/, '')
    if (trimmed) {
      if (!isLastNonEmptyLine) trimmed += ' '
      str += trimmed
    }
  }
  return str
}

export type CloneContentPatch = {
  childPath: number[]
  type: 'text' | 'className' | 'attribute' | 'checked'
  expression: t.Expression
  attributeName?: string
}

export type CloneIdentityPatch =
  | { kind: 'id'; childPath: number[]; expr: t.Expression }
  | { kind: 'dataGeaEvent'; childPath: number[]; token: string }
  | { kind: 'attr'; childPath: number[]; expr: t.Expression; attrName: string }

export type CloneComponentSlotPatch = {
  childPath: number[]
  instanceVar: string
}

function buildEventIdExpr(suffix?: string): t.Expression {
  if (!suffix) return t.memberExpression(t.thisExpression(), t.identifier('id'))
  return t.binaryExpression(
    '+',
    t.memberExpression(t.thisExpression(), t.identifier('id')),
    t.stringLiteral('-' + suffix),
  )
}

/**
 * Emit static HTML skeleton (no compiler ids, no data-gea-event, no dynamic attrs).
 * Returns null if the tree contains unsupported patterns for clone optimization.
 */
export function jsxToStaticHtml(
  node: t.JSXElement,
  refCounter: { value: number },
  elementPath: string[] = [],
  _isRoot = true,
  parentTag?: string,
): string | null {
  const tagName = getJSXTagName(node.openingElement.name)
  const isComp = Boolean(tagName && isComponentTag(tagName))
  if (isComp) {
    if (!parentTag || !SAFE_CLONE_PARENTS.has(parentTag)) return null
    return `<${parentTag} data-gea-child-slot></${parentTag}>`
  }

  const effectiveTag = tagName!
  let html = `<${effectiveTag}`

  for (const attr of node.openingElement.attributes) {
    if (t.isJSXSpreadAttribute(attr)) return null
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue
    const attrName = attr.name.name
    if (attrName === 'key') continue
    if (attrName === 'id') {
      const idVal = attr.value
      if (t.isStringLiteral(idVal)) {
        html += ` id="${escapeHtml(idVal.value)}"`
      }
      continue
    }
    if (attrName === 'ref') {
      const attrValue = attr.value
      if (t.isJSXExpressionContainer(attrValue) && !t.isJSXEmptyExpression(attrValue.expression)) {
        const refId = `ref${refCounter.value++}`
        html += ` data-gea-ref="${refId}"`
      }
      continue
    }
    const attrValue = attr.value
    const propAttrName = toHtmlAttrName(attrName, false)
    const eventType = toGeaEventType(attrName)
    if (t.isJSXExpressionContainer(attrValue) && !t.isJSXEmptyExpression(attrValue.expression)) {
      if (EVENT_TYPES.has(eventType)) continue
      if (attrName === 'checked') continue
      if (attrName === 'class' || attrName === 'className') continue
      if (propAttrName === 'style') continue
      return null
    }
    if (t.isStringLiteral(attrValue)) {
      html += ` ${propAttrName}="${escapeHtml(attrValue.value)}"`
    } else if (attrValue === null) {
      html += ` ${propAttrName}`
    }
  }

  if (node.openingElement.selfClosing) {
    if (VOID_ELEMENTS.has(effectiveTag)) {
      return html + ' />'
    }
    return html + `></${effectiveTag}>`
  }

  html += '>'
  const childHtml = processStaticChildren(node.children, refCounter, elementPath, undefined, undefined, effectiveTag)
  if (childHtml === null) return null
  return html + childHtml + `</${effectiveTag}>`
}

function processStaticChildren(
  children: t.JSXElement['children'],
  refCounter: { value: number },
  parentPath: string[],
  dcCursor?: { index: number },
  directChildren?: ReturnType<typeof getDirectChildElements>,
  parentTag?: string,
): string | null {
  const cursor = dcCursor ?? { index: 0 }
  const dc = directChildren ?? getDirectChildElements(children as any)
  let out = ''
  for (const child of children) {
    if (t.isJSXText(child)) {
      const normalized = normalizeJSXText(child.value)
      if (normalized) out += escapeHtml(normalized)
    } else if (t.isJSXElement(child)) {
      const seg = dc[cursor.index]?.selectorSegment
      cursor.index++
      const nextPath = seg ? [...parentPath, seg] : parentPath
      const inner = jsxToStaticHtml(child, refCounter, nextPath, false, parentTag)
      if (inner === null) return null
      out += inner
    } else if (t.isJSXFragment(child)) {
      const inner = processStaticChildren(child.children, refCounter, parentPath, cursor, dc, parentTag)
      if (inner === null) return null
      out += inner
    } else if (t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression)) {
      return null
    }
  }
  return out
}

/** Walk JSX for dynamic content patches (mirrors generate-array-patch walkJSXForPatch + checked). */
export function collectClonePatchEntries(
  node: t.JSXElement,
  path: number[],
  entries: CloneContentPatch[],
  rootIsComponent = false,
): void {
  const isRootLevel = path.length === 0 && rootIsComponent

  for (const attr of node.openingElement.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue
    const name = attr.name.name

    if (
      name === 'key' ||
      name === 'id' ||
      name === 'ref' ||
      EVENT_NAMES.has(name) ||
      EVENT_NAMES.has(toGeaEventType(name))
    )
      continue

    if (!t.isJSXExpressionContainer(attr.value) || t.isJSXEmptyExpression(attr.value.expression)) continue

    if (name === 'class' || name === 'className') {
      entries.push({
        childPath: [...path],
        type: 'className',
        expression: t.cloneNode(attr.value.expression as t.Expression, true),
      })
    } else if (name === 'checked') {
      entries.push({
        childPath: [...path],
        type: 'checked',
        expression: t.cloneNode(attr.value.expression as t.Expression, true),
      })
    } else {
      entries.push({
        childPath: [...path],
        type: 'attribute',
        expression: t.cloneNode(attr.value.expression as t.Expression, true),
        attributeName: isRootLevel ? `data-prop-${camelToKebab(name)}` : name,
      })
    }
  }

  let hasElementChild = false
  const textParts: Array<{ raw: string } | { expr: t.Expression }> = []

  for (const child of node.children) {
    if (t.isJSXElement(child)) {
      hasElementChild = true
    } else if (t.isJSXFragment(child)) {
      hasElementChild = true
    } else if (t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression)) {
      textParts.push({ expr: child.expression as t.Expression })
    } else if (t.isJSXText(child)) {
      const raw = child.value
      if (textParts.length > 0 && 'raw' in textParts[textParts.length - 1]) {
        ;(textParts[textParts.length - 1] as { raw: string }).raw += raw
      } else {
        textParts.push({ raw })
      }
    }
  }

  if (!hasElementChild && textParts.length > 0) {
    const hasExpr = textParts.some((p) => 'expr' in p)
    if (hasExpr) {
      const quasis: t.TemplateElement[] = []
      const expressions: t.Expression[] = []
      let currentRaw = ''
      for (const part of textParts) {
        if ('raw' in part) {
          currentRaw += part.raw
        } else {
          quasis.push(t.templateElement({ raw: currentRaw, cooked: currentRaw }, false))
          currentRaw = ''
          expressions.push(t.cloneNode(part.expr, true) as t.Expression)
        }
      }
      quasis.push(t.templateElement({ raw: currentRaw, cooked: currentRaw }, true))
      const templateExpr =
        expressions.length > 0 ? t.templateLiteral(quasis, expressions) : t.stringLiteral(quasis[0]?.value?.raw ?? '')
      entries.push({
        childPath: [...path],
        type: 'text',
        expression: templateExpr,
      })
    }
    return
  }

  const flattened = getDirectChildElements(node.children as any)
  flattened.forEach((dc, idx) => {
    const tag = getJSXTagName(dc.node.openingElement.name)
    if (tag && isComponentTag(tag)) return
    collectClonePatchEntries(dc.node, [...path, idx], entries, false)
  })
}

function rewritePropsForClone(
  expr: t.Expression,
  propContext: import('./component-event-helpers.ts').PropContext,
): t.Expression {
  const paramName = propContext.propsParamName
  if (!paramName) return expr
  if (t.isMemberExpression(expr) && t.isIdentifier(expr.object) && expr.object.name === paramName) {
    return t.memberExpression(
      t.memberExpression(t.thisExpression(), t.identifier('props')),
      expr.property,
      expr.computed,
    )
  }
  if (t.isIdentifier(expr) && expr.name === paramName) {
    return t.memberExpression(t.thisExpression(), t.identifier('props'))
  }
  return expr
}

function collectIdentityPatchesForElement(
  node: t.JSXElement,
  elementPath: string[],
  childPath: number[],
  ctx: {
    elementPathToBindingId: Map<string, string>
    elementPathToUserIdExpr?: Map<string, t.Expression>
    elementPathPrefix?: string
    templateParams: Array<t.Identifier | t.Pattern | t.RestElement>
    sourceFile: string
    imports: Map<string, string>
    eventIdCounter: { value: number }
    isRoot: boolean
  },
  patches: CloneIdentityPatch[],
): void {
  const tagName = getJSXTagName(node.openingElement.name)
  const isComp = Boolean(tagName && isComponentTag(tagName))
  if (isComp) return

  const propContext = getPropContext(ctx.templateParams)
  const rootClassSelector = elementPath.length === 0 ? getRootClassSelector(node) : null
  const explicitIdAttr = node.openingElement.attributes.find(
    (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'id',
  )

  let hasBindingId = false
  const resolveUserIdExpr = (): t.Expression | undefined => {
    const rawPathKey = elementPath.join(' > ')
    const pathKey = ctx.elementPathPrefix ? ctx.elementPathPrefix + ' > ' + rawPathKey : rawPathKey
    return (
      ctx.elementPathToUserIdExpr?.get(pathKey) ??
      (ctx.elementPathPrefix ? undefined : ctx.elementPathToUserIdExpr?.get(rawPathKey))
    )
  }

  if (ctx.isRoot) {
    const userIdExpr = resolveUserIdExpr()
    if (userIdExpr) {
      if (!t.isStringLiteral(userIdExpr)) {
        patches.push({
          kind: 'id',
          childPath: [...childPath],
          expr: rewritePropsForClone(t.cloneNode(userIdExpr, true), propContext),
        })
      }
      patches.push({
        kind: 'attr',
        childPath: [...childPath],
        expr: t.memberExpression(t.thisExpression(), t.identifier('id')),
        attrName: 'data-gea-cid',
      })
    } else {
      patches.push({ kind: 'id', childPath: [...childPath], expr: buildEventIdExpr() })
    }
    hasBindingId = true
  } else {
    const rawPathKey = elementPath.join(' > ')
    const pathKey = ctx.elementPathPrefix ? ctx.elementPathPrefix + ' > ' + rawPathKey : rawPathKey
    const bindingId =
      ctx.elementPathToBindingId.get(pathKey) ??
      (ctx.elementPathPrefix ? undefined : ctx.elementPathToBindingId.get(rawPathKey))
    if (bindingId !== undefined && bindingId !== '') {
      const userIdExpr = resolveUserIdExpr()
      if (userIdExpr) {
        if (!t.isStringLiteral(userIdExpr)) {
          patches.push({
            kind: 'id',
            childPath: [...childPath],
            expr: rewritePropsForClone(t.cloneNode(userIdExpr, true), propContext),
          })
        }
      } else {
        patches.push({ kind: 'id', childPath: [...childPath], expr: buildEventIdExpr(bindingId) })
      }
      hasBindingId = true
    }
  }

  let generatedEventSuffix: string | undefined
  let generatedEventToken: string | undefined

  node.openingElement.attributes.forEach((attr) => {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) return
    const attrName = attr.name.name
    if (attrName === 'key') return
    if (attrName === 'id' && hasBindingId) return
    if (attrName === 'ref') return

    const attrValue = attr.value
    const eventType = toGeaEventType(attrName)

    if (t.isJSXExpressionContainer(attrValue) && !t.isJSXEmptyExpression(attrValue.expression)) {
      if (ctx.isRoot && EVENT_TYPES.has(eventType)) {
        const hoistedRootEvent = getHoistableRootEvent(
          attrName,
          attrValue.expression as t.Expression,
          elementPath,
          propContext,
          rootClassSelector,
        )
        if (hoistedRootEvent) return
      }
      if (EVENT_TYPES.has(eventType)) {
        let selectorExpression: t.Expression | undefined
        let selector: string | undefined

        if (ctx.isRoot) {
          const userIdExpr = resolveUserIdExpr()
          if (userIdExpr) {
            selectorExpression = t.isStringLiteral(userIdExpr)
              ? t.stringLiteral(`#${userIdExpr.value}`)
              : t.templateLiteral(
                  [
                    t.templateElement({ raw: '#', cooked: '#' }, false),
                    t.templateElement({ raw: '', cooked: '' }, true),
                  ],
                  [t.cloneNode(userIdExpr, true)],
                )
          } else {
            selectorExpression = t.templateLiteral(
              [t.templateElement({ raw: '#', cooked: '#' }, false), t.templateElement({ raw: '', cooked: '' }, true)],
              [t.memberExpression(t.thisExpression(), t.identifier('id'))],
            )
          }
        } else {
          const rawPathKey2 = elementPath.join(' > ')
          const pathKey2 = ctx.elementPathPrefix ? ctx.elementPathPrefix + ' > ' + rawPathKey2 : rawPathKey2
          const bindingId =
            ctx.elementPathToBindingId.get(pathKey2) ??
            (ctx.elementPathPrefix ? undefined : ctx.elementPathToBindingId.get(rawPathKey2))
          if (bindingId !== undefined && bindingId !== '') {
            const userIdExpr2 = resolveUserIdExpr()
            if (userIdExpr2) {
              selectorExpression = t.isStringLiteral(userIdExpr2)
                ? t.stringLiteral(`#${userIdExpr2.value}`)
                : t.templateLiteral(
                    [
                      t.templateElement({ raw: '#', cooked: '#' }, false),
                      t.templateElement({ raw: '', cooked: '' }, true),
                    ],
                    [t.cloneNode(userIdExpr2, true)],
                  )
            } else {
              selectorExpression = t.templateLiteral(
                [
                  t.templateElement({ raw: '#', cooked: '#' }, false),
                  t.templateElement({ raw: `-${bindingId}`, cooked: `-${bindingId}` }, true),
                ],
                [t.memberExpression(t.thisExpression(), t.identifier('id'))],
              )
            }
          } else if (!explicitIdAttr) {
            if (!generatedEventSuffix) {
              generatedEventSuffix = `ev${ctx.eventIdCounter.value ?? 0}`
              ctx.eventIdCounter.value += 1
              patches.push({
                kind: 'id',
                childPath: [...childPath],
                expr: buildEventIdExpr(generatedEventSuffix),
              })
            }
            selectorExpression = t.templateLiteral(
              [
                t.templateElement({ raw: '#', cooked: '#' }, false),
                t.templateElement({ raw: `-${generatedEventSuffix}`, cooked: `-${generatedEventSuffix}` }, true),
              ],
              [t.memberExpression(t.thisExpression(), t.identifier('id'))],
            )
          } else if (explicitIdAttr && t.isJSXAttribute(explicitIdAttr)) {
            const idVal = explicitIdAttr.value
            let userExpr: t.Expression | undefined
            if (t.isStringLiteral(idVal)) {
              userExpr = t.stringLiteral(idVal.value)
            } else if (t.isJSXExpressionContainer(idVal) && !t.isJSXEmptyExpression(idVal.expression)) {
              userExpr = idVal.expression as t.Expression
            }
            if (!userExpr) {
              const err = new Error(
                `[gea] Event delegation requires id="..." or id={expr} when an id attribute is present on this element.`,
              )
              ;(err as any).__geaCompileError = true
              throw err
            }
            if (!t.isStringLiteral(userExpr)) {
              patches.push({
                kind: 'id',
                childPath: [...childPath],
                expr: rewritePropsForClone(t.cloneNode(userExpr, true), propContext),
              })
            }
            selectorExpression = t.isStringLiteral(userExpr)
              ? t.stringLiteral(`#${userExpr.value}`)
              : t.templateLiteral(
                  [
                    t.templateElement({ raw: '#', cooked: '#' }, false),
                    t.templateElement({ raw: '', cooked: '' }, true),
                  ],
                  [
                    replacePropRefsInExpression(
                      t.cloneNode(userExpr, true),
                      propContext.destructuredPropNames,
                      propContext.propsParamName,
                    ),
                  ],
                )
          } else {
            if (!generatedEventToken) {
              generatedEventToken = `ev${ctx.eventIdCounter.value ?? 0}`
              ctx.eventIdCounter.value += 1
              patches.push({
                kind: 'dataGeaEvent',
                childPath: [...childPath],
                token: generatedEventToken,
              })
            }
            selector = `[data-gea-event="${generatedEventToken}"]`
          }
        }

        if (selectorExpression || selector) {
          return
        }
      }
    }
  })

  const flattened = getDirectChildElements(node.children as any)
  flattened.forEach((dc, idx) => {
    const nextPath = [...elementPath, dc.selectorSegment]
    const tag = getJSXTagName(dc.node.openingElement.name)
    const isCompChild = Boolean(tag && isComponentTag(tag))
    if (isCompChild) return
    collectIdentityPatchesForElement(dc.node, nextPath, [...childPath, idx], { ...ctx, isRoot: false }, patches)
  })
}

function collectComponentSlotPatches(
  node: t.JSXElement,
  path: number[],
  slots: CloneComponentSlotPatch[],
  componentInstances: Map<string, import('./ir.ts').ChildComponent[]>,
  instanceCursors: Map<string, number>,
  consumeOnly = false,
): void {
  const flattened = getDirectChildElements(node.children as any)
  flattened.forEach((dc, idx) => {
    const tag = getJSXTagName(dc.node.openingElement.name)
    if (tag && isComponentTag(tag)) {
      const instances = componentInstances.get(tag)
      const cursor = instanceCursors.get(tag) ?? 0
      const instance = instances?.[cursor]
      if (instance) {
        instanceCursors.set(tag, cursor + 1)
        if (!consumeOnly) {
          slots.push({ childPath: [...path, idx], instanceVar: instance.instanceVar })
        }
      }
      collectComponentSlotPatches(dc.node, [...path, idx], slots, componentInstances, instanceCursors, true)
    } else {
      collectComponentSlotPatches(dc.node, [...path, idx], slots, componentInstances, instanceCursors, consumeOnly)
    }
  })
}

export function generateCloneMembers(
  root: t.JSXElement,
  analysis: AnalysisResult,
  templateParams: Array<t.Identifier | t.Pattern | t.RestElement>,
  sourceFile: string,
  imports: Map<string, string>,
  cloneCtx: Ctx,
): t.ClassMember[] | null {
  const tagName = getJSXTagName(root.openingElement.name)
  if (tagName && isComponentTag(tagName)) return null

  const cloneFile = t.file(t.program([t.expressionStatement(t.cloneNode(root, true))]))
  if (templateRequiresRerender(cloneFile)) return null

  const refCounter = { value: 0 }
  const staticHtml = jsxToStaticHtml(root, refCounter)
  if (staticHtml === null) return null

  const contentPatches: CloneContentPatch[] = []
  collectClonePatchEntries(root, [], contentPatches, false)

  if (contentPatches.some((p) => p.type === 'attribute' && p.attributeName === 'style')) {
    return null
  }

  const identityPatches: CloneIdentityPatch[] = []
  const eventIdCounter = { value: 0 }
  collectIdentityPatchesForElement(
    root,
    [],
    [],
    {
      elementPathToBindingId: analysis.elementPathToBindingId,
      elementPathToUserIdExpr: analysis.elementPathToUserIdExpr,
      templateParams,
      sourceFile,
      imports,
      eventIdCounter,
      isRoot: true,
    },
    identityPatches,
  )

  const staticField = t.classProperty(
    t.identifier('__tpl'),
    t.callExpression(
      t.arrowFunctionExpression(
        [],
        t.blockStatement([
          t.ifStatement(
            t.binaryExpression(
              '===',
              t.unaryExpression('typeof', t.identifier('document')),
              t.stringLiteral('undefined'),
            ),
            t.returnStatement(t.identifier('undefined')),
          ),
          t.variableDeclaration('var', [
            t.variableDeclarator(
              t.identifier('t'),
              t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('createElement')), [
                t.stringLiteral('template'),
              ]),
            ),
          ]),
          t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(t.identifier('t'), t.identifier('innerHTML')),
              t.stringLiteral(staticHtml),
            ),
          ),
          t.returnStatement(t.identifier('t')),
        ]),
      ),
      [],
    ),
    undefined,
    undefined,
    false,
    true,
  )

  const componentSlotPatches: CloneComponentSlotPatch[] = []
  if (cloneCtx.componentInstances && cloneCtx.componentInstances.size > 0) {
    collectComponentSlotPatches(root, [], componentSlotPatches, cloneCtx.componentInstances, new Map())
  }

  const cloneMethodBody = buildCloneTemplateBody(identityPatches, contentPatches, componentSlotPatches, cloneCtx)

  const cloneMethod = t.classMethod('method', t.identifier('__cloneTemplate'), [], t.blockStatement(cloneMethodBody))

  return [staticField, cloneMethod]
}

function buildCloneTemplateBody(
  identityPatches: CloneIdentityPatch[],
  contentPatches: CloneContentPatch[],
  componentSlotPatches: CloneComponentSlotPatch[],
  cloneCtx: Ctx,
): t.Statement[] {
  const rootVar = t.identifier('__root')
  const stmts: t.Statement[] = [
    t.variableDeclaration('var', [
      t.variableDeclarator(
        t.identifier('__tpl'),
        t.memberExpression(t.memberExpression(t.thisExpression(), t.identifier('constructor')), t.identifier('__tpl')),
      ),
    ]),
    t.ifStatement(
      t.unaryExpression('!', t.identifier('__tpl')),
      t.blockStatement([
        t.throwStatement(
          t.newExpression(t.identifier('Error'), [t.stringLiteral('[gea] __tpl missing for clone template')]),
        ),
      ]),
    ),
    t.variableDeclaration('var', [
      t.variableDeclarator(
        rootVar,
        t.callExpression(
          t.memberExpression(
            t.memberExpression(
              t.memberExpression(t.identifier('__tpl'), t.identifier('content')),
              t.identifier('firstElementChild'),
            ),
            t.identifier('cloneNode'),
          ),
          [t.booleanLiteral(true)],
        ),
      ),
    ]),
  ]

  const refMap = new Map<string, t.Expression>()
  const allChildPaths = new Set<string>()
  for (const p of identityPatches) allChildPaths.add(p.childPath.join('_'))
  for (const p of contentPatches) allChildPaths.add(p.childPath.join('_'))
  for (const p of componentSlotPatches) allChildPaths.add(p.childPath.join('_'))
  for (const key of allChildPaths) {
    if (!key) continue
    const path = key.split('_').map((n) => parseInt(n, 10))
    const refName = childPathRefName(path)
    const navExpr = buildElementNavExpr(rootVar, path)
    refMap.set(key, t.memberExpression(rootVar, t.identifier(refName)))
    stmts.push(
      t.expressionStatement(t.assignmentExpression('=', t.memberExpression(rootVar, t.identifier(refName)), navExpr)),
    )
  }

  const navFor = (childPath: number[]): t.Expression =>
    childPath.length === 0 ? rootVar : refMap.get(childPath.join('_')) || buildElementNavExpr(rootVar, childPath)

  for (const patch of identityPatches) {
    const nav = navFor(patch.childPath)
    if (patch.kind === 'id') {
      stmts.push(
        t.expressionStatement(t.assignmentExpression('=', t.memberExpression(nav, t.identifier('id')), patch.expr)),
      )
    } else if (patch.kind === 'attr') {
      stmts.push(
        t.expressionStatement(
          t.callExpression(t.memberExpression(nav, t.identifier('setAttribute')), [
            t.stringLiteral(patch.attrName),
            patch.expr,
          ]),
        ),
      )
    } else {
      stmts.push(
        t.expressionStatement(
          t.callExpression(t.memberExpression(nav, t.identifier('setAttribute')), [
            t.stringLiteral('data-gea-event'),
            t.stringLiteral(patch.token),
          ]),
        ),
      )
    }
  }

  for (const entry of contentPatches) {
    const navExpr = navFor(entry.childPath)
    const expr = transformJSXExpression(t.cloneNode(entry.expression, true) as t.Expression, cloneCtx, true)
    switch (entry.type) {
      case 'className':
        stmts.push(
          t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(navExpr, t.identifier('className')),
              buildTrimmedClassValueExpression(expr),
            ),
          ),
        )
        break
      case 'text':
        stmts.push(
          t.expressionStatement(
            t.assignmentExpression('=', t.memberExpression(navExpr, t.identifier('textContent')), expr),
          ),
        )
        break
      case 'checked':
        stmts.push(
          t.expressionStatement(
            t.assignmentExpression('=', t.memberExpression(navExpr, t.identifier('checked')), expr),
          ),
        )
        break
      case 'attribute': {
        const attrVal = t.identifier('__av')
        const attrName = entry.attributeName!
        if (attrName === 'style') {
          stmts.push(
            t.variableDeclaration('var', [t.variableDeclarator(attrVal, expr)]),
            t.ifStatement(
              t.logicalExpression(
                '||',
                t.binaryExpression('==', attrVal, t.nullLiteral()),
                t.binaryExpression('===', attrVal, t.booleanLiteral(false)),
              ),
              t.expressionStatement(
                t.callExpression(t.memberExpression(navExpr, t.identifier('removeAttribute')), [
                  t.stringLiteral('style'),
                ]),
              ),
              t.expressionStatement(
                t.assignmentExpression(
                  '=',
                  t.memberExpression(t.memberExpression(navExpr, t.identifier('style')), t.identifier('cssText')),
                  t.conditionalExpression(
                    t.binaryExpression('===', t.unaryExpression('typeof', attrVal), t.stringLiteral('object')),
                    t.callExpression(
                      t.memberExpression(
                        t.callExpression(
                          t.memberExpression(
                            t.callExpression(t.memberExpression(t.identifier('Object'), t.identifier('entries')), [
                              attrVal,
                            ]),
                            t.identifier('map'),
                          ),
                          [
                            t.arrowFunctionExpression(
                              [t.arrayPattern([t.identifier('k'), t.identifier('v')])],
                              t.binaryExpression(
                                '+',
                                t.binaryExpression(
                                  '+',
                                  t.callExpression(t.memberExpression(t.identifier('k'), t.identifier('replace')), [
                                    t.regExpLiteral('[A-Z]', 'g'),
                                    t.stringLiteral('-$&'),
                                  ]),
                                  t.stringLiteral(': '),
                                ),
                                t.identifier('v'),
                              ),
                            ),
                          ],
                        ),
                        t.identifier('join'),
                      ),
                      [t.stringLiteral('; ')],
                    ),
                    t.callExpression(t.identifier('String'), [attrVal]),
                  ),
                ),
              ),
            ),
          )
        } else {
          stmts.push(
            t.variableDeclaration('var', [t.variableDeclarator(attrVal, expr)]),
            t.ifStatement(
              t.logicalExpression(
                '||',
                t.binaryExpression('==', attrVal, t.nullLiteral()),
                t.binaryExpression('===', attrVal, t.booleanLiteral(false)),
              ),
              t.expressionStatement(
                t.callExpression(t.memberExpression(navExpr, t.identifier('removeAttribute')), [
                  t.stringLiteral(attrName),
                ]),
              ),
              t.expressionStatement(
                t.callExpression(t.memberExpression(navExpr, t.identifier('setAttribute')), [
                  t.stringLiteral(attrName),
                  t.callExpression(t.identifier('String'), [attrVal]),
                ]),
              ),
            ),
          )
        }
        break
      }
    }
  }

  for (const slot of componentSlotPatches) {
    const nav = navFor(slot.childPath)
    stmts.push(
      t.expressionStatement(
        t.callExpression(
          t.memberExpression(
            t.memberExpression(nav, t.identifier('parentNode')),
            t.identifier('replaceChild'),
          ),
          [
            t.memberExpression(
              t.memberExpression(t.thisExpression(), t.identifier(slot.instanceVar)),
              t.identifier('el'),
            ),
            nav,
          ],
        ),
      ),
    )
  }

  stmts.push(t.returnStatement(rootVar))
  return stmts
}
