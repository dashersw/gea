import { Store } from '@geajs/core'

class AdvancedStore extends Store {
  greeting = 'Hello from SSR'
  hookLog: string[] = []
}

export default new AdvancedStore()
