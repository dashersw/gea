import { Component } from '@geajs/core'
import { pulseCssClass } from './style-utils'

export default class InputSection extends Component {
  myTextarea: HTMLTextAreaElement | null = null

  template(): string {
    return (
      <section class="input-section">
        <textarea ref={this.myTextarea} class="textarea" />

        <div>
          <button onclick={this.trySubmit} class="send-btn">
            Send
          </button>
        </div>
      </section>
    )
  }

  trySubmit(): void {
    if (!this.myTextarea) return

    this.myTextarea.focus()

    if (!this.myTextarea.value.match(/\w/)) {
      pulseCssClass(this.myTextarea, 'error')
      return
    }

    pulseCssClass(this.myTextarea, 'success')
    this.myTextarea.value = ''
  }
}
