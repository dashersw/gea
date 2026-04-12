import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '../utils/babel-interop.ts'

/**
 * Walks the AST and converts any remaining JSX elements/fragments that are
 * outside `template()` class methods into template literal strings.
 *
 * This handles JSX that appears in event handlers, computed properties,
 * helper functions, etc. — places where the main codegen template transform
 * does not reach.
 *
 * Mutates the AST in place.
 */
export function transformRemainingJSX(ast: t.File): void {
  traverse(ast, {
    noScope: true,

    JSXElement(path: NodePath<t.JSXElement>) {
      if (isInsideTemplateMethod(path)) return
      try {
        path.replaceWith(jsxElementToTemplateLiteral(path.node))
      } catch (err) {
        console.warn('[gea] Failed to transform remaining JSX element:', err instanceof Error ? err.message : err)
      }
    },

    JSXFragment(path: NodePath<t.JSXFragment>) {
      if (isInsideTemplateMethod(path)) return
      try {
        path.replaceWith(jsxChildrenToTemplateLiteral(path.node.children))
      } catch (err) {
        console.warn('[gea] Failed to transform remaining JSX fragment:', err instanceof Error ? err.message : err)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isInsideTemplateMethod(path: NodePath): boolean {
  const classMethod = path.findParent((p) => t.isClassMethod(p.node))
  return !!(
    classMethod &&
    t.isClassMethod(classMethod.node) &&
    t.isIdentifier(classMethod.node.key) &&
    classMethod.node.key.name === 'template'
  )
}

/**
 * Convert a JSX element to a template literal.
 * `<div className={cls}>hello {name}</div>`
 * becomes: `\`<div class="${cls}">hello ${name}</div>\``
 */
function jsxElementToTemplateLiteral(node: t.JSXElement): t.TemplateLiteral {
  const quasis: t.TemplateElement[] = []
  const expressions: t.Expression[] = []
  let raw = ''

  // Opening tag
  const opening = node.openingElement
  const tagName = jsxTagName(opening.name)
  raw += `<${tagName}`

  for (const attr of opening.attributes) {
    if (t.isJSXSpreadAttribute(attr)) {
      // Spread attributes cannot be statically serialised — emit as expression
      raw += ' '
      quasis.push(templateElement(raw))
      raw = ''
      expressions.push(spreadToString(attr.argument as t.Expression))
    } else if (t.isJSXAttribute(attr)) {
      const name = jsxAttrName(attr.name)
      if (!attr.value) {
        // Boolean attribute
        raw += ` ${name}`
      } else if (t.isStringLiteral(attr.value)) {
        raw += ` ${name}="${attr.value.value}"`
      } else if (t.isJSXExpressionContainer(attr.value) && !t.isJSXEmptyExpression(attr.value.expression)) {
        raw += ` ${name}="`
        quasis.push(templateElement(raw))
        raw = ''
        expressions.push(attr.value.expression)
        raw += '"'
      }
    }
  }

  // Self-closing
  if (node.openingElement.selfClosing || !node.closingElement) {
    raw += ' />'
    quasis.push(templateElement(raw))
    return t.templateLiteral(quasis, expressions)
  }

  raw += '>'

  // Children
  appendChildren(node.children, quasis, expressions, raw)
  // After appendChildren the last piece of raw text is carried in the final quasi
  // We need to close the tag
  if (quasis.length > expressions.length) {
    // appendChildren left trailing raw text in the last quasi
    const last = quasis[quasis.length - 1]
    last.value.raw += `</${tagName}>`
    last.value.cooked = last.value.raw
  } else {
    quasis.push(templateElement(`</${tagName}>`))
  }

  return t.templateLiteral(quasis, expressions)
}

function jsxChildrenToTemplateLiteral(
  children: (t.JSXElement | t.JSXText | t.JSXExpressionContainer | t.JSXSpreadChild | t.JSXFragment)[],
): t.TemplateLiteral {
  const quasis: t.TemplateElement[] = []
  const expressions: t.Expression[] = []
  appendChildren(children, quasis, expressions, '')

  // Ensure we have at least one quasi
  if (quasis.length === 0) {
    quasis.push(templateElement(''))
  }
  // Ensure quasis.length === expressions.length + 1
  while (quasis.length <= expressions.length) {
    quasis.push(templateElement(''))
  }

  return t.templateLiteral(quasis, expressions)
}

function appendChildren(
  children: (t.JSXElement | t.JSXText | t.JSXExpressionContainer | t.JSXSpreadChild | t.JSXFragment)[],
  quasis: t.TemplateElement[],
  expressions: t.Expression[],
  raw: string,
): void {
  for (const child of children) {
    if (t.isJSXText(child)) {
      raw += child.value
    } else if (t.isJSXExpressionContainer(child)) {
      if (!t.isJSXEmptyExpression(child.expression)) {
        quasis.push(templateElement(raw))
        raw = ''
        expressions.push(child.expression)
      }
    } else if (t.isJSXElement(child)) {
      // Recurse — flatten into the same template literal
      const nested = jsxElementToTemplateLiteral(child)
      // Merge: prepend our current raw to the first quasi of the nested literal
      const firstNestedRaw = nested.quasis[0].value.raw
      quasis.push(templateElement(raw + firstNestedRaw))
      raw = ''

      for (let i = 0; i < nested.expressions.length; i++) {
        expressions.push(nested.expressions[i] as t.Expression)
        quasis.push(nested.quasis[i + 1])
      }
      // Carry the last quasi's raw text forward
      if (nested.quasis.length > nested.expressions.length) {
        const last = quasis[quasis.length - 1]
        raw = last.value.raw
        quasis.pop()
      }
    } else if (t.isJSXFragment(child)) {
      // Flatten fragment children
      appendChildren(child.children, quasis, expressions, raw)
      // After recursive call, raw is consumed — reset
      raw = ''
      if (quasis.length > expressions.length) {
        const last = quasis[quasis.length - 1]
        raw = last.value.raw
        quasis.pop()
      }
    } else if (t.isJSXSpreadChild(child)) {
      quasis.push(templateElement(raw))
      raw = ''
      expressions.push(child.expression as t.Expression)
    }
  }

  // Push final raw text
  quasis.push(templateElement(raw))
}

function templateElement(raw: string): t.TemplateElement {
  return t.templateElement({ raw, cooked: raw }, false)
}

function jsxTagName(name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName): string {
  if (t.isJSXIdentifier(name)) return name.name
  if (t.isJSXMemberExpression(name)) {
    return `${jsxTagName(name.object)}.${name.property.name}`
  }
  if (t.isJSXNamespacedName(name)) return `${name.namespace.name}:${name.name.name}`
  return 'unknown'
}

function jsxAttrName(name: t.JSXIdentifier | t.JSXNamespacedName): string {
  if (t.isJSXIdentifier(name)) {
    // className → class
    if (name.name === 'className') return 'class'
    if (name.name === 'htmlFor') return 'for'
    return name.name
  }
  if (t.isJSXNamespacedName(name)) return `${name.namespace.name}:${name.name.name}`
  return 'unknown'
}

function spreadToString(expr: t.Expression): t.Expression {
  // Produce an expression that serialises spread attributes at runtime:
  // Object.entries(expr).map(([k,v]) => `${k}="${v}"`).join(' ')
  return t.callExpression(
    t.memberExpression(
      t.callExpression(
        t.memberExpression(
          t.callExpression(t.memberExpression(t.identifier('Object'), t.identifier('entries')), [expr]),
          t.identifier('map'),
        ),
        [
          t.arrowFunctionExpression(
            [t.arrayPattern([t.identifier('__k'), t.identifier('__v')])],
            t.templateLiteral(
              [templateElement(''), templateElement('="'), templateElement('"')],
              [t.identifier('__k'), t.identifier('__v')],
            ),
          ),
        ],
      ),
      t.identifier('join'),
    ),
    [t.stringLiteral(' ')],
  )
}
