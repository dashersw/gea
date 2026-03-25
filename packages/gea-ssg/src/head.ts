export interface HeadConfig {
  title?: string
  description?: string
  image?: string
  url?: string
  type?: string
  lastmod?: string
  jsonld?: Record<string, any> | Record<string, any>[]
  meta?: Array<{ name?: string; property?: string; content: string }>
  link?: Array<Record<string, string>>
}

export function buildHeadTags(config: HeadConfig): string {
  const tags: string[] = []

  if (config.description) {
    tags.push(`<meta name="description" content="${escAttr(config.description)}">`)
  }

  if (config.title) tags.push(`<meta property="og:title" content="${escAttr(config.title)}">`)
  if (config.description) tags.push(`<meta property="og:description" content="${escAttr(config.description)}">`)
  if (config.image) tags.push(`<meta property="og:image" content="${escAttr(config.image)}">`)
  if (config.url) tags.push(`<meta property="og:url" content="${escAttr(config.url)}">`)
  tags.push(`<meta property="og:type" content="${escAttr(config.type || 'website')}">`)

  if (config.title) tags.push(`<meta name="twitter:title" content="${escAttr(config.title)}">`)
  if (config.description) tags.push(`<meta name="twitter:description" content="${escAttr(config.description)}">`)
  if (config.image) {
    tags.push(`<meta name="twitter:image" content="${escAttr(config.image)}">`)
    tags.push(`<meta name="twitter:card" content="summary_large_image">`)
  }

  if (config.url) tags.push(`<link rel="canonical" href="${escAttr(config.url)}">`)

  if (config.meta) {
    for (const m of config.meta) {
      const attr = m.property ? `property="${escAttr(m.property)}"` : `name="${escAttr(m.name || '')}"`
      tags.push(`<meta ${attr} content="${escAttr(m.content)}">`)
    }
  }

  if (config.link) {
    for (const l of config.link) {
      const attrs = Object.entries(l)
        .map(([k, v]) => `${k}="${escAttr(v)}"`)
        .join(' ')
      tags.push(`<link ${attrs}>`)
    }
  }

  if (config.jsonld) {
    const items = Array.isArray(config.jsonld) ? config.jsonld : [config.jsonld]
    for (const item of items) {
      const ld = { '@context': 'https://schema.org', ...item }
      const json = JSON.stringify(ld).replace(/<\//g, '<\\/')
      tags.push(`<script type="application/ld+json">${json}</script>`)
    }
  }

  return tags.length ? '\n' + tags.join('\n') : ''
}

export function replaceTitle(html: string, title: string): string {
  return html.replace(/<title>[^<]*<\/title>/i, `<title>${escHtml(title)}</title>`)
}

export function minifyHtml(html: string): string {
  const preserved: string[] = []
  let result = html.replace(/<(pre|code|script|style|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi, (match) => {
    preserved.push(match)
    return `__PRESERVE_${preserved.length - 1}__`
  })

  result = result.replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
  result = result.replace(/\s+/g, ' ')
  result = result.replace(/>\s+</g, '><')

  for (let i = 0; i < preserved.length; i++) {
    result = result.replace(`__PRESERVE_${i}__`, preserved[i])
  }

  return result.trim()
}

function escAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;')
}
