import { Component } from '@geajs/core'

export default class AnimationEventsTest extends Component {
  animStartFired = false
  animEndFired = false
  animIterFired = false
  transStartFired = false
  transEndFired = false
  transRunFired = false
  transCancelFired = false

  template() {
    return (
      <div class="anim-test">
        <div
          class="anim-box"
          animationstart={() => (this.animStartFired = true)}
          animationend={() => (this.animEndFired = true)}
          animationiteration={() => (this.animIterFired = true)}
        >
          animation box
        </div>

        <div
          class="trans-box"
          transitionstart={() => (this.transStartFired = true)}
          transitionend={() => (this.transEndFired = true)}
          transitionrun={() => (this.transRunFired = true)}
          transitioncancel={() => (this.transCancelFired = true)}
        >
          transition box
        </div>

        <button class="trigger-transition" click={() => this.triggerTransition()}>
          Trigger Transition
        </button>

        <div class="results">
          <span class="r-anim-start">{String(this.animStartFired)}</span>
          <span class="r-anim-end">{String(this.animEndFired)}</span>
          <span class="r-anim-iter">{String(this.animIterFired)}</span>
          <span class="r-trans-start">{String(this.transStartFired)}</span>
          <span class="r-trans-end">{String(this.transEndFired)}</span>
          <span class="r-trans-run">{String(this.transRunFired)}</span>
          <span class="r-trans-cancel">{String(this.transCancelFired)}</span>
        </div>
      </div>
    )
  }

  triggerTransition() {
    const el = this.el.querySelector('.trans-box') as HTMLElement
    el.classList.add('moved')
  }
}
