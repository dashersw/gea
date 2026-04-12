export function h(tag: string, props: Record<string, any> | null, ...children: any[]): string {
  const flat = children.flat(Infinity).filter((c) => c != null && c !== false && c !== true)
  let attrs = ''
  for (const [k, v] of Object.entries(props || {})) {
    if (v === true) attrs += ` ${k}`
    else if (v !== false && v != null) attrs += ` ${k}="${v}"`
  }
  return `<${tag}${attrs}>${flat.join('')}</${tag}>`
}
