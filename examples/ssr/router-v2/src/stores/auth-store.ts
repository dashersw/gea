// SSR-safe version of auth-store.
// The original reads localStorage at class-field init time, which crashes on
// the server. This version guards every localStorage access.

import { Store } from '@geajs/core'

const isBrowser = typeof localStorage !== 'undefined'

function readPersistedUser(): { name: string; email: string } | null {
  if (!isBrowser) return null
  const raw = localStorage.getItem('user')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    localStorage.removeItem('user')
    return null
  }
}

class AuthStore extends Store {
  user: { name: string; email: string } | null = readPersistedUser()

  login(name: string, email: string) {
    this.user = { name, email }
    if (isBrowser) {
      localStorage.setItem('user', JSON.stringify(this.user))
    }
  }

  logout() {
    this.user = null
    if (isBrowser) {
      localStorage.removeItem('user')
    }
  }
}

const authStore = new AuthStore()
export default authStore
