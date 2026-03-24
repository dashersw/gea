import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { GEA_DOM_COMPONENT, GEA_ON_PROP_CHANGE } from '@geajs/core'
import { normalizeProps, spreadProps, VanillaMachine } from '@zag-js/vanilla'
import { transformSync } from 'esbuild'
import { JSDOM } from 'jsdom'

import {
  compileJsxComponent,
  loadComponentUnseeded,
  readGeaUiSource,
} from '../../vite-plugin-gea/tests/helpers/compile'

const requireModule = createRequire(import.meta.url)

function installDom() {
  const dom = new JSDOMWithVisuals('<!doctype html><html><body></body></html>')

  const previous = new Map<string, PropertyDescriptor | undefined>()
  const raf = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number
  const caf = (id: number) => clearTimeout(id)

  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  class IntersectionObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  const globals: Record<string, any> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Element: dom.window.Element,
    Document: dom.window.Document,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    MutationObserver: dom.window.MutationObserver,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    MouseEvent: dom.window.MouseEvent,
    PointerEvent: dom.window.PointerEvent ?? dom.window.MouseEvent,
    KeyboardEvent: dom.window.KeyboardEvent,
    FocusEvent: dom.window.FocusEvent,
    getComputedStyle: dom.window.getComputedStyle,
    requestAnimationFrame: raf,
    cancelAnimationFrame: caf,
    ResizeObserver: ResizeObserverStub,
    IntersectionObserver: IntersectionObserverStub,
    CSS: { escape: (s: string) => s.replace(/([!"#$%&'()*+,./:;<=>?@[\]^`{|}~])/g, '\\$1') },
  }

  for (const key in globals) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: globals[key],
    })
  }
  dom.window.requestAnimationFrame = raf
  dom.window.cancelAnimationFrame = caf
  dom.window.HTMLElement.prototype.scrollIntoView = function () {}
  dom.window.HTMLElement.prototype.hasPointerCapture = function () {
    return false
  }
  dom.window.HTMLElement.prototype.setPointerCapture = function () {}
  dom.window.HTMLElement.prototype.releasePointerCapture = function () {}

  return () => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete (globalThis as any)[key]
    }
    dom.window.close()
  }
}

async function flushMicrotasks(rounds = 10) {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

async function loadZagComponent(Component: any) {
  const js = transformSync(readGeaUiSource('primitives', 'zag-component.ts'), {
    loader: 'ts',
    format: 'esm',
    target: 'esnext',
  })
    .code.replace(/^import\b.*$/gm, '')
    .replace(/export\s+default\s+class\s+/, 'class ')
    .replace(/^export\s*\{[\s\S]*?\};?\s*$/gm, '')

  return new Function(
    'Component',
    'VanillaMachine',
    'normalizeProps',
    'spreadProps',
    'GEA_ON_PROP_CHANGE',
    `${js}\nreturn ZagComponent;`,
  )(Component, VanillaMachine, normalizeProps, spreadProps, GEA_ON_PROP_CHANGE)
}

async function loadRealComponent(
  fileName: string,
  className: string,
  ZagComponent: any,
  zagBinding: Record<string, any>,
) {
  return compileJsxComponent(readGeaUiSource('components', fileName), `/virtual/${fileName}`, className, {
    ZagComponent,
    normalizeProps,
    ...zagBinding,
  })
}

async function loadHarness() {
  const Component = await loadComponentUnseeded()
  const ZagComponent = await loadZagComponent(Component)
  return { Component, ZagComponent }
}

function componentFromRoot<T = any>(root: Element | null): T {
  assert.ok(root, 'component root found')
  const owner = (root as any)[GEA_DOM_COMPONENT]
  assert.ok(owner, 'component owner is stamped on root')
  return owner as T
}

class JSDOMWithVisuals extends JSDOM {
  constructor(html: string) {
    super(html, { pretendToBeVisual: true })
  }
}

const GEA_SET_PROPS = Symbol.for('gea.component.setProps')

test('Dialog: opening never applies aria-hidden to the focused trigger', async () => {
  const restoreDom = installDom()
  try {
    const { Component, ZagComponent } = await loadHarness()
    const dialog = await import('@zag-js/dialog')
    const Dialog = await loadRealComponent('dialog.tsx', 'Dialog', ZagComponent, { dialog })

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import Dialog from './Dialog'
      export default class Parent extends Component {
        isOpen = false
        template() {
          return (
            <div>
              <Dialog
                title="Test Dialog"
                description="A test dialog"
                triggerLabel="Open Dialog"
                onOpenChange={(details) => { this.isOpen = details.open }}
              >
                <p>Dialog content</p>
              </Dialog>
              <span class="status">{this.isOpen ? 'open' : 'closed'}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/DialogParent.jsx',
      'Parent',
      { Component, Dialog },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const trigger = view.el!.querySelector('[data-part="trigger"]') as HTMLButtonElement
    const dialogRoot = trigger.parentElement!
    const child = componentFromRoot<any>(dialogRoot)
    assert.equal(child._api.open, false, 'dialog initially closed')

    trigger.focus()
    assert.equal(document.activeElement, trigger, 'trigger starts focused')

    const originalSetAttribute = trigger.setAttribute.bind(trigger)
    let ariaHiddenSetWhileFocused = false
    trigger.setAttribute = function (name: string, value: string) {
      originalSetAttribute(name, value)
      if (name === 'aria-hidden' && value === 'true' && document.activeElement === trigger) {
        ariaHiddenSetWhileFocused = true
      }
    }

    trigger.click()
    await flushMicrotasks()

    assert.equal(child._api.open, true, 'dialog opens after trigger click')
    assert.equal(view.el!.querySelector('.status')?.textContent, 'open', 'parent callback updates state')
    assert.ok(!ariaHiddenSetWhileFocused, 'focused trigger was blurred before aria-hidden could be applied')
    assert.ok(!view.el!.querySelector('[data-part="positioner"]')!.hasAttribute('hidden'), 'positioner is visible')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('RadioGroup: value changes sync to parent and controlled prop refresh does not rerender child', async () => {
  const restoreDom = installDom()
  try {
    const { Component, ZagComponent } = await loadHarness()
    const radioGroup = await import('@zag-js/radio-group')
    const RadioGroup = await loadRealComponent('radio-group.tsx', 'RadioGroup', ZagComponent, { radioGroup })

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import RadioGroup from './RadioGroup'
      export default class Parent extends Component {
        radioVal = 'pro'
        template() {
          return (
            <div>
              <RadioGroup
                value={this.radioVal}
                items={[
                  { value: 'free', label: 'Free' },
                  { value: 'pro', label: 'Pro' },
                  { value: 'enterprise', label: 'Enterprise' },
                ]}
                onValueChange={(details) => { this.radioVal = details.value }}
              />
              <span class="display">{this.radioVal}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/RadioParent.jsx',
      'Parent',
      { Component, RadioGroup },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const child = componentFromRoot<any>(view.el!.querySelector('[data-part="root"]'))
    const childRoot = child.el
    const machine = child._machine

    assert.equal(child._api.value, 'pro', 'initial value reaches Zag')
    assert.equal(view.el!.querySelector('.display')?.textContent, 'pro', 'initial value reaches DOM')

    child._api.setValue('enterprise')
    await flushMicrotasks()

    assert.equal((view as any).radioVal, 'enterprise', 'parent callback receives new value')
    assert.equal(view.el!.querySelector('.display')?.textContent, 'enterprise', 'parent DOM updates')
    ;(view as any).radioVal = 'free'
    child[GEA_SET_PROPS]({
      value: () => (view as any).radioVal,
      items: () => [
        { value: 'free', label: 'Free' },
        { value: 'pro', label: 'Pro' },
        { value: 'enterprise', label: 'Enterprise' },
      ],
      onValueChange: () => (details: any) => {
        ;(view as any).radioVal = details.value
      },
    })
    await flushMicrotasks()

    assert.equal(child.el, childRoot, 'child root is preserved across controlled prop refresh')
    assert.equal(child._machine, machine, 'child machine is preserved across controlled prop refresh')
    assert.equal(child._api.value, 'free', 'controlled parent prop refresh reaches Zag API')
    assert.equal(view.el!.querySelector('.display')?.textContent, 'free', 'parent DOM reflects controlled refresh')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('Slider and Checkbox: form values stay synchronized with parent callbacks', async () => {
  const restoreDom = installDom()
  try {
    const { Component, ZagComponent } = await loadHarness()
    const slider = await import('@zag-js/slider')
    const checkbox = await import('@zag-js/checkbox')
    const Slider = await loadRealComponent('slider.tsx', 'Slider', ZagComponent, { slider })
    const Checkbox = await loadRealComponent('checkbox.tsx', 'Checkbox', ZagComponent, { checkbox })

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import Slider from './Slider'
      import Checkbox from './Checkbox'
      export default class Parent extends Component {
        rangeMin = 20
        rangeMax = 80
        accepted = false
        template() {
          return (
            <div>
              <Slider
                value={[this.rangeMin, this.rangeMax]}
                min={0}
                max={100}
                onValueChange={(details) => {
                  this.rangeMin = details.value[0]
                  this.rangeMax = details.value[1]
                }}
              />
              <Checkbox
                defaultChecked={false}
                label="Accept"
                onCheckedChange={(details) => { this.accepted = details.checked }}
              />
              <span class="range">{this.rangeMin}:{this.rangeMax}</span>
              <span class="accepted">{this.accepted ? 'yes' : 'no'}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/FormParent.jsx',
      'Parent',
      { Component, Slider, Checkbox },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const sliderChild = componentFromRoot<any>(view.el!.querySelector('.slider-control')!.closest('[data-part="root"]'))
    const checkboxChild = componentFromRoot<any>(
      view.el!.querySelector('.checkbox-control')!.closest('[data-part="root"]'),
    )

    assert.equal(sliderChild._api.value[0], 20, 'slider lower bound starts in sync')
    assert.equal(sliderChild._api.value[1], 80, 'slider upper bound starts in sync')
    assert.equal(sliderChild.el.querySelectorAll('[data-part="thumb"]').length, 2, 'range slider creates both thumbs')
    assert.equal(checkboxChild.checked, false, 'checkbox starts in sync')

    sliderChild._api.setValue([10, 60])
    await flushMicrotasks()

    assert.equal((view as any).rangeMin, 10, 'slider callback syncs lower bound')
    assert.equal((view as any).rangeMax, 60, 'slider callback syncs upper bound')
    assert.equal(view.el!.querySelector('.range')?.textContent, '10:60', 'range display updates')

    checkboxChild._api.setChecked(true)
    await flushMicrotasks()

    assert.equal(checkboxChild.checked, true, 'checkbox component state updates')
    assert.equal((view as any).accepted, true, 'checkbox callback syncs parent')
    assert.equal(view.el!.querySelector('.accepted')?.textContent, 'yes', 'checkbox display updates')
    assert.equal(
      (checkboxChild.el.querySelector('[data-part="hidden-input"]') as HTMLInputElement).checked,
      true,
      'input checked value updates',
    )

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('Combobox and RadioGroup: clearing/rapid callback sequences are not dropped', async () => {
  const restoreDom = installDom()
  try {
    const { Component, ZagComponent } = await loadHarness()
    const combobox = await import('@zag-js/combobox')
    const radioGroup = await import('@zag-js/radio-group')
    const Combobox = await loadRealComponent('combobox.tsx', 'Combobox', ZagComponent, { combobox })
    const RadioGroup = await loadRealComponent('radio-group.tsx', 'RadioGroup', ZagComponent, { radioGroup })

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import Combobox from './Combobox'
      import RadioGroup from './RadioGroup'
      export default class Parent extends Component {
        comboVal = 'uk'
        radioVal = 'a'
        radioEvents = []
        template() {
          return (
            <div>
              <Combobox
                value={this.comboVal ? [this.comboVal] : []}
                items={[
                  { value: 'us', label: 'United States' },
                  { value: 'uk', label: 'United Kingdom' },
                  { value: 'de', label: 'Germany' },
                ]}
                onValueChange={(details) => { this.comboVal = details.value[0] || '' }}
              />
              <RadioGroup
                value={this.radioVal}
                items={[
                  { value: 'a', label: 'A' },
                  { value: 'b', label: 'B' },
                  { value: 'c', label: 'C' },
                ]}
                onValueChange={(details) => {
                  this.radioEvents = [...this.radioEvents, details.value]
                  this.radioVal = details.value
                }}
              />
              <span class="combo">{this.comboVal || '(none)'}</span>
              <span class="radio">{this.radioVal}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/RapidParent.jsx',
      'Parent',
      { Component, Combobox, RadioGroup },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const roots = view.el!.querySelectorAll('[data-part="root"]')
    const comboChild = componentFromRoot<any>(roots[0])
    const radioChild = componentFromRoot<any>(roots[1])

    comboChild._api.setValue([])
    await flushMicrotasks()
    assert.equal((view as any).comboVal, '', 'combobox clear syncs parent')
    assert.equal(view.el!.querySelector('.combo')?.textContent, '(none)', 'combobox clear syncs DOM')

    radioChild._api.setValue('b')
    radioChild._api.setValue('c')
    radioChild._api.setValue('b')
    await flushMicrotasks()

    assert.deepEqual(
      Array.from((view as any).radioEvents),
      ['b', 'c', 'b'],
      'rapid radio callbacks are delivered in order',
    )
    assert.equal((view as any).radioVal, 'b', 'rapid radio sequence leaves final parent value')
    assert.equal(view.el!.querySelector('.radio')?.textContent, 'b', 'rapid radio sequence leaves final DOM value')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('Dialog: spread queries preserve nested child Zag subtrees with overlapping data-part names', async () => {
  const restoreDom = installDom()
  try {
    const { Component, ZagComponent } = await loadHarness()
    const dialog = await import('@zag-js/dialog')
    const combobox = await import('@zag-js/combobox')
    const Dialog = await loadRealComponent('dialog.tsx', 'Dialog', ZagComponent, { dialog })
    const Combobox = await loadRealComponent('combobox.tsx', 'Combobox', ZagComponent, { combobox })

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import Dialog from './Dialog'
      import Combobox from './Combobox'
      export default class Parent extends Component {
        country = ''
        template() {
          return (
            <div>
              <Dialog triggerLabel="Open">
                <Combobox
                  value={this.country ? [this.country] : []}
                  items={[
                    { value: 'de', label: 'Germany' },
                    { value: 'fr', label: 'France' },
                  ]}
                  onValueChange={(details) => { this.country = details.value[0] || '' }}
                />
              </Dialog>
            </div>
          )
        }
      }
      `,
      '/virtual/NestedParent.jsx',
      'Parent',
      { Component, Dialog, Combobox },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const dialogTrigger = view.el!.querySelector(':scope > div > [data-part="trigger"]') as HTMLButtonElement
    const dialogChild = componentFromRoot<any>(dialogTrigger.parentElement)
    const comboRoot = view.el!.querySelector('.combobox-control')!.closest('[data-part="root"]')!
    const comboChild = componentFromRoot<any>(comboRoot)
    const comboTrigger = comboRoot.querySelector('[data-part="trigger"]') as HTMLButtonElement

    assert.notEqual(dialogChild, comboChild, 'nested combobox remains a separate component')
    assert.equal(
      dialogChild._elementCache.get('[data-part="trigger"]')?.length,
      1,
      'dialog spread cache excludes child trigger',
    )
    assert.equal(dialogTrigger.getAttribute('aria-haspopup'), 'dialog', 'dialog trigger keeps dialog props')
    assert.equal(comboTrigger.getAttribute('aria-haspopup'), 'listbox', 'child trigger keeps combobox props')

    dialogTrigger.click()
    await flushMicrotasks()

    assert.ok(comboRoot.isConnected, 'child subtree remains connected after dialog spread updates')
    assert.equal(comboTrigger.getAttribute('aria-haspopup'), 'listbox', 'dialog updates do not clobber child trigger')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ── DatePicker ────────────────────────────────────────────────────────────

test('DatePicker: value changes sync to parent and rendered calendar views update', async () => {
  const restoreDom = installDom()
  try {
    const { Component, ZagComponent } = await loadHarness()
    const datepicker = requireModule('@zag-js/date-picker')
    const { spreadProps } = await import('@zag-js/vanilla')
    const { CalendarDate } = requireModule('@internationalized/date')

    const DatePicker = await loadRealComponent('date-picker.tsx', 'DatePicker', ZagComponent, {
      datepicker,
      spreadProps,
    })

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import DatePicker from './DatePicker'
      export default class Parent extends Component {
        dateVal = ''
        template() {
          return (
            <div>
              <DatePicker
                label="Select date"
                defaultFocusedValue={this.props.focusedDate}
                onValueChange={(d) => { this.dateVal = d.valueAsString[0] || '' }}
              />
              <span class="display">{this.dateVal || '(none)'}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/DatePickerParent.jsx',
      'Parent',
      { Component, DatePicker },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent({ focusedDate: new CalendarDate(2025, 6, 1) })
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el!.querySelector('.display')?.textContent, '(none)', 'initial display is empty')

    const child = componentFromRoot<any>(view.el!.querySelector('[data-part="root"]'))
    assert.ok(child._api, 'Zag API is connected')

    let content = view.el!.querySelector('[data-part="content"]') as HTMLElement
    assert.ok(content, 'content element found')
    assert.equal(content.querySelectorAll('[data-part="table-cell-trigger"]').length, 42, 'day view renders a day grid')

    const targetDate = new CalendarDate(2025, 6, 15)
    child._api.setValue([targetDate])
    await flushMicrotasks()

    assert.equal(child.value[0]?.toString(), targetDate.toString(), 'child value updates')
    assert.equal((view as any).dateVal, child.valueAsString[0], 'parent callback receives selected date')
    assert.equal(view.el!.querySelector('.display')?.textContent, child.valueAsString[0], 'parent DOM updates')

    child._api.setView('month')
    await flushMicrotasks()

    assert.equal(child._api.view, 'month', 'view is month')
    content = view.el!.querySelector('[data-part="content"]') as HTMLElement
    assert.equal(content.querySelectorAll('[data-part="table-cell-trigger"]').length, 12, 'month view renders months')

    child._api.setView('year')
    await flushMicrotasks()

    assert.equal(child._api.view, 'year', 'view is year')
    content = view.el!.querySelector('[data-part="content"]') as HTMLElement
    assert.equal(content.querySelectorAll('[data-part="table-cell-trigger"]').length, 10, 'year view renders years')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('DatePicker: day trigger state tracks selection and focus', async () => {
  const restoreDom = installDom()
  try {
    const { Component, ZagComponent } = await loadHarness()
    const datepicker = requireModule('@zag-js/date-picker')
    const { spreadProps } = await import('@zag-js/vanilla')
    const { CalendarDate } = requireModule('@internationalized/date')

    const DatePicker = await loadRealComponent('date-picker.tsx', 'DatePicker', ZagComponent, {
      datepicker,
      spreadProps,
    })

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import DatePicker from './DatePicker'
      export default class Parent extends Component {
        template() {
          return (
            <div>
              <DatePicker
                label="Pick a date"
                defaultFocusedValue={this.props.focusedDate}
              />
            </div>
          )
        }
      }
      `,
      '/virtual/DatePickerStateParent.jsx',
      'Parent',
      { Component, DatePicker },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const initialFocus = new CalendarDate(2025, 6, 1)
    const view = new Parent({ focusedDate: initialFocus })
    view.render(root)
    await flushMicrotasks()

    const child = componentFromRoot<any>(view.el!.querySelector('[data-part="root"]'))
    assert.ok(child._api, 'Zag API is connected')

    child._api.setFocusedValue(initialFocus)
    await flushMicrotasks()

    const content = view.el!.querySelector('[data-part="content"]') as HTMLElement
    assert.ok(content, 'content found')

    const dayTriggers = Array.from(content.querySelectorAll('[data-part="table-cell-trigger"]')) as HTMLElement[]
    const initialTrigger = dayTriggers.find(
      (trigger) => trigger.textContent === '1' && trigger.hasAttribute('data-focus'),
    )
    assert.ok(initialTrigger, 'initial focused day trigger found')
    assert.equal(initialTrigger.getAttribute('data-focus'), '', 'initial day starts focused')
    assert.equal(initialTrigger.getAttribute('tabindex'), '0', 'initial day starts tabbable')

    const selectedDate = new CalendarDate(2025, 6, 15)
    child._api.setValue([selectedDate])
    await flushMicrotasks()

    const selectedTriggers = Array.from(content.querySelectorAll('[data-part="table-cell-trigger"]')) as HTMLElement[]
    const selectedTrigger = selectedTriggers.find((trigger) => trigger.textContent === '15')
    const unselectedTrigger = selectedTriggers.find((trigger) => trigger.textContent === '1')
    assert.ok(selectedTrigger, 'selected day trigger found')
    assert.ok(unselectedTrigger, 'unselected day trigger found')
    assert.equal(selectedTrigger.getAttribute('data-selected'), '', 'selected day is marked selected')
    assert.equal(unselectedTrigger.hasAttribute('data-selected'), false, 'unselected day is not marked selected')

    const nextFocus = new CalendarDate(2025, 6, 20)
    child._api.setFocusedValue(nextFocus)
    await flushMicrotasks()

    const focusedTriggers = Array.from(content.querySelectorAll('[data-part="table-cell-trigger"]')) as HTMLElement[]
    const focusedTrigger = focusedTriggers.find((trigger) => trigger.textContent === '20')
    const previousFocusedTrigger = focusedTriggers.find((trigger) => trigger.textContent === '1')
    assert.ok(focusedTrigger, 'new focused day trigger found')
    assert.ok(previousFocusedTrigger, 'previous focused day trigger found')
    assert.equal(focusedTrigger.getAttribute('data-focus'), '', 'new focused day is marked focused')
    assert.equal(focusedTrigger.getAttribute('tabindex'), '0', 'new focused day is tabbable')
    assert.equal(previousFocusedTrigger.hasAttribute('data-focus'), false, 'previous focused day loses focus state')
    assert.equal(
      previousFocusedTrigger.getAttribute('tabindex'),
      '-1',
      'previous focused day is removed from tab order',
    )

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
