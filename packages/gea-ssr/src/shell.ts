export interface ShellParts {
  before: string
  after: string
  headEnd: number
}

export function parseShell(indexHtml: string, appElementId: string): ShellParts {
  const pattern = new RegExp(
    `(<[a-zA-Z][a-zA-Z0-9]*[^>]*\\bid=["']${escapeRegex(appElementId)}["'][^>]*>)([\\s\\S]*?)(</[a-zA-Z][a-zA-Z0-9]*>)`,
  )

  const match = indexHtml.match(pattern)
  if (!match) {
    throw new Error(
      `Could not find element with id="${appElementId}" in index.html. ` +
      `Make sure your index.html contains an element with id="${appElementId}" (e.g. <div id="${appElementId}"></div>).`,
    )
  }

  if (match.index === undefined) {
    throw new Error(
      `Could not find element with id="${appElementId}" in index.html. ` +
      `Make sure your index.html contains an element with id="${appElementId}" (e.g. <div id="${appElementId}"></div>).`,
    )
  }
  const splitIndex = match.index + match[1].length
  const before = indexHtml.slice(0, splitIndex)
  const after = indexHtml.slice(splitIndex + match[2].length)

  const headEnd = before.toLowerCase().lastIndexOf('</head>')
  return { before, after, headEnd }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
