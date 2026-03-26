export interface MismatchResult {
  server: string
  client: string
}

function normalize(html: string): string {
  return html.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim()
}

/**
 * Compare server-rendered DOM innerHTML against expected client HTML.
 * Returns null if they match (after whitespace normalization),
 * or a MismatchResult with both versions if they differ.
 */
export function detectHydrationMismatch(
  element: { innerHTML: string },
  clientHtml: string,
): MismatchResult | null {
  const serverHtml = element.innerHTML
  if (normalize(serverHtml) === normalize(clientHtml)) return null
  return { server: serverHtml, client: clientHtml }
}
