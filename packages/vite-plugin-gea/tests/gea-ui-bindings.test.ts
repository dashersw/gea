/**
 * Regression tests for gea-ui component value binding patterns.
 *
 * These tests replicate the callback-driven value binding pattern used by
 * ZagComponent-based components (RadioGroup, Slider, NumberInput, etc.):
 *   - Parent passes `value` + `onValueChange` callback to child
 *   - Child captures the callback in `created(props)` (like Zag machines do)
 *   - Child later fires the callback (simulating Zag interaction)
 *   - Parent state and DOM must update correctly
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { installDom, flushMicrotasks } from '../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from './helpers/compile'
import { GEA_DOM_COMPONENT } from '@geajs/core'

/** Retrieve the component instance stored on a DOM node by mountComponent. */
function getInstance(node: any): any {
  return node?.[GEA_DOM_COMPONENT]
}

// ---------------------------------------------------------------------------
// RadioGroup pattern: string value + onValueChange callback
// ---------------------------------------------------------------------------

test('radio-group pattern: onValueChange callback captured in created() updates parent DOM', async () => {
  const restoreDom = installDom()
  try {
    const seed = `geaui-${Date.now()}-radio`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const RadioChild = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class RadioChild extends Component {
        created(props) {
          this._fireCallback = (val) => props.onValueChange?.({ value: val })
        }

        template(props) {
          return <div class="radio">{props.value}</div>
        }
      }
      `,
      '/virtual/RadioChild.jsx',
      'RadioChild',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import RadioChild from './RadioChild'
      export default class Parent extends Component {
        radioVal = 'pro'

        template() {
          return (
            <div class="parent">
              <RadioChild
                value={this.radioVal}
                onValueChange={(d) => { this.radioVal = d.value }}
              />
              <span class="display">{this.radioVal}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, RadioChild },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el?.querySelector('.display')?.textContent, 'pro', 'initial parent display')
    assert.equal(view.el?.querySelector('.radio')?.textContent?.trim(), 'pro', 'initial child display')

    const child = getInstance(view.el?.querySelector('.radio'))
    assert.ok(child, 'child instance exists')
    assert.ok(typeof child._fireCallback === 'function', 'callback was captured in created()')

    child._fireCallback('enterprise')
    await flushMicrotasks()

    assert.equal(
      view.el?.querySelector('.display')?.textContent,
      'enterprise',
      'parent DOM text must update after child fires onValueChange',
    )
    assert.equal((view as any).radioVal, 'enterprise', 'parent state must reflect new value')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('radio-group pattern: child display updates after parent prop refresh', async () => {
  const restoreDom = installDom()
  try {
    const seed = `geaui-${Date.now()}-radio-child-display`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const RadioChild = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class RadioChild extends Component {
        created(props) {
          this._fireCallback = (val) => props.onValueChange?.({ value: val })
        }

        template(props) {
          return <div class="radio">{props.value}</div>
        }
      }
      `,
      '/virtual/RadioChild.jsx',
      'RadioChild',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import RadioChild from './RadioChild'
      export default class Parent extends Component {
        radioVal = 'pro'

        template() {
          return (
            <div class="parent">
              <RadioChild
                value={this.radioVal}
                onValueChange={(d) => { this.radioVal = d.value }}
              />
              <span class="display">{this.radioVal}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, RadioChild },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const child = getInstance(view.el?.querySelector('.radio'))
    child._fireCallback('enterprise')
    await flushMicrotasks()

    assert.equal(
      view.el?.querySelector('.radio')?.textContent?.trim(),
      'enterprise',
      'child DOM text must update after parent refreshes props',
    )

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// Slider pattern: array value + onValueChange callback
// ---------------------------------------------------------------------------

test('slider pattern: onValueChange with array value updates parent DOM', async () => {
  const restoreDom = installDom()
  try {
    const seed = `geaui-${Date.now()}-slider`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const SliderChild = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class SliderChild extends Component {
        created(props) {
          this._fireCallback = (vals) => props.onValueChange?.({ value: vals })
        }

        template(props) {
          return <div class="slider">{props.value}</div>
        }
      }
      `,
      '/virtual/SliderChild.jsx',
      'SliderChild',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import SliderChild from './SliderChild'
      export default class Parent extends Component {
        sliderVolume = 50

        template() {
          return (
            <div class="parent">
              <SliderChild
                value={[this.sliderVolume]}
                onValueChange={(d) => { this.sliderVolume = d.value[0] }}
              />
              <span class="display">{this.sliderVolume}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, SliderChild },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el?.querySelector('.display')?.textContent, '50', 'initial display')

    const child = getInstance(view.el?.querySelector('.slider'))
    assert.ok(typeof child._fireCallback === 'function', 'callback was captured')

    child._fireCallback([30])
    await flushMicrotasks()

    assert.equal(
      view.el?.querySelector('.display')?.textContent,
      '30',
      'parent DOM must update after slider fires onValueChange',
    )
    assert.equal((view as any).sliderVolume, 30, 'parent state must be 30')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('slider range pattern: two-value array updates both parent values', async () => {
  const restoreDom = installDom()
  try {
    const seed = `geaui-${Date.now()}-slider-range`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const SliderChild = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class SliderChild extends Component {
        created(props) {
          this._fireCallback = (vals) => props.onValueChange?.({ value: vals })
        }

        template(props) {
          return <div class="slider">slider</div>
        }
      }
      `,
      '/virtual/SliderChild.jsx',
      'SliderChild',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import SliderChild from './SliderChild'
      export default class Parent extends Component {
        sliderMin = 20
        sliderMax = 80

        template() {
          return (
            <div class="parent">
              <SliderChild
                value={[this.sliderMin, this.sliderMax]}
                onValueChange={(d) => { this.sliderMin = d.value[0]; this.sliderMax = d.value[1] }}
              />
              <span class="min">{this.sliderMin}</span>
              <span class="max">{this.sliderMax}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, SliderChild },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el?.querySelector('.min')?.textContent, '20', 'initial min')
    assert.equal(view.el?.querySelector('.max')?.textContent, '80', 'initial max')

    const child = getInstance(view.el?.querySelector('.slider'))
    child._fireCallback([10, 60])
    await flushMicrotasks()

    assert.equal(view.el?.querySelector('.min')?.textContent, '10', 'min must update')
    assert.equal(view.el?.querySelector('.max')?.textContent, '60', 'max must update')
    assert.equal((view as any).sliderMin, 10)
    assert.equal((view as any).sliderMax, 60)

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// NumberInput pattern: string value + onValueChange callback
// ---------------------------------------------------------------------------

test('number-input pattern: onValueChange updates parent DOM', async () => {
  const restoreDom = installDom()
  try {
    const seed = `geaui-${Date.now()}-number`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const NumberChild = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class NumberChild extends Component {
        created(props) {
          this._fireCallback = (val) => props.onValueChange?.({ value: val, valueAsNumber: Number(val) })
        }

        template(props) {
          return <div class="number-input">{props.value}</div>
        }
      }
      `,
      '/virtual/NumberChild.jsx',
      'NumberChild',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import NumberChild from './NumberChild'
      export default class Parent extends Component {
        numberVal = '5'

        template() {
          return (
            <div class="parent">
              <NumberChild
                value={this.numberVal}
                onValueChange={(d) => { this.numberVal = d.value }}
              />
              <span class="display">{this.numberVal}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, NumberChild },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el?.querySelector('.display')?.textContent, '5', 'initial display')

    const child = getInstance(view.el?.querySelector('.number-input'))
    child._fireCallback('6')
    await flushMicrotasks()

    assert.equal(
      view.el?.querySelector('.display')?.textContent,
      '6',
      'parent DOM must update after number-input fires onValueChange',
    )
    assert.equal((view as any).numberVal, '6', 'parent state must be "6"')

    child._fireCallback('4')
    await flushMicrotasks()

    assert.equal(view.el?.querySelector('.display')?.textContent, '4', 'parent DOM must update on second callback')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// Multiple rapid callbacks (stress test)
// ---------------------------------------------------------------------------

test('multiple rapid onValueChange callbacks all update parent correctly', async () => {
  const restoreDom = installDom()
  try {
    const seed = `geaui-${Date.now()}-rapid`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        created(props) {
          this._fireCallback = (val) => props.onValueChange?.({ value: val })
        }

        template(props) {
          return <div class="child">{props.value}</div>
        }
      }
      `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import Child from './Child'
      export default class Parent extends Component {
        val = 'a'

        template() {
          return (
            <div class="parent">
              <Child
                value={this.val}
                onValueChange={(d) => { this.val = d.value }}
              />
              <span class="display">{this.val}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const child = getInstance(view.el?.querySelector('.child'))

    child._fireCallback('b')
    await flushMicrotasks()
    assert.equal(view.el?.querySelector('.display')?.textContent, 'b')

    child._fireCallback('c')
    await flushMicrotasks()
    assert.equal(view.el?.querySelector('.display')?.textContent, 'c')

    child._fireCallback('d')
    await flushMicrotasks()
    assert.equal(view.el?.querySelector('.display')?.textContent, 'd')

    child._fireCallback('e')
    await flushMicrotasks()
    assert.equal(view.el?.querySelector('.display')?.textContent, 'e')

    assert.equal((view as any).val, 'e')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// Child DOM stability: props update must not destroy child DOM
// ---------------------------------------------------------------------------

test('child DOM is not fully re-rendered when parent refreshes props', async () => {
  const restoreDom = installDom()
  try {
    const seed = `geaui-${Date.now()}-dom-stable`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        created(props) {
          this._fireCallback = (val) => props.onValueChange?.({ value: val })
        }

        template(props) {
          return <div class="child-root">{props.value}</div>
        }
      }
      `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import Child from './Child'
      export default class Parent extends Component {
        val = 'initial'

        template() {
          return (
            <div class="parent">
              <Child
                value={this.val}
                onValueChange={(d) => { this.val = d.value }}
              />
            </div>
          )
        }
      }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const childEl = view.el?.querySelector('.child-root')
    assert.ok(childEl, 'child element exists')

    // Set a marker attribute on the child DOM element
    childEl.setAttribute('data-marker', 'stable')

    const child = getInstance(childEl)
    child._fireCallback('updated')
    await flushMicrotasks()

    const childElAfter = view.el?.querySelector('.child-root')
    assert.equal(
      childElAfter?.getAttribute('data-marker'),
      'stable',
      'child DOM element must be the same node (not re-created) — Zag components rely on stable DOM',
    )

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// Callback still works after props are refreshed by parent
// ---------------------------------------------------------------------------

test('callback prop remains callable after parent refreshes child props', async () => {
  const restoreDom = installDom()
  try {
    const seed = `geaui-${Date.now()}-callback-survive`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        created(props) {
          this._fireCallback = (val) => props.onValueChange?.({ value: val })
        }

        template(props) {
          return <div class="child">{props.value}</div>
        }
      }
      `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import Child from './Child'
      export default class Parent extends Component {
        val = 'first'

        template() {
          return (
            <div class="parent">
              <Child
                value={this.val}
                onValueChange={(d) => { this.val = d.value }}
              />
              <span class="display">{this.val}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const child = getInstance(view.el?.querySelector('.child'))

    // First callback fires and triggers parent prop refresh
    child._fireCallback('second')
    await flushMicrotasks()
    assert.equal(view.el?.querySelector('.display')?.textContent, 'second')

    // The parent prop refresh replaced onValueChange with a new arrow function.
    // The child's stored callback (via JIT proxy) must still reach the parent.
    child._fireCallback('third')
    await flushMicrotasks()
    assert.equal(
      view.el?.querySelector('.display')?.textContent,
      'third',
      'callback must survive parent prop refresh — JIT proxy must read current onValueChange',
    )

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// template(props) pattern — whole-param (not destructured)
// ---------------------------------------------------------------------------

test('callback works when child uses template(props) not template({ value })', async () => {
  const restoreDom = installDom()
  try {
    const seed = `geaui-${Date.now()}-whole-param`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const ZagLike = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class ZagLike extends Component {
        created(props) {
          this._fireCallback = (val) => props.onValueChange?.({ value: val })
        }

        template(props) {
          return <div class="zag">{props.value}</div>
        }
      }
      `,
      '/virtual/ZagLike.jsx',
      'ZagLike',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import ZagLike from './ZagLike'
      export default class Parent extends Component {
        val = 'alpha'

        template() {
          return (
            <div>
              <ZagLike
                value={this.val}
                onValueChange={(d) => { this.val = d.value }}
              />
              <span class="out">{this.val}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, ZagLike },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el?.querySelector('.out')?.textContent, 'alpha')
    assert.equal(view.el?.querySelector('.zag')?.textContent?.trim(), 'alpha')

    const child = getInstance(view.el?.querySelector('.zag'))
    child._fireCallback('beta')
    await flushMicrotasks()

    assert.equal(view.el?.querySelector('.out')?.textContent, 'beta', 'parent DOM must update')
    assert.equal(view.el?.querySelector('.zag')?.textContent?.trim(), 'beta', 'child DOM must update')

    // fire again to verify stability
    child._fireCallback('gamma')
    await flushMicrotasks()

    assert.equal(view.el?.querySelector('.out')?.textContent, 'gamma')
    assert.equal(view.el?.querySelector('.zag')?.textContent?.trim(), 'gamma')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// ZagComponent-like pattern: child sets this.value AND fires callback
// This is the exact pattern used by RadioGroup, Slider, NumberInput
// ---------------------------------------------------------------------------

test('zag pattern: child sets this.value AND fires callback — parent DOM updates', async () => {
  const restoreDom = installDom()
  try {
    const seed = `geaui-${Date.now()}-zag-dual`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const ZagChild = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class ZagChild extends Component {
        created(props) {
          this._onValueChange = (newVal) => {
            this.value = newVal
            props.onValueChange?.({ value: newVal })
          }
        }

        template(props) {
          return <div class="zag-child">{props.value}</div>
        }
      }
      `,
      '/virtual/ZagChild.jsx',
      'ZagChild',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import ZagChild from './ZagChild'
      export default class Parent extends Component {
        val = 'pro'

        template() {
          return (
            <div>
              <ZagChild
                value={this.val}
                onValueChange={(d) => { this.val = d.value }}
              />
              <span class="display">{this.val}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, ZagChild },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el?.querySelector('.display')?.textContent, 'pro')

    const child = getInstance(view.el?.querySelector('.zag-child'))
    child._onValueChange('enterprise')
    await flushMicrotasks()

    assert.equal(view.el?.querySelector('.display')?.textContent, 'enterprise', 'parent DOM must update')
    assert.equal(view.el?.querySelector('.zag-child')?.textContent?.trim(), 'enterprise', 'child DOM must reflect updated prop')
    assert.equal(child.value, 'enterprise', 'child local value must be set')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('zag pattern: second callback after prop refresh still works', async () => {
  const restoreDom = installDom()
  try {
    const seed = `geaui-${Date.now()}-zag-second`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const ZagChild = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class ZagChild extends Component {
        created(props) {
          this._onValueChange = (newVal) => {
            this.value = newVal
            props.onValueChange?.({ value: newVal })
          }
        }

        template(props) {
          return <div class="zag-child">{props.value}</div>
        }
      }
      `,
      '/virtual/ZagChild.jsx',
      'ZagChild',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import ZagChild from './ZagChild'
      export default class Parent extends Component {
        val = 'free'

        template() {
          return (
            <div>
              <ZagChild
                value={this.val}
                onValueChange={(d) => { this.val = d.value }}
              />
              <span class="display">{this.val}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, ZagChild },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const child = getInstance(view.el?.querySelector('.zag-child'))

    child._onValueChange('pro')
    await flushMicrotasks()
    assert.equal(view.el?.querySelector('.display')?.textContent, 'pro')

    child._onValueChange('enterprise')
    await flushMicrotasks()
    assert.equal(view.el?.querySelector('.display')?.textContent, 'enterprise')
    assert.equal(view.el?.querySelector('.zag-child')?.textContent?.trim(), 'enterprise')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// RadioGroup-like: items.map() rendering + callback
// When parent refreshes props with a new items array reference, the map
// re-sync must NOT destroy the child's item DOM (Zag relies on stable DOM).
// ---------------------------------------------------------------------------

test('radio-group map: callback + items refresh does not destroy item DOM', async () => {
  const restoreDom = installDom()
  try {
    const seed = `geaui-${Date.now()}-radio-map`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const RadioLike = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class RadioLike extends Component {
        created(props) {
          this._onValueChange = (newVal) => {
            this.value = newVal
            props.onValueChange?.({ value: newVal })
          }
        }

        template(props) {
          const items = props.items || []
          return (
            <div class="radio-root">
              {items.map((item) => (
                <label class="radio-item" data-value={item.value} key={item.value}>
                  <span class="radio-label">{item.label}</span>
                </label>
              ))}
            </div>
          )
        }
      }
      `,
      '/virtual/RadioLike.jsx',
      'RadioLike',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import RadioLike from './RadioLike'
      export default class Parent extends Component {
        radioVal = 'pro'

        template() {
          return (
            <div>
              <RadioLike
                value={this.radioVal}
                items={[
                  { value: 'free', label: 'Free' },
                  { value: 'pro', label: 'Pro' },
                  { value: 'enterprise', label: 'Enterprise' },
                ]}
                onValueChange={(d) => { this.radioVal = d.value }}
              />
              <span class="display">{this.radioVal}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, RadioLike },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const items = view.el?.querySelectorAll('.radio-item')
    assert.equal(items?.length, 3, 'should render 3 radio items')
    assert.equal(view.el?.querySelector('.display')?.textContent, 'pro')

    // Mark a DOM element to check stability
    items![1].setAttribute('data-marker', 'stable')

    const child = getInstance(view.el?.querySelector('.radio-root'))
    child._onValueChange('enterprise')
    await flushMicrotasks()

    assert.equal(view.el?.querySelector('.display')?.textContent, 'enterprise', 'parent DOM text must update')

    // After callback, parent refreshes props (including a new items array).
    // The map re-sync must not destroy existing item elements.
    const itemsAfter = view.el?.querySelectorAll('.radio-item')
    assert.equal(itemsAfter?.length, 3, 'still 3 items after callback')

    assert.equal(
      itemsAfter![1].getAttribute('data-marker'),
      'stable',
      'item DOM elements must be stable (not re-created) — Zag spreads depend on DOM stability',
    )

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// Child DOM stability with props.class binding
// Ensures __onPropChange for class doesn't cause full re-render
// ---------------------------------------------------------------------------

test('child with props.class: prop refresh patches class without full re-render', async () => {
  const restoreDom = installDom()
  try {
    const seed = `geaui-${Date.now()}-class-stable`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const StyledChild = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class StyledChild extends Component {
        created(props) {
          this._onValueChange = (newVal) => {
            this.value = newVal
            props.onValueChange?.({ value: newVal })
          }
        }

        template(props) {
          return <div class={'child-root ' + (props.class || '')}>{props.value}</div>
        }
      }
      `,
      '/virtual/StyledChild.jsx',
      'StyledChild',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import StyledChild from './StyledChild'
      export default class Parent extends Component {
        val = 'initial'

        template() {
          return (
            <div>
              <StyledChild
                value={this.val}
                class="my-class"
                onValueChange={(d) => { this.val = d.value }}
              />
              <span class="display">{this.val}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, StyledChild },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const childEl = view.el?.querySelector('.child-root')
    assert.ok(childEl)
    childEl.setAttribute('data-zag', 'bound')

    const child = getInstance(childEl)
    child._onValueChange('updated')
    await flushMicrotasks()

    assert.equal(view.el?.querySelector('.display')?.textContent, 'updated')

    const childElAfter = view.el?.querySelector('.child-root')
    assert.equal(childElAfter?.getAttribute('data-zag'), 'bound', 'child root DOM must be stable — no full re-render')

    view.dispose()
  } finally {
    restoreDom()
  }
})
