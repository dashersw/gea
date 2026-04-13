let counter: number | null = null

export function getComponentId(): string {
  counter ??= Math.floor(Math.random() * 2147483648)
  return (counter++).toString(36)
}
