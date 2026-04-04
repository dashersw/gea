import { Component } from '@geajs/core'

export default class Counter extends Component {
  count = 0

  increment() {
    this.count++
  }

  decrement() {
    this.count--
  }

  template() {
    return (
      <div class="counter">
        <button onclick={this.decrement}>−</button>
        <span class="counter-value">{this.count}</span>
        <button onclick={this.increment}>+</button>
      </div>
    )
  }
}
