import { Store } from '@geajs/core'

export class AuthStore extends Store {
  user: { name: string; email: string } | null = typeof localStorage !== 'undefined' && localStorage.getItem('user')
    ? JSON.parse(localStorage.getItem('user')!)
    : null

  login(name: string, email: string) {
    this.user = { name, email }
    if (typeof localStorage !== 'undefined') localStorage.setItem('user', JSON.stringify(this.user))
  }

  logout() {
    this.user = null
    if (typeof localStorage !== 'undefined') localStorage.removeItem('user')
  }
}

const authStore = new AuthStore()
export default authStore
