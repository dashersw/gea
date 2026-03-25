import { Store } from '@geajs/core'

class CounterStore extends Store {
  count = 0

  increment() {
    this.count++
  }

  decrement() {
    this.count--
  }
}

export default new CounterStore()
