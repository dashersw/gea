/** Convert PascalCase component names to safe custom element tags. */
export function pascalToKebabCase(tagName: string): string {
  const normalized = tagName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
  return normalized.includes('-') ? normalized : `gea-${normalized}`
}

export function isComponentTag(tagName: string): boolean {
  return tagName.length > 0 && tagName[0] >= 'A' && tagName[0] <= 'Z'
}
