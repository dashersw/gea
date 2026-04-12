import assert from 'node:assert/strict'
import test from 'node:test'
import { toGeaEventType, EVENT_NAMES } from '../../src-v1/codegen/event-helpers'
import { transformWithPlugin } from '../helpers/compile'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'
import { resetDelegation } from '../../../gea/src/dom/events'

// ---------------------------------------------------------------------------
// toGeaEventType unit tests
// ---------------------------------------------------------------------------

test('toGeaEventType: bare lowercase event names pass through unchanged', () => {
  assert.equal(toGeaEventType('click'), 'click')
  assert.equal(toGeaEventType('mouseover'), 'mouseover')
  assert.equal(toGeaEventType('contextmenu'), 'contextmenu')
  assert.equal(toGeaEventType('mouseenter'), 'mouseenter')
  assert.equal(toGeaEventType('mouseleave'), 'mouseleave')
  assert.equal(toGeaEventType('pointerdown'), 'pointerdown')
  assert.equal(toGeaEventType('scroll'), 'scroll')
})

test('toGeaEventType: on-prefix single-word events lowercase correctly', () => {
  assert.equal(toGeaEventType('onClick'), 'click')
  assert.equal(toGeaEventType('onInput'), 'input')
  assert.equal(toGeaEventType('onSubmit'), 'submit')
  assert.equal(toGeaEventType('onScroll'), 'scroll')
  assert.equal(toGeaEventType('onBlur'), 'blur')
  assert.equal(toGeaEventType('onFocus'), 'focus')
})

test('toGeaEventType: on-prefix multi-word events fully lowercase', () => {
  assert.equal(toGeaEventType('onMouseOver'), 'mouseover')
  assert.equal(toGeaEventType('onMouseOut'), 'mouseout')
  assert.equal(toGeaEventType('onMouseEnter'), 'mouseenter')
  assert.equal(toGeaEventType('onMouseLeave'), 'mouseleave')
  assert.equal(toGeaEventType('onMouseDown'), 'mousedown')
  assert.equal(toGeaEventType('onMouseUp'), 'mouseup')
  assert.equal(toGeaEventType('onMouseMove'), 'mousemove')
  assert.equal(toGeaEventType('onContextMenu'), 'contextmenu')
  assert.equal(toGeaEventType('onKeyDown'), 'keydown')
  assert.equal(toGeaEventType('onKeyUp'), 'keyup')
  assert.equal(toGeaEventType('onKeyPress'), 'keypress')
  assert.equal(toGeaEventType('onTouchStart'), 'touchstart')
  assert.equal(toGeaEventType('onTouchEnd'), 'touchend')
  assert.equal(toGeaEventType('onTouchMove'), 'touchmove')
  assert.equal(toGeaEventType('onPointerDown'), 'pointerdown')
  assert.equal(toGeaEventType('onPointerUp'), 'pointerup')
  assert.equal(toGeaEventType('onPointerMove'), 'pointermove')
  assert.equal(toGeaEventType('onDragStart'), 'dragstart')
  assert.equal(toGeaEventType('onDragEnd'), 'dragend')
  assert.equal(toGeaEventType('onDragOver'), 'dragover')
  assert.equal(toGeaEventType('onDragLeave'), 'dragleave')
  assert.equal(toGeaEventType('onDrop'), 'drop')
})

test('toGeaEventType: on-prefix animation/transition events fully lowercase', () => {
  assert.equal(toGeaEventType('onAnimationStart'), 'animationstart')
  assert.equal(toGeaEventType('onAnimationEnd'), 'animationend')
  assert.equal(toGeaEventType('onAnimationIteration'), 'animationiteration')
  assert.equal(toGeaEventType('onTransitionStart'), 'transitionstart')
  assert.equal(toGeaEventType('onTransitionEnd'), 'transitionend')
  assert.equal(toGeaEventType('onTransitionRun'), 'transitionrun')
  assert.equal(toGeaEventType('onTransitionCancel'), 'transitioncancel')
})

test('toGeaEventType: bare animation/transition event names pass through unchanged', () => {
  assert.equal(toGeaEventType('animationstart'), 'animationstart')
  assert.equal(toGeaEventType('animationend'), 'animationend')
  assert.equal(toGeaEventType('animationiteration'), 'animationiteration')
  assert.equal(toGeaEventType('transitionstart'), 'transitionstart')
  assert.equal(toGeaEventType('transitionend'), 'transitionend')
  assert.equal(toGeaEventType('transitionrun'), 'transitionrun')
  assert.equal(toGeaEventType('transitioncancel'), 'transitioncancel')
})

test('toGeaEventType: camelCase custom events pass through unchanged', () => {
  assert.equal(toGeaEventType('longTap'), 'longTap')
  assert.equal(toGeaEventType('swipeRight'), 'swipeRight')
  assert.equal(toGeaEventType('tap'), 'tap')
})

// ---------------------------------------------------------------------------
// EVENT_NAMES completeness
// ---------------------------------------------------------------------------

test('EVENT_NAMES includes all standard DOM events declared in jsx-runtime', () => {
  const jsxRuntimeEvents = [
    'click',
    'dblclick',
    'change',
    'input',
    'submit',
    'reset',
    'focus',
    'blur',
    'keydown',
    'keyup',
    'keypress',
    'mousedown',
    'mouseup',
    'mouseover',
    'mouseout',
    'mouseenter',
    'mouseleave',
    'touchstart',
    'touchend',
    'touchmove',
    'pointerdown',
    'pointerup',
    'pointermove',
    'scroll',
    'resize',
    'drag',
    'dragstart',
    'dragend',
    'dragover',
    'dragleave',
    'drop',
    'contextmenu',
    'mousemove',
    'animationstart',
    'animationend',
    'animationiteration',
    'transitionstart',
    'transitionend',
    'transitionrun',
    'transitioncancel',
  ]
  for (const ev of jsxRuntimeEvents) {
    assert.ok(EVENT_NAMES.has(ev), `EVENT_NAMES is missing "${ev}"`)
  }
})

// ---------------------------------------------------------------------------
// Compiler codegen: delegateEvent emitted for event types (v3 compiler)
// ---------------------------------------------------------------------------

test('compiler emits delegateEvent for mouseover handler', async () => {
  const output = await transformWithPlugin(`
    import { Component } from '@geajs/core'

    export default class HoverBox extends Component {
      template() {
        return <div class="box" mouseover={() => console.log('over')}>hover me</div>
      }
    }
  `, '/virtual/HoverBox.tsx')

  assert.ok(output)
  assert.match(output!, /delegateEvent\(/, 'delegateEvent call must be emitted')
  assert.match(output!, /"mouseover"/, 'mouseover event type must appear in delegateEvent')
})

test('compiler emits delegateEvent for contextmenu handler', async () => {
  const output = await transformWithPlugin(`
    import { Component } from '@geajs/core'

    export default class ContextBox extends Component {
      template() {
        return <div class="box" contextmenu={(e) => e.preventDefault()}>right click</div>
      }
    }
  `, '/virtual/ContextBox.tsx')

  assert.ok(output)
  assert.match(output!, /delegateEvent\(/)
  assert.match(output!, /"contextmenu"/)
})

test('compiler emits delegateEvent for mouseenter and mouseleave', async () => {
  const output = await transformWithPlugin(`
    import { Component } from '@geajs/core'

    export default class HoverCard extends Component {
      template() {
        return (
          <div class="card"
            mouseenter={() => console.log('enter')}
            mouseleave={() => console.log('leave')}
          >
            card
          </div>
        )
      }
    }
  `, '/virtual/HoverCard.tsx')

  assert.ok(output)
  assert.match(output!, /"mouseenter"/)
  assert.match(output!, /"mouseleave"/)
})

test('compiler emits delegateEvent for onMouseOver (React-style on-prefix)', async () => {
  const output = await transformWithPlugin(`
    import { Component } from '@geajs/core'

    export default class HoverBox extends Component {
      handleOver() { console.log('over') }
      template() {
        return <div class="box" onMouseOver={this.handleOver}>hover</div>
      }
    }
  `, '/virtual/HoverBoxOnPrefix.tsx')

  assert.ok(output)
  assert.match(output!, /delegateEvent\(/, 'delegateEvent call must be emitted for onMouseOver')
  assert.match(output!, /"mouseover"/, 'onMouseOver must compile to mouseover event type')
})

test('compiler emits delegateEvent for onContextMenu (React-style on-prefix)', async () => {
  const output = await transformWithPlugin(`
    import { Component } from '@geajs/core'

    export default class ContextBox extends Component {
      template() {
        return <div class="box" onContextMenu={(e) => e.preventDefault()}>right click</div>
      }
    }
  `, '/virtual/ContextBoxOnPrefix.tsx')

  assert.ok(output)
  assert.match(output!, /"contextmenu"/, 'onContextMenu must compile to contextmenu')
})

test('compiler emits delegateEvent for pointer events', async () => {
  const output = await transformWithPlugin(`
    import { Component } from '@geajs/core'

    export default class DrawCanvas extends Component {
      template() {
        return (
          <div class="canvas"
            pointerdown={() => console.log('down')}
            pointermove={() => console.log('move')}
            pointerup={() => console.log('up')}
          >
            draw
          </div>
        )
      }
    }
  `, '/virtual/DrawCanvas.tsx')

  assert.ok(output)
  assert.match(output!, /"pointerdown"/)
  assert.match(output!, /"pointermove"/)
  assert.match(output!, /"pointerup"/)
})

test('compiler emits delegateEvent for touch events', async () => {
  const output = await transformWithPlugin(`
    import { Component } from '@geajs/core'

    export default class SwipeArea extends Component {
      template() {
        return (
          <div class="area"
            touchstart={() => console.log('start')}
            touchmove={() => console.log('move')}
            touchend={() => console.log('end')}
          >
            swipe
          </div>
        )
      }
    }
  `, '/virtual/SwipeArea.tsx')

  assert.ok(output)
  assert.match(output!, /"touchstart"/)
  assert.match(output!, /"touchmove"/)
  assert.match(output!, /"touchend"/)
})

test('compiler emits delegateEvent for scroll event', async () => {
  const output = await transformWithPlugin(`
    import { Component } from '@geajs/core'

    export default class ScrollBox extends Component {
      template() {
        return (
          <div class="scrollable"
            scroll={() => console.log('scroll')}
          >
            content
          </div>
        )
      }
    }
  `, '/virtual/ScrollBox.tsx')

  assert.ok(output)
  assert.match(output!, /"scroll"/)
})

// ---------------------------------------------------------------------------
// JSDOM runtime: dispatched events fire through Gea's event delegation
// ---------------------------------------------------------------------------

test('click={this.handleClick} direct method reference fires through delegation', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-click-method-ref`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const ClickBox = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class ClickBox extends Component {
          clicked = false

          handleClick() {
            this.clicked = true
          }

          template() {
            return (
              <div class="wrapper">
                <button class="btn" click={this.handleClick}>click me</button>
              </div>
            )
          }
        }
      `,
      '/virtual/ClickBox.jsx',
      'ClickBox',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new ClickBox()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.clicked, false)

    const btn = view.el.querySelector('.btn') as HTMLElement
    assert.ok(btn, '.btn element must exist')
    btn.dispatchEvent(new window.Event('click', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(view.clicked, true, 'click handler via this.handleClick must fire and set this.clicked')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('document event listener added in created() is removed in dispose()', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-doc-listener`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Listener = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Listener extends Component {
          _handler = null
          clickCount = 0

          created() {
            this._handler = (ev) => { this.clickCount++ }
            document.addEventListener('click', this._handler)
          }

          dispose() {
            document.removeEventListener('click', this._handler)
            super.dispose()
          }

          template() {
            return <div>listener</div>
          }
        }
      `,
      '/virtual/Listener.jsx',
      'Listener',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Listener()
    view.render(root)
    await flushMicrotasks()

    assert.ok(view._handler, '_handler must not be overwritten by field initializer')
    assert.equal(view.clickCount, 0)

    document.dispatchEvent(new window.Event('click'))
    assert.equal(view.clickCount, 1, 'document click listener should fire')

    document.dispatchEvent(new window.Event('click'))
    assert.equal(view.clickCount, 2, 'document click listener should fire again')

    view.dispose()
    await flushMicrotasks()

    document.dispatchEvent(new window.Event('click'))
    assert.equal(view.clickCount, 2, 'listener must be removed after dispose — count should not increase')
  } finally {
    restoreDom()
  }
})

test('mouseover event fires through event delegation', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-mouseover`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const HoverBox = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class HoverBox extends Component {
          hovered = false

          template() {
            return (
              <div class="wrapper">
                <div class="box" mouseover={() => (this.hovered = true)}>hover</div>
              </div>
            )
          }
        }
      `,
      '/virtual/HoverBox.jsx',
      'HoverBox',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new HoverBox()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.hovered, false)

    const box = view.el.querySelector('.box') as HTMLElement
    assert.ok(box, '.box element must exist')
    box.dispatchEvent(new window.Event('mouseover', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(view.hovered, true, 'mouseover handler must fire')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('mouseenter event fires through event delegation', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-mouseenter`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const HoverCard = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class HoverCard extends Component {
          entered = false

          template() {
            return (
              <div class="wrapper">
                <div class="card" mouseenter={() => (this.entered = true)}>card</div>
              </div>
            )
          }
        }
      `,
      '/virtual/HoverCardEnter.jsx',
      'HoverCard',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new HoverCard()
    view.render(root)
    await flushMicrotasks()

    const card = view.el.querySelector('.card') as HTMLElement
    assert.ok(card, '.card element must exist')

    card.dispatchEvent(new window.Event('mouseenter', { bubbles: false }))
    await flushMicrotasks()
    assert.equal(view.entered, true, 'mouseenter handler must fire')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('mouseleave event fires through event delegation', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-mouseleave`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const HoverCard = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class HoverCard extends Component {
          left = false

          template() {
            return (
              <div class="wrapper">
                <div class="card" mouseleave={() => (this.left = true)}>card</div>
              </div>
            )
          }
        }
      `,
      '/virtual/HoverCardLeave.jsx',
      'HoverCard',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new HoverCard()
    view.render(root)
    await flushMicrotasks()

    const card = view.el.querySelector('.card') as HTMLElement
    assert.ok(card, '.card element must exist')

    card.dispatchEvent(new window.Event('mouseleave', { bubbles: false }))
    await flushMicrotasks()
    assert.equal(view.left, true, 'mouseleave handler must fire')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('contextmenu event fires through event delegation', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-contextmenu`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const ContextBox = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class ContextBox extends Component {
          menuOpened = false

          template() {
            return (
              <div class="wrapper">
                <div class="box" contextmenu={() => (this.menuOpened = true)}>right click</div>
              </div>
            )
          }
        }
      `,
      '/virtual/ContextBox.jsx',
      'ContextBox',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new ContextBox()
    view.render(root)
    await flushMicrotasks()

    const box = view.el.querySelector('.box') as HTMLElement
    assert.ok(box, '.box element must exist')
    box.dispatchEvent(new window.Event('contextmenu', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(view.menuOpened, true, 'contextmenu handler must fire')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('onMouseOver React-style fires through event delegation at runtime', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-onMouseOver`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const HoverBox = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class HoverBox extends Component {
          hovered = false

          handleMouseOver() {
            this.hovered = true
          }

          template() {
            return (
              <div class="wrapper">
                <div class="box" onMouseOver={this.handleMouseOver}>hover</div>
              </div>
            )
          }
        }
      `,
      '/virtual/HoverBoxOnPrefix.jsx',
      'HoverBox',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new HoverBox()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.hovered, false)

    const box = view.el.querySelector('.box') as HTMLElement
    assert.ok(box, '.box element must exist')
    box.dispatchEvent(new window.Event('mouseover', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(view.hovered, true, 'onMouseOver handler must fire via mouseover event')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('pointerdown event fires through event delegation', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-pointerdown`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const DrawArea = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class DrawArea extends Component {
          pressed = false

          template() {
            return (
              <div class="wrapper">
                <div class="draw" pointerdown={() => (this.pressed = true)}>draw</div>
              </div>
            )
          }
        }
      `,
      '/virtual/DrawAreaDown.jsx',
      'DrawArea',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new DrawArea()
    view.render(root)
    await flushMicrotasks()

    const area = view.el.querySelector('.draw') as HTMLElement
    assert.ok(area, '.draw element must exist')

    area.dispatchEvent(new window.Event('pointerdown', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(view.pressed, true, 'pointerdown handler must fire')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('pointermove event fires through event delegation', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-pointermove`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const DrawArea = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class DrawArea extends Component {
          moved = false

          template() {
            return (
              <div class="wrapper">
                <div class="draw" pointermove={() => (this.moved = true)}>draw</div>
              </div>
            )
          }
        }
      `,
      '/virtual/DrawAreaMove.jsx',
      'DrawArea',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new DrawArea()
    view.render(root)
    await flushMicrotasks()

    const area = view.el.querySelector('.draw') as HTMLElement
    assert.ok(area, '.draw element must exist')

    area.dispatchEvent(new window.Event('pointermove', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(view.moved, true, 'pointermove handler must fire')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('scroll event fires through event delegation', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-scroll`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const ScrollBox = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class ScrollBox extends Component {
          scrolled = false

          template() {
            return (
              <div class="wrapper">
                <div class="scrollable" scroll={() => (this.scrolled = true)}>content</div>
              </div>
            )
          }
        }
      `,
      '/virtual/ScrollBox.jsx',
      'ScrollBox',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new ScrollBox()
    view.render(root)
    await flushMicrotasks()

    const box = view.el.querySelector('.scrollable') as HTMLElement
    assert.ok(box, '.scrollable element must exist')
    box.dispatchEvent(new window.Event('scroll', { bubbles: false }))
    await flushMicrotasks()

    assert.equal(view.scrolled, true, 'scroll handler must fire')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// Compiler codegen: animation and transition events (v3 compiler)
// ---------------------------------------------------------------------------

test('compiler emits delegateEvent for animationend handler', async () => {
  const output = await transformWithPlugin(`
    import { Component } from '@geajs/core'

    export default class AnimBox extends Component {
      template() {
        return <div class="box" animationend={() => console.log('ended')}>animate</div>
      }
    }
  `, '/virtual/AnimBox.tsx')

  assert.ok(output)
  assert.match(output!, /delegateEvent\(/, 'delegateEvent call must be emitted')
  assert.match(output!, /"animationend"/, 'animationend event type must appear in delegateEvent')
})

test('compiler emits delegateEvent for onAnimationEnd (React-style)', async () => {
  const output = await transformWithPlugin(`
    import { Component } from '@geajs/core'

    export default class AnimBox extends Component {
      template() {
        return <div class="box" onAnimationEnd={() => console.log('ended')}>animate</div>
      }
    }
  `, '/virtual/AnimBoxReact.tsx')

  assert.ok(output)
  assert.match(output!, /"animationend"/, 'onAnimationEnd must compile to animationend')
})

test('compiler emits delegateEvent for all animation events', async () => {
  const output = await transformWithPlugin(`
    import { Component } from '@geajs/core'

    export default class AnimBox extends Component {
      template() {
        return (
          <div class="box"
            animationstart={() => console.log('start')}
            animationend={() => console.log('end')}
            animationiteration={() => console.log('iter')}
          >
            animate
          </div>
        )
      }
    }
  `, '/virtual/AnimBoxAll.tsx')

  assert.ok(output)
  assert.match(output!, /"animationstart"/)
  assert.match(output!, /"animationend"/)
  assert.match(output!, /"animationiteration"/)
})

test('compiler emits delegateEvent for all transition events', async () => {
  const output = await transformWithPlugin(`
    import { Component } from '@geajs/core'

    export default class TransBox extends Component {
      template() {
        return (
          <div class="box"
            transitionstart={() => console.log('start')}
            transitionend={() => console.log('end')}
            transitionrun={() => console.log('run')}
            transitioncancel={() => console.log('cancel')}
          >
            transition
          </div>
        )
      }
    }
  `, '/virtual/TransBox.tsx')

  assert.ok(output)
  assert.match(output!, /"transitionstart"/)
  assert.match(output!, /"transitionend"/)
  assert.match(output!, /"transitionrun"/)
  assert.match(output!, /"transitioncancel"/)
})

// ---------------------------------------------------------------------------
// JSDOM runtime: animation and transition events fire through delegation
// ---------------------------------------------------------------------------

test('animationend event fires through event delegation', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-animationend`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const AnimBox = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class AnimBox extends Component {
          ended = false

          template() {
            return (
              <div class="wrapper">
                <div class="box" animationend={() => (this.ended = true)}>animate</div>
              </div>
            )
          }
        }
      `,
      '/virtual/AnimBoxEnd.jsx',
      'AnimBox',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new AnimBox()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.ended, false)

    const box = view.el.querySelector('.box') as HTMLElement
    assert.ok(box, '.box element must exist')
    box.dispatchEvent(new window.Event('animationend', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(view.ended, true, 'animationend handler must fire')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('animationstart event fires through event delegation', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-animationstart`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const AnimBox = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class AnimBox extends Component {
          started = false

          template() {
            return (
              <div class="wrapper">
                <div class="box" animationstart={() => (this.started = true)}>animate</div>
              </div>
            )
          }
        }
      `,
      '/virtual/AnimBoxStart.jsx',
      'AnimBox',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new AnimBox()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.started, false)

    const box = view.el.querySelector('.box') as HTMLElement
    assert.ok(box, '.box element must exist')
    box.dispatchEvent(new window.Event('animationstart', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(view.started, true, 'animationstart handler must fire')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('animationiteration event fires through event delegation', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-animationiteration`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const AnimBox = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class AnimBox extends Component {
          iterated = false

          template() {
            return (
              <div class="wrapper">
                <div class="box" animationiteration={() => (this.iterated = true)}>animate</div>
              </div>
            )
          }
        }
      `,
      '/virtual/AnimBoxIter.jsx',
      'AnimBox',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new AnimBox()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.iterated, false)

    const box = view.el.querySelector('.box') as HTMLElement
    assert.ok(box, '.box element must exist')
    box.dispatchEvent(new window.Event('animationiteration', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(view.iterated, true, 'animationiteration handler must fire')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('transitionend event fires through event delegation', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-transitionend`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const TransBox = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class TransBox extends Component {
          ended = false

          template() {
            return (
              <div class="wrapper">
                <div class="box" transitionend={() => (this.ended = true)}>transition</div>
              </div>
            )
          }
        }
      `,
      '/virtual/TransBoxEnd.jsx',
      'TransBox',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new TransBox()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.ended, false)

    const box = view.el.querySelector('.box') as HTMLElement
    assert.ok(box, '.box element must exist')
    box.dispatchEvent(new window.Event('transitionend', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(view.ended, true, 'transitionend handler must fire')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('transitionstart event fires through event delegation', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-transitionstart`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const TransBox = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class TransBox extends Component {
          started = false

          template() {
            return (
              <div class="wrapper">
                <div class="box" transitionstart={() => (this.started = true)}>transition</div>
              </div>
            )
          }
        }
      `,
      '/virtual/TransBoxStart.jsx',
      'TransBox',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new TransBox()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.started, false)

    const box = view.el.querySelector('.box') as HTMLElement
    assert.ok(box, '.box element must exist')
    box.dispatchEvent(new window.Event('transitionstart', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(view.started, true, 'transitionstart handler must fire')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('transitionrun event fires through event delegation', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-transitionrun`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const TransBox = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class TransBox extends Component {
          ran = false

          template() {
            return (
              <div class="wrapper">
                <div class="box" transitionrun={() => (this.ran = true)}>transition</div>
              </div>
            )
          }
        }
      `,
      '/virtual/TransBoxRun.jsx',
      'TransBox',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new TransBox()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.ran, false)

    const box = view.el.querySelector('.box') as HTMLElement
    assert.ok(box, '.box element must exist')
    box.dispatchEvent(new window.Event('transitionrun', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(view.ran, true, 'transitionrun handler must fire')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('transitioncancel event fires through event delegation', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-transitioncancel`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const TransBox = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class TransBox extends Component {
          cancelled = false

          template() {
            return (
              <div class="wrapper">
                <div class="box" transitioncancel={() => (this.cancelled = true)}>transition</div>
              </div>
            )
          }
        }
      `,
      '/virtual/TransBoxCancel.jsx',
      'TransBox',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new TransBox()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.cancelled, false)

    const box = view.el.querySelector('.box') as HTMLElement
    assert.ok(box, '.box element must exist')
    box.dispatchEvent(new window.Event('transitioncancel', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(view.cancelled, true, 'transitioncancel handler must fire')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('onAnimationEnd (React-style) fires through event delegation at runtime', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-onAnimationEnd`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const AnimBox = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class AnimBox extends Component {
          ended = false

          handleEnd() {
            this.ended = true
          }

          template() {
            return (
              <div class="wrapper">
                <div class="box" onAnimationEnd={this.handleEnd}>animate</div>
              </div>
            )
          }
        }
      `,
      '/virtual/AnimBoxOnPrefix.jsx',
      'AnimBox',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new AnimBox()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.ended, false)

    const box = view.el.querySelector('.box') as HTMLElement
    assert.ok(box, '.box element must exist')
    box.dispatchEvent(new window.Event('animationend', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(view.ended, true, 'onAnimationEnd handler must fire via animationend event')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('onTransitionEnd (React-style) fires through event delegation at runtime', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-onTransitionEnd`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const TransBox = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class TransBox extends Component {
          ended = false

          handleEnd() {
            this.ended = true
          }

          template() {
            return (
              <div class="wrapper">
                <div class="box" onTransitionEnd={this.handleEnd}>transition</div>
              </div>
            )
          }
        }
      `,
      '/virtual/TransBoxOnPrefix.jsx',
      'TransBox',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new TransBox()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.ended, false)

    const box = view.el.querySelector('.box') as HTMLElement
    assert.ok(box, '.box element must exist')
    box.dispatchEvent(new window.Event('transitionend', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(view.ended, true, 'onTransitionEnd handler must fire via transitionend event')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
