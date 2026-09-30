/** CSS property name for a style object key: camelCase is hyphenated, but a
 * custom property (`--*`) is case-sensitive and keeps its exact spelling. */
export function styleProp(key: string): string {
  return key.startsWith('--') ? key : key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
}
