/**
 * Runtime JSX factory (`@jsx gea.h`). Used by the runtime-only-jsx example
 * which inlines Babel-compiled JSX without the gea compiler plugin.
 *
 * Returns an HTML string. Components' `template()` returning strings composes
 * with gea's Component.render (which parses the returned string into DOM). A
 * .join('') over an array of h() results works as expected (string concat),
 * enabling patterns like `items.map(it => <li>...</li>).join('')`.
 */
type Props = Record<string, any> | null

const _VOID_ELS = new Set([
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
  'source',
  'track',
  'wbr',
])

function _escapeAttr(v: string): string {
  return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}
function _escapeText(v: string): string {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function h(tag: any, props: Props, ...rest: any[]): string {
  const children = rest.flat(Infinity)
  // Component class: instantiate and stringify via toString (returns HTML).
  if (typeof tag === 'function') {
    const inst = new tag(props || {})
    return String(inst)
  }
  let html = '<' + tag
  if (props) {
    for (const k in props) {
      const v = props[k]
      if (v == null || v === false) continue
      if (k === 'children' || k === 'key' || k === 'ref') continue
      const name = k === 'className' ? 'class' : k === 'htmlFor' ? 'for' : k
      if (k === 'style' && typeof v === 'object') {
        const style = Object.keys(v)
          .map((sk) => {
            const dashed = sk.replace(/([A-Z])/g, '-$1').toLowerCase()
            return `${dashed}:${v[sk]}`
          })
          .join(';')
        html += ` style="${_escapeAttr(style)}"`
      } else if (typeof v === 'function') {
        // Event handlers have no HTML representation — skip (caller should
        // use the compiler path or wire events separately).
        continue
      } else if (v === true) {
        html += ` ${name}`
      } else {
        html += ` ${name}="${_escapeAttr(String(v))}"`
      }
    }
  }
  if (_VOID_ELS.has(tag)) return html + ' />'
  html += '>'
  for (const c of children) {
    if (c == null || c === false || c === true) continue
    if (typeof c === 'string') html += c.startsWith('<') ? c : _escapeText(c)
    else if (typeof c === 'number') html += String(c)
    else if (c && typeof (c as any).nodeType === 'number') html += (c as HTMLElement).outerHTML
    else html += String(c)
  }
  html += `</${tag}>`
  return html
}
