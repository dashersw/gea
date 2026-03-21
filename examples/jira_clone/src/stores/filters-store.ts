import { Store } from '@geajs/core'

class FiltersStore extends Store {
  searchTerm = ''
  userIds: string[] = []
  myOnly = false
  recentOnly = false

  get areFiltersCleared(): boolean {
    return !this.searchTerm && this.userIds.length === 0 && !this.myOnly && !this.recentOnly
  }

  setSearchTerm(val: string): void {
    this.searchTerm = val
  }

  toggleUserId(id: string): void {
    const idx = this.userIds.indexOf(id)
    if (idx >= 0) {
      this.userIds.splice(idx, 1)
    } else {
      this.userIds.push(id)
    }
  }

  toggleMyOnly(): void {
    this.myOnly = !this.myOnly
  }

  toggleRecentOnly(): void {
    this.recentOnly = !this.recentOnly
  }

  clearAll(): void {
    this.searchTerm = ''
    this.userIds = []
    this.myOnly = false
    this.recentOnly = false
  }
}

export default new FiltersStore()
