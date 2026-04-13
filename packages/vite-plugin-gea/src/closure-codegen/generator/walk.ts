import type { JSXElement, JSXFragment } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

import {
  canOmitAttrQuotes,
  classifyAttrKind,
  escapeAttr,
  escapeUnquotedAttr,
  normalizeAttrName,
  normalizeEventAttrName,
  VOID_TAGS,
} from './generator-attrs.ts'
import { isJsxOrNullish, isMapWithJsxBody } from './generator-jsx-helpers.ts'
import type { Slot, TemplateSpec, WalkOptions } from './generator-types.ts'

export type { Slot, TemplateSpec, WalkOptions } from './generator-types.ts'
export { normalizeEventAttrName } from './generator-attrs.ts'
export { extractTemplateJsx, findTemplateMethod } from './generator-jsx-helpers.ts'

const OPTIONAL_TABLE_END_TAGS = new Set(['colgroup', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th'])
const TERMINAL_CLOSE_UNSAFE_TAGS = new Set([
  'script',
  'style',
  'textarea',
  'title',
  'template',
  'select',
  'option',
  'optgroup',
])

export function walkJsxToTemplate(root: JSXElement | JSXFragment, options: WalkOptions = {}): TemplateSpec {
  const slots: Slot[] = []
  let nextSlot = 0

  /**
   * Recursively emit HTML for a node. `walk` accumulates the childNodes-index
   * path from the cloned root down to this position. `walkKinds` tracks per-
   * step whether the target child is an element (`{elem: N}` = N-th element
   * among siblings — emit as firstElementChild+nextElementSibling*N) or a
   * non-element (`{child: N}` = comment/text, emit as childNodes[N]).
   */
  function emitNode(
    node: any,
    walk: number[],
    walkKinds: Array<{ elem: number } | { child: number }>,
    terminal: boolean,
    nextSiblingTag: string | null,
  ): string {
    // Strip position for stable output
    if (t.isJSXText(node)) {
      // Only strip JSXText that's pure indentation (all whitespace + newline).
      // Preserve inline whitespace like " " in `{a} {b}` so gaps between
      // reactive slots don't collapse.
      const v = node.value
      if (v.trim() === '' && /\n/.test(v)) return ''
      return normalizeMultilineJsxText(v)
    }
    if (t.isJSXExpressionContainer(node)) {
      const inner = node.expression
      // {} or {/* comment */} — empty slot, emit nothing.
      if (t.isJSXEmptyExpression(inner)) return ''
      // Conditional: cond ? <A/> : <B/>
      if (t.isConditionalExpression(inner) && (isJsxOrNullish(inner.consequent) || isJsxOrNullish(inner.alternate))) {
        const slot: Slot = {
          index: nextSlot++,
          walk: walk.slice(),
          walkKinds: walkKinds.slice(),
          kind: 'conditional',
          expr: inner.test,
          payload: {
            mkTrue: inner.consequent,
            mkFalse: inner.alternate,
          },
        }
        slots.push(slot)
        return `<!--${slot.index}-->`
      }
      // Logical AND: cond && <X/>  OR  cond && xs.map(x => <JSX/>)
      // The map form is promoted to a conditional whose truthy branch is the
      // .map() call itself. buildBranchFn at emit.ts already routes .map()
      // branches through buildMapBranchFn which emits a keyedList — gates
      // the list mount on `cond` truthiness, then reconciles by key for all
      // subsequent array mutations (no re-materialization on unrelated
      // store changes).
      if (
        t.isLogicalExpression(inner) &&
        inner.operator === '&&' &&
        (isJsxOrNullish(inner.right) || isMapWithJsxBody(inner.right))
      ) {
        const slot: Slot = {
          index: nextSlot++,
          walk: walk.slice(),
          walkKinds: walkKinds.slice(),
          kind: 'conditional',
          expr: inner.left,
          payload: {
            mkTrue: inner.right,
            mkFalse: null,
          },
        }
        slots.push(slot)
        return `<!--${slot.index}-->`
      }
      // List: items.map(item => <...>)
      if (
        t.isCallExpression(inner) &&
        t.isMemberExpression(inner.callee) &&
        t.isIdentifier(inner.callee.property, { name: 'map' })
      ) {
        const slot: Slot = {
          index: nextSlot++,
          walk: walk.slice(),
          walkKinds: walkKinds.slice(),
          kind: 'keyed-list',
          expr: inner.callee.object, // the source array expression
          payload: { mapCallback: inner.arguments[0] },
        }
        slots.push(slot)
        return `<!--${slot.index}-->`
      }
      // Default: reactive text slot
      const slot: Slot = {
        index: nextSlot++,
        walk: walk.slice(),
        walkKinds: walkKinds.slice(),
        kind: 'text',
        expr: inner,
      }
      slots.push(slot)
      return `<!--${slot.index}-->`
    }
    if (t.isJSXElement(node)) {
      return emitElement(node, walk, walkKinds, terminal, nextSiblingTag)
    }
    if (t.isJSXFragment(node)) {
      // Fragment: emit children at current walk
      const children = node.children as any[]
      const kept = children.filter((c) => !(t.isJSXText(c) && c.value.trim() === ''))
      let out = ''
      let childIdx = 0
      let elemIdx = 0
      for (let i = 0; i < kept.length; i++) {
        const c = kept[i]
        const k = computeChildKind(c, elemIdx, childIdx)
        out += emitNode(
          c,
          walk.concat(childIdx),
          walkKinds.concat(k),
          terminal && i === kept.length - 1,
          getStaticTagName(kept[i + 1]),
        )
        if ('elem' in k) elemIdx++
        childIdx++
      }
      return out
    }
    return ''
  }

  /**
   * Classify a JSX child as either an element step (lowercase JSXElement — the
   * child renders as a real HTML element in the template) or a non-element
   * step (component mount = comment marker, text, expression container, etc.).
   * Used when building walkKinds per recurse step.
   */
  function computeChildKind(c: any, elemIdx: number, childIdx: number): { elem: number } | { child: number } {
    if (t.isJSXElement(c)) {
      const n = c.openingElement?.name
      if (t.isJSXIdentifier(n)) {
        const first = n.name.charAt(0)
        if (first >= 'a' && first <= 'z') return { elem: elemIdx }
      }
    }
    return { child: childIdx }
  }

  /**
   * Indentation JSXText — pure whitespace containing a newline (JSX source
   * formatting between sibling elements). Inline whitespace like the single
   * space in `{a} {b}` is PRESERVED so `"1 item left"` renders with its gaps.
   */
  function isWhitespaceOnlyJsxText(n: any): boolean {
    return t.isJSXText(n) && n.value.trim() === '' && /\n/.test(n.value)
  }

  function emitElement(
    el: JSXElement,
    walk: number[],
    walkKinds: Array<{ elem: number } | { child: number }>,
    terminal: boolean,
    nextSiblingTag: string | null,
  ): string {
    const opening = el.openingElement
    const name = opening.name
    if (!t.isJSXIdentifier(name)) {
      throw new Error(`generator: non-identifier JSX tags not yet supported: ${JSON.stringify(name)}`)
    }
    const tagName = name.name
    // Component tag (capitalized) → mount slot, emit <!--mount N--> placeholder.
    // Within a keyed-list map callback the compiler may hoist the `key` attribute
    // out before this walker is called; here we simply preserve attributes.
    if (tagName[0] === tagName[0].toUpperCase()) {
      const slot: Slot = {
        index: nextSlot++,
        walk: walk.slice(),
        walkKinds: walkKinds.slice(),
        kind: options.directFnComponents?.has(tagName) ? 'direct-fn' : 'mount',
        payload: { tag: tagName, attrs: opening.attributes, selfClose: opening.selfClosing, children: el.children },
        expr: null,
      }
      slots.push(slot)
      return `<!--${slot.index}-->`
    }
    // Plain HTML element
    let html = '<' + tagName
    for (const attr of opening.attributes) {
      if (t.isJSXAttribute(attr)) {
        const rawAttrName = t.isJSXIdentifier(attr.name) ? attr.name.name : ''
        const attrName = normalizeAttrName(rawAttrName)
        if (!attr.value) {
          html += ' ' + attrName
        } else if (t.isStringLiteral(attr.value)) {
          // Static attribute — bake into template
          html += formatStaticAttr(attrName, attr.value.value)
        } else if (t.isJSXExpressionContainer(attr.value)) {
          // Reactive attribute — record slot, emit nothing in template
          // (helper sets after clone). For event slots in a keyed-list row
          // template, ALSO bake `data-gea-<type>="<slotIdx>"` into the HTML
          // so the list's container-scoped dispatcher can route clicks
          // without a per-row expando write. cloneNode preserves attrs,
          // costs ~10 bytes per row in the DOM but eliminates 2 walks + 2
          // expando writes per row on creation.
          const kind = classifyAttrKind(rawAttrName)
          const slotIndex = nextSlot++
          if (kind === 'event' && options.emitEventDataAttr) {
            const evType = normalizeEventAttrName(rawAttrName)
            html += ' data-gea-' + evType + '="' + slotIndex + '"'
          }
          slots.push({
            index: slotIndex,
            walk: walk.slice(),
            walkKinds: walkKinds.slice(),
            kind,
            payload: { attrName },
            expr: attr.value.expression,
          })
        }
      }
      // JSXSpreadAttribute — skip for now, add later
    }
    if (opening.selfClosing) {
      // HTML doesn't allow self-closing syntax for non-void elements — the
      // parser ignores `/>` and treats following siblings as descendants,
      // which throws off DOM walk indices. Emit `<tag>...<\/tag>` for
      // non-void tags; use `<tag/>` ONLY for the small set of void elements.
      if (VOID_TAGS.has(tagName)) {
        html += '>'
        return html
      }
      html += '>'
      if (!canOmitEndTag(tagName, terminal, nextSiblingTag)) html += '</' + tagName + '>'
      return html
    }
    html += '>'
    const children = el.children as any[]
    const kept: any[] = []
    for (const c of children) {
      if (isWhitespaceOnlyJsxText(c)) continue
      if (t.isJSXExpressionContainer(c) && t.isJSXEmptyExpression(c.expression)) continue
      kept.push(c)
    }
    // Fast path: element contains exactly one reactive-text-producing
    // JSXExpressionContainer and no sibling content. Emit the slot's
    // position as a direct text node (`0` placeholder) instead of a
    // `<!--N-->` comment — the emitter can then skip
    // `createTextNode + replaceWith`. patchRow overwrites the placeholder
    // before insertBefore, so the placeholder is never visible.
    if (kept.length === 1 && isPlainTextSlotExpression(kept[0])) {
      const inner = (kept[0] as any).expression
      const slot: Slot = {
        index: nextSlot++,
        walk: walk.concat(0),
        // For directText, the single text child is a CharacterData node
        // (non-element), so the final step is `{child: 0}` — the emitter
        // translates this to `.firstChild` on the parent element for fast
        // access. Matches v3's `f.firstChild.data = String(i)` pattern.
        walkKinds: walkKinds.concat([{ child: 0 }]),
        kind: 'text',
        expr: inner,
        directText: true,
      }
      slots.push(slot)
      html += '0' // text-node placeholder, overwritten by patchRow/reactiveText
      if (!canOmitEndTag(tagName, terminal, nextSiblingTag)) html += '</' + tagName + '>'
      return html
    }

    // A parent whose only children are direct function components does not
    // need per-child comment anchors. Emit an empty parent template and append
    // the function-produced nodes straight into that parent during setup.
    if (kept.length > 0 && kept.every(isDirectFnChild)) {
      const groupId = nextSlot
      for (let i = 0; i < kept.length; i++) {
        const child = kept[i] as JSXElement
        const childName = child.openingElement.name
        if (!t.isJSXIdentifier(childName)) continue
        const slot: Slot = {
          index: nextSlot++,
          walk: walk.slice(),
          walkKinds: walkKinds.slice(),
          kind: 'direct-fn',
          payload: {
            tag: childName.name,
            attrs: child.openingElement.attributes,
            selfClose: child.openingElement.selfClosing,
            children: child.children,
            appendOnly: {
              groupId,
              position: i,
              total: kept.length,
              parentWalk: walk.slice(),
              parentWalkKinds: walkKinds.slice(),
            },
          },
          expr: null,
        }
        slots.push(slot)
      }
      if (!canOmitEndTag(tagName, terminal, nextSiblingTag)) html += '</' + tagName + '>'
      return html
    }

    // A terminal simple member `.map()` can use the parent element as the list
    // container directly. Keep the normal comment anchor for more complex
    // sources so generic keyed-list fallbacks remain available.
    if (kept.length === 1 && isTerminalSimpleKeyedList(kept[0])) {
      const inner = (kept[0] as any).expression
      const slot: Slot = {
        index: nextSlot++,
        walk: walk.slice(),
        walkKinds: walkKinds.slice(),
        kind: 'keyed-list',
        expr: inner.callee.object,
        payload: {
          mapCallback: inner.arguments[0],
          anchorless: {
            parentWalk: walk.slice(),
            parentWalkKinds: walkKinds.slice(),
          },
        },
      }
      slots.push(slot)
      if (!canOmitEndTag(tagName, terminal, nextSiblingTag)) html += '</' + tagName + '>'
      return html
    }

    let childIdx = 0
    let elemIdx = 0
    for (let i = 0; i < kept.length; i++) {
      const c = kept[i]
      const k = computeChildKind(c, elemIdx, childIdx)
      html += emitNode(
        c,
        walk.concat(childIdx),
        walkKinds.concat(k),
        terminal && i === kept.length - 1,
        getStaticTagName(kept[i + 1]),
      )
      if ('elem' in k) elemIdx++
      childIdx++
    }
    if (!canOmitEndTag(tagName, terminal, nextSiblingTag)) html += '</' + tagName + '>'
    return html
  }

  /**
   * True when this JSXExpressionContainer is a reactive text slot — NOT a
   * conditional / logical / keyed-list map. Matches the "Default: reactive
   * text slot" path in `emitNode`.
   */
  function isPlainTextSlotExpression(node: any): boolean {
    if (!t.isJSXExpressionContainer(node)) return false
    const inner = node.expression
    if (t.isJSXEmptyExpression(inner)) return false
    if (t.isConditionalExpression(inner) && (isJsxOrNullish(inner.consequent) || isJsxOrNullish(inner.alternate)))
      return false
    if (
      t.isLogicalExpression(inner) &&
      inner.operator === '&&' &&
      (isJsxOrNullish(inner.right) || isMapWithJsxBody(inner.right))
    )
      return false
    if (
      t.isCallExpression(inner) &&
      t.isMemberExpression(inner.callee) &&
      t.isIdentifier(inner.callee.property, { name: 'map' })
    )
      return false
    return true
  }

  function isDirectFnChild(node: any): boolean {
    if (!t.isJSXElement(node)) return false
    const name = node.openingElement.name
    return t.isJSXIdentifier(name) && options.directFnComponents?.has(name.name) === true
  }

  function isTerminalSimpleKeyedList(node: any): boolean {
    if (!t.isJSXExpressionContainer(node)) return false
    const inner = node.expression
    if (
      !t.isCallExpression(inner) ||
      !t.isMemberExpression(inner.callee) ||
      !t.isIdentifier(inner.callee.property, { name: 'map' })
    ) {
      return false
    }
    return isSinglePropMember(inner.callee.object) || isBoundSinglePropMember(inner.callee.object)
  }

  function isSinglePropMember(expr: any): boolean {
    if (!t.isMemberExpression(expr) || expr.computed || !t.isIdentifier(expr.property)) return false
    if (t.isIdentifier(expr.object) || t.isThisExpression(expr.object)) return true
    return false
  }

  function isBoundSinglePropMember(expr: any): boolean {
    if (!t.isIdentifier(expr)) return false
    const bound = options.bindings?.get(expr.name)
    return isSinglePropMember(bound)
  }

  function getStaticTagName(node: any): string | null {
    if (!t.isJSXElement(node)) return null
    const name = node.openingElement.name
    if (!t.isJSXIdentifier(name)) return null
    return name.name
  }

  function canOmitEndTag(tagName: string, terminal: boolean, nextSiblingTag: string | null): boolean {
    if (OPTIONAL_TABLE_END_TAGS.has(tagName)) {
      return terminal || canImplicitlyCloseBefore(tagName, nextSiblingTag)
    }
    return terminal && !TERMINAL_CLOSE_UNSAFE_TAGS.has(tagName)
  }

  function canImplicitlyCloseBefore(tagName: string, nextSiblingTag: string | null): boolean {
    if (!nextSiblingTag) return false
    if (tagName === 'td' || tagName === 'th') return nextSiblingTag === 'td' || nextSiblingTag === 'th'
    if (tagName === 'tr') return nextSiblingTag === 'tr'
    if (tagName === 'thead') return nextSiblingTag === 'tbody' || nextSiblingTag === 'tfoot'
    if (tagName === 'tbody') return nextSiblingTag === 'tbody' || nextSiblingTag === 'tfoot'
    if (tagName === 'colgroup') {
      return (
        nextSiblingTag === 'thead' ||
        nextSiblingTag === 'tbody' ||
        nextSiblingTag === 'tfoot' ||
        nextSiblingTag === 'tr'
      )
    }
    return false
  }

  const html = emitNode(root, [], [], true, null)
  return { html, slots }
}

function normalizeMultilineJsxText(value: string): string {
  if (!/[\n\r]/.test(value)) return value

  const lines = value.replace(/\t/g, ' ').split(/\r\n|\n|\r/)
  let out = ''
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    if (i > 0) line = line.replace(/^\s+/, '')
    if (i < lines.length - 1) line = line.replace(/\s+$/, '')
    if (!line) continue
    if (out && !out.endsWith(' ')) out += ' '
    out += line
  }
  return out
}

function formatStaticAttr(name: string, rawValue: string): string {
  const unquoted = escapeUnquotedAttr(rawValue)
  if (canOmitAttrQuotes(unquoted)) return ' ' + name + '=' + unquoted
  return ' ' + name + '="' + escapeAttr(rawValue) + '"'
}
