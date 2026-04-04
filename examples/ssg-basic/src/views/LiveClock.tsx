import { Component } from '@geajs/core'

export default class LiveClock extends Component {
  time = new Date().toLocaleTimeString()

  created() {
    setInterval(() => {
      this.time = new Date().toLocaleTimeString()
    }, 1000)
  }

  template() {
    return (
      <div class="live-clock">
        <span class="clock-dot"></span>
        <span>Live — {this.time}</span>
      </div>
    )
  }
}
