export function moveItemWithinArray<T>(arr: T[], item: T, newIndex: number): T[] {
  const clone = [...arr]
  const oldIndex = clone.indexOf(item)
  clone.splice(newIndex, 0, clone.splice(oldIndex, 1)[0])
  return clone
}

export function insertItemIntoArray<T>(arr: T[], item: T, index: number): T[] {
  const clone = [...arr]
  clone.splice(index, 0, item)
  return clone
}

/** Mutates the matching element in place (keeps array + item identity). */
export function updateArrayItemById<T extends { id: any }>(arr: T[], itemId: any, fields: Partial<T>): boolean {
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i]
    if (item.id === itemId) {
      Object.assign(item, fields)
      return true
    }
  }
  return false
}

export function sortByNewest<T>(items: T[], sortField: string): T[] {
  return [...items].sort((a: any, b: any) => -a[sortField].localeCompare(b[sortField]))
}
