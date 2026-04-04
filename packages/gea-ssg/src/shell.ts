export interface ShellParts {
  before: string
  after: string
}

/**
 * Split an HTML shell at the app mount point (`<div id="app">`).
 *
 * Uses depth tracking so nested `<div>` elements inside the mount
 * point are handled correctly — the matching `</div>` is always found,
 * not just the first one.
 */
export function parseShell(html: string, appElementId: string = 'app'): ShellParts {
  // Escape regex metacharacters in the ID so values like "app.main" work correctly.
  const safeId = appElementId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const openTagRegex = new RegExp(`(<\\s*div[^>]*\\bid\\s*=\\s*["']${safeId}["'][^>]*>)`, 'i')
  const match = html.match(openTagRegex)

  if (!match || match.index === undefined) {
    throw new Error(`[gea-ssg] <div id="${appElementId}"> not found in shell HTML.`)
  }

  const openTagEnd = match.index + match[0].length

  // Depth-tracking: walk forward counting nested <div> / </div> pairs
  // until we find the matching close tag at depth 0.
  let depth = 0
  let pos = openTagEnd
  let closeIndex = -1

  while (pos < html.length) {
    const nextOpen = html.indexOf('<div', pos)
    const nextClose = html.indexOf('</div>', pos)

    if (nextClose === -1) break

    // A nested <div opens before the next </div>
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      // Move past the opening tag
      const tagEnd = html.indexOf('>', nextOpen)
      pos = tagEnd === -1 ? nextOpen + 4 : tagEnd + 1
    } else {
      if (depth === 0) {
        closeIndex = nextClose
        break
      }
      depth--
      pos = nextClose + 6 // skip past </div>
    }
  }

  if (closeIndex === -1) {
    throw new Error(`[gea-ssg] Closing </div> not found for <div id="${appElementId}">.`)
  }

  const before = html.slice(0, openTagEnd)
  const after = html.slice(closeIndex)

  return { before, after }
}

/** Inject rendered HTML into the shell, optionally adding head tags. */
export function injectIntoShell(shell: ShellParts, renderedHtml: string, headTags?: string): string {
  let result = shell.before + renderedHtml + shell.after

  if (headTags) {
    const headInsertPos = result.toLowerCase().indexOf('</head>')
    if (headInsertPos !== -1) {
      result = result.slice(0, headInsertPos) + headTags + result.slice(headInsertPos)
    }
  }

  return result
}
