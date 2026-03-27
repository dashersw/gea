import { Component } from '@geajs/core'
import authStore from '../stores/auth-store'
import { router } from '@geajs/core/router'

export default class Login extends Component {
  template() {
    return (
      <div class="login-page">
        <div class="login-card">
          <h1>Sign In</h1>
          <p class="login-hint">Enter your name to continue</p>
          <div class="form-group">
            <label>Name</label>
            <input id="login-name" type="text" placeholder="Your name" />
          </div>
          <div class="form-group">
            <label>Email</label>
            <input id="login-email" type="email" placeholder="you@example.com" />
          </div>
          <button class="btn-primary" click={() => this.handleLogin()}>
            Sign In
          </button>
        </div>
      </div>
    )
  }

  handleLogin() {
    const nameInput = this.$('#login-name') as HTMLInputElement
    const emailInput = this.$('#login-email') as HTMLInputElement
    const name = nameInput?.value?.trim() || 'User'
    const email = emailInput?.value?.trim() || 'user@example.com'
    authStore.login(name, email)
    router.push('/dashboard')
  }
}
