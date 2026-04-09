/**
 * Clone template optimization for the Gea compiler codegen.
 *
 * When a component's template is purely static HTML with dynamic patches
 * (text, className, attributes, checked), we can generate a static HTML
 * template that is cloned at mount time instead of parsed from innerHTML.
 * This avoids repeated HTML parsing and is significantly faster.
 */
import { t } from '../utils/babel-interop.ts'
import type { AnalysisResult } from '../analyze/analyzer.ts'
import { buildElementNavExpr, childPathRefName, templateRequiresRerender } from './array-compiler.ts'
import { transformJSXExpression, type Ctx } from './gen-template.ts'
import {
  getHoistableRootEvent,
  getPropContext,
  getRootClassSelector,
  toGeaEventType,
  EVENT_NAMES,
} from './event-helpers.ts'
import { buildTrimmedClassValueExpression, getDirectChildElements, getJSXTagName, isComponentTag } from './jsx-utils.ts'
import { replacePropRefsInExpression } from './prop-ref-utils.ts'
import { camelToKebab, escapeHtml, normalizeJSXText, toHtmlAttrName } from '../utils/html.ts'
import { EVENT_TYPES, VOID_ELEMENTS } from '../ir/constants.ts'
import { emitMount } from '../emit/registry.ts'
import { id, js, jsClassProp, jsExpr, jsMethod, tpl } from 'eszter'

/** HTML parent tags where it is safe to insert an arbitrary placeholder child element. */
const SAFE_CLONE_PARENTS = new Set([
  'div', 'span', 'section', 'article', 'header', 'footer', 'main', 'nav', 'figure',
])

// ─── Types ─────────────────────────────────────────────────────────

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

// ─── Event ID expression builder ──────────────────────────────────

function buildEventIdExpr(suffix?: string): t.Expression {
  if (!suffix) return jsExpr`this.id`
  return jsExpr`this.id + ${'-' + suffix}`
}

// ─── JSX to static HTML ───────────────────────────────────────────

/**
 * Emit static HTML skeleton (no compiler ids, no data-ge, no dynamic attrs).
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
  if (tagName && isComponentTag(tagName)) {
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
    return VOID_ELEMENTS.has(effectiveTag) ? html + ' />' : html + `></${effectiveTag}>`
  }

  html += '>'
  const childHtml = processStaticChildren(node.children, refCounter, elementPath, undefined, undefined, effectiveTag)
  if (childHtml === null) return null
  return html + childHtml + `</${effectiveTag}>`
}

// ─── Process static children ───────────────────────────────────────

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

// ─── Collect clone patch entries ───────────────────────────────────

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
    if (t.isJSXElement(child) || t.isJSXFragment(child)) {
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

// ─── Rewrite props for clone ───────────────────────────────────────

function rewritePropsForClone(expr: t.Expression, propContext: import('./event-helpers.ts').PropContext): t.Expression {
  const paramName = propContext.propsParamName
  if (!paramName) return expr
  if (t.isMemberExpression(expr) && t.isIdentifier(expr.object) && expr.object.name === paramName) {
    return t.memberExpression(jsExpr`this.props`, expr.property, expr.computed)
  }
  if (t.isIdentifier(expr) && expr.name === paramName) {
    return jsExpr`this.props`
  }
  return expr
}

// ─── Build selector expression for event delegation ───────────────

function buildSelectorExprForId(idExpr: t.Expression | undefined, fallbackSuffix?: string): t.Expression | undefined {
  if (!idExpr) {
    if (fallbackSuffix) {
      return tpl`#${jsExpr`this.id`}-${fallbackSuffix}` as unknown as t.Expression
    }
    return undefined
  }
  if (t.isStringLiteral(idExpr)) {
    return t.stringLiteral(`#${idExpr.value}`)
  }
  return tpl`#${t.cloneNode(idExpr, true)}` as unknown as t.Expression
}

// ─── Collect identity patches for element ──────────────────────────

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
  if (tagName && isComponentTag(tagName)) return

  const propContext = getPropContext(ctx.templateParams)
  const rootClassSelector = elementPath.length === 0 ? getRootClassSelector(node) : null
  const explicitIdAttr = node.openingElement.attributes.find(
    (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'id',
  )

  const _resolvePathKey = (): string => {
    const rawPathKey = elementPath.join(' > ')
    return ctx.elementPathPrefix ? ctx.elementPathPrefix + ' > ' + rawPathKey : rawPathKey
  }
  const resolveUserIdExpr = (): t.Expression | undefined => {
    const rawPathKey = elementPath.join(' > ')
    const pathKey = ctx.elementPathPrefix ? ctx.elementPathPrefix + ' > ' + rawPathKey : rawPathKey
    return (
      ctx.elementPathToUserIdExpr?.get(pathKey) ??
      (ctx.elementPathPrefix ? undefined : ctx.elementPathToUserIdExpr?.get(rawPathKey))
    )
  }
  const resolveBindingId = (): string | undefined => {
    const rawPathKey = elementPath.join(' > ')
    const pathKey = ctx.elementPathPrefix ? ctx.elementPathPrefix + ' > ' + rawPathKey : rawPathKey
    return (
      ctx.elementPathToBindingId.get(pathKey) ??
      (ctx.elementPathPrefix ? undefined : ctx.elementPathToBindingId.get(rawPathKey))
    )
  }

  let hasBindingId = false

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
      patches.push({ kind: 'attr', childPath: [...childPath], expr: jsExpr`this.id`, attrName: 'data-gcc' })
    } else {
      patches.push({ kind: 'id', childPath: [...childPath], expr: buildEventIdExpr() })
    }
    hasBindingId = true
  } else {
    const bindingId = resolveBindingId()
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

  for (const attr of node.openingElement.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue
    const attrName = attr.name.name
    if (attrName === 'key' || (attrName === 'id' && hasBindingId) || attrName === 'ref') continue

    const attrValue = attr.value
    const eventType = toGeaEventType(attrName)

    if (!t.isJSXExpressionContainer(attrValue) || t.isJSXEmptyExpression(attrValue.expression)) continue
    if (!EVENT_TYPES.has(eventType)) continue

    if (ctx.isRoot) {
      const hoistedRootEvent = getHoistableRootEvent(
        attrName,
        attrValue.expression as t.Expression,
        elementPath,
        propContext,
        rootClassSelector,
      )
      if (hoistedRootEvent) continue
    }

    let selectorExpression: t.Expression | undefined
    let selector: string | undefined

    if (ctx.isRoot) {
      const userIdExpr = resolveUserIdExpr()
      selectorExpression = userIdExpr
        ? buildSelectorExprForId(userIdExpr)
        : (tpl`#${jsExpr`this.id`}` as unknown as t.Expression)
    } else {
      const bindingId = resolveBindingId()
      if (bindingId !== undefined && bindingId !== '') {
        const userIdExpr = resolveUserIdExpr()
        selectorExpression = userIdExpr
          ? buildSelectorExprForId(userIdExpr)
          : (tpl`#${jsExpr`this.id`}${'-' + bindingId}` as unknown as t.Expression)
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
        selectorExpression = tpl`#${jsExpr`this.id`}${'-' + generatedEventSuffix}` as unknown as t.Expression
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
        if (t.isStringLiteral(userExpr)) {
          selectorExpression = t.stringLiteral(`#${userExpr.value}`)
        } else {
          selectorExpression = tpl`#${replacePropRefsInExpression(
            t.cloneNode(userExpr, true),
            propContext.destructuredPropNames,
            propContext.propsParamName,
          )}` as unknown as t.Expression
        }
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
        selector = `[data-ge="${generatedEventToken}"]`
      }
    }

    if (selectorExpression || selector) {
      continue
    }
  }

  const flattened = getDirectChildElements(node.children as any)
  flattened.forEach((dc, idx) => {
    const nextPath = [...elementPath, dc.selectorSegment]
    const tag = getJSXTagName(dc.node.openingElement.name)
    if (tag && isComponentTag(tag)) return
    collectIdentityPatchesForElement(dc.node, nextPath, [...childPath, idx], { ...ctx, isRoot: false }, patches)
  })
}

// ─── Collect component slot patches ───────────────────────────────

function collectComponentSlotPatches(
  node: t.JSXElement,
  path: number[],
  slots: CloneComponentSlotPatch[],
  componentInstances: Map<string, import('../ir/index.ts').ChildComponent[]>,
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
        if (!consumeOnly && !instance.lazy) {
          slots.push({ childPath: [...path, idx], instanceVar: instance.instanceVar })
        }
      }
      collectComponentSlotPatches(dc.node, [...path, idx], slots, componentInstances, instanceCursors, true)
    } else {
      collectComponentSlotPatches(dc.node, [...path, idx], slots, componentInstances, instanceCursors, consumeOnly)
    }
  })
}

// ─── Generate clone members ────────────────────────────────────────

export function generateCloneMembers(
  root: t.JSXElement,
  analysis: AnalysisResult,
  templateParams: Array<t.Identifier | t.Pattern | t.RestElement>,
  sourceFile: string,
  imports: Map<string, string>,
  cloneCtx: Ctx,
): t.ClassBody['body'][number][] | null {
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

  const staticField = jsClassProp`static __tpl = (() => {
    if (typeof document === 'undefined') return undefined;
    var t = document.createElement('template');
    t.innerHTML = ${staticHtml};
    return t;
  })()`

  const componentSlotPatches: CloneComponentSlotPatch[] = []
  if (cloneCtx.componentInstances && cloneCtx.componentInstances.size > 0) {
    collectComponentSlotPatches(root, [], componentSlotPatches, cloneCtx.componentInstances, new Map())
  }

  const cloneMethodBody = buildCloneTemplateBody(identityPatches, contentPatches, componentSlotPatches, cloneCtx)
  const cloneMethod = jsMethod`[${id('GEA_CLONE_TEMPLATE')}]() {}`
  cloneMethod.body.body.push(...cloneMethodBody)

  return [staticField, cloneMethod]
}

// ─── Build clone template body ─────────────────────────────────────

function buildCloneTemplateBody(
  identityPatches: CloneIdentityPatch[],
  contentPatches: CloneContentPatch[],
  componentSlotPatches: CloneComponentSlotPatch[],
  cloneCtx: Ctx,
): t.Statement[] {
  const rootVar = id('__root')
  const stmts: t.Statement[] = [
    js`var __tpl = this.constructor.__tpl;`,
    js`if (!__tpl) { throw new Error('[gea] __tpl missing for clone template'); }`,
    js`var __root = __tpl.content.firstElementChild.cloneNode(true);`,
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
    refMap.set(key, jsExpr`${rootVar}.${id(refName)}`)
    stmts.push(js`${rootVar}.${id(refName)} = ${navExpr};`)
  }

  const navFor = (childPath: number[]): t.Expression =>
    childPath.length === 0 ? rootVar : refMap.get(childPath.join('_')) || buildElementNavExpr(rootVar, childPath)

  for (const patch of identityPatches) {
    const nav = navFor(patch.childPath)
    if (patch.kind === 'id') {
      stmts.push(js`${nav}.id = ${patch.expr};`)
    } else if (patch.kind === 'attr') {
      stmts.push(js`${nav}.setAttribute(${patch.attrName}, ${patch.expr});`)
    } else {
      stmts.push(js`${nav}.setAttribute('data-ge', ${patch.token});`)
    }
  }

  for (const entry of contentPatches) {
    const navExpr = navFor(entry.childPath)
    const expr = transformJSXExpression(t.cloneNode(entry.expression, true) as t.Expression, cloneCtx, true)
    const emitType = entry.type === 'className' ? 'class' : entry.type
    const emitValue = entry.type === 'className' ? buildTrimmedClassValueExpression(expr) : expr
    const mountStmts = emitMount(emitType, navExpr, emitValue, {
      attributeName: entry.attributeName,
      canSkipClassCoercion: entry.type === 'className',
    })
    stmts.push(...mountStmts)
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

  stmts.push(js`return ${rootVar};`)
  return stmts
}
