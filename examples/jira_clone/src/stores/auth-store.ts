import { Store } from '@geajs/core'
import api from '../utils/api'
import { storeAuthToken, getStoredAuthToken } from '../utils/authToken'

class AuthStore extends Store {
  token: string | null = getStoredAuthToken()
  currentUser: any = null
  isAuthenticating = false

  get isAuthenticated(): boolean {
    return !!this.token
  }

  async authenticate(): Promise<void> {
    this.isAuthenticating = true
    try {
      const data = await api.post('/authentication/guest')
      this.token = data.authToken
      storeAuthToken(data.authToken)
      const userData = await api.get('/currentUser')
      this.currentUser = userData.currentUser
    } catch (e) {
      console.error('Auth failed:', e)
    } finally {
      this.isAuthenticating = false
    }
  }

  async fetchCurrentUser(): Promise<void> {
    try {
      const data = await api.get('/currentUser')
      this.currentUser = data.currentUser
    } catch (e) {
      console.error('Failed to fetch user:', e)
    }
  }
}

export default new AuthStore()
