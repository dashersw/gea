/**
 * Regression tests for gea-ui Zag components using the REAL source files:
 *   - RadioGroup (packages/gea-ui/src/components/radio-group.tsx)
 *   - Slider     (packages/gea-ui/src/components/slider.tsx)
 *   - NumberInput(packages/gea-ui/src/components/number-input.tsx)
 *
 * Each test compiles the actual component source through the Vite plugin,
 * wires it to the real Zag.js state machines, and verifies parent-child
 * value binding via onValueChange callbacks.
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

import { transformSync } from 'esbuild'
import { JSDOM } from 'jsdom'
import { geaPlugin } from '../../vite-plugin-gea/src/index'

// ── JSDOM setup ──────────────────────────────────────────────────────────

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')

  // Batched rAF implementation that mimics real browser behavior:
  // all callbacks registered in the same "frame" execute together in one batch
  const rafQueue: { id: number; cb: FrameRequestCallback }[] = []
  let nextRafId = 1
  let rafScheduled = false
  const cancelledRafs = new Set<number>()

  const requestAnimationFrame = (cb: FrameRequestCallback) => {
    const id = nextRafId++
    rafQueue.push({ id, cb })
    if (!rafScheduled) {
      rafScheduled = true
      setTimeout(() => {
        rafScheduled = false
        const batch = rafQueue.splice(0)
        const now = Date.now()
        for (const entry of batch) {
          if (!cancelledRafs.has(entry.id)) {
            entry.cb(now)
          }
          cancelledRafs.delete(entry.id)
        }
      }, 0)
    }
    return id
  }
  const cancelAnimationFrame = (id: number) => {
    cancelledRafs.add(id)
  }

  const previous: Record<string, any> = {}
  const globals: Record<string, any> = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    MutationObserver: dom.window.MutationObserver,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    requestAnimationFrame,
    cancelAnimationFrame,
    CSS: { escape: (s: string) => s.replace(/([!"#$%&'()*+,./:;<=>?@[\]^`{|}~])/g, '\\$1') },
  }

  for (const key in globals) {
    previous[key] = (globalThis as any)[key]
  }
  Object.assign(globalThis, globals)

  return () => {
    Object.assign(globalThis, previous)
    dom.window.close()
  }
}

async function flushMicrotasks(rounds = 20) {
  for (let i = 0; i < rounds; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

// ── Compilation helpers ──────────────────────────────────────────────────

async function compileSource(source: string, id: string, className: string, bindings: Record<string, unknown>) {
  const plugin = geaPlugin()
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
  const result = await transform?.call({} as never, source, id)
  assert.ok(result, `compilation of ${id} succeeded`)

  const rawCode = typeof result === 'string' ? result : result.code
  const tsStripped = transpileTs(rawCode)
  const compiledSource = `${tsStripped
    .replace(/^import\b.*$/gm, '')
    .replace(/^export\s*\{[\s\S]*?\};?\s*$/gm, '')
    .replaceAll('import.meta.hot', 'undefined')
    .replaceAll('import.meta.url', '""')
    .replace(/export\s+default\s+class\s+/, 'class ')}
return ${className};`

  try {
    return new Function(...Object.keys(bindings), compiledSource)(...Object.values(bindings))
  } catch (e) {
    console.error(`\n=== COMPILATION ERROR for ${id} ===\n${compiledSource.substring(0, 2000)}\n===END===\n`)
    throw e
  }
}

async function loadRuntimeModules(seed: string) {
  const { default: ComponentManager } = await import('../../gea/src/lib/base/component-manager')
  ComponentManager.instance = undefined
  return Promise.all([
    import(`../../gea/src/lib/base/component.tsx?${seed}`),
    import(`../../gea/src/lib/store.ts?${seed}`),
  ])
}

function transpileTs(source: string): string {
  const result = transformSync(source, {
    loader: 'ts',
    format: 'esm',
    target: 'esnext',
  })
  return result.code
}

async function loadZagComponent(Component: any) {
  const { VanillaMachine, normalizeProps, spreadProps } = await import('@zag-js/vanilla')
  const src = await readFile(resolve(__dirname, '../src/primitives/zag-component.ts'), 'utf-8')
  const js = transpileTs(src)
    .replace(/^import\b.*$/gm, '')
    .replace(/^export\s+default\s+class\s+/, 'class ')
    .replace(/^export\s*\{[\s\S]*?\};?\s*$/gm, '')
  const fn = new Function('Component', 'VanillaMachine', 'normalizeProps', 'spreadProps', `${js}\nreturn ZagComponent;`)
  return fn(Component, VanillaMachine, normalizeProps, spreadProps)
}

async function loadRealComponent(fileName: string, className: string, ZagComponent: any, zagModule: any) {
  const { normalizeProps } = await import('@zag-js/vanilla')
  const src = await readFile(resolve(__dirname, `../src/components/${fileName}`), 'utf-8')
  return compileSource(src, `/virtual/${fileName}`, className, {
    ZagComponent,
    normalizeProps,
    ...zagModule,
  })
}

// ── Dialog ───────────────────────────────────────────────────────────────

test('Dialog: trigger must not have aria-hidden while focused', async () => {
  const restoreDom = installDom()
  try {
    const seed = `zag-real-${Date.now()}-dialog`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const ZagComponent = await loadZagComponent(Component)
    const zagMod = await import('@zag-js/dialog')
    const { normalizeProps } = await import('@zag-js/vanilla')

    const Dialog = await loadRealComponent('dialog.tsx', 'Dialog', ZagComponent, {
      dialog: zagMod,
      normalizeProps,
    })

    const Parent = await compileSource(
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
                onOpenChange={(d) => { this.isOpen = d.open }}
              >
                <p>Dialog content</p>
              </Dialog>
              <span class="status">{this.isOpen ? 'open' : 'closed'}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, Dialog },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const child = (view as any)._dialog
    assert.ok(child, 'Dialog child instance exists')
    assert.ok(child._api, 'Zag API is connected')
    assert.equal(child._api.open, false, 'dialog initially closed')

    const trigger = view.el!.querySelector('[data-part="trigger"]') as HTMLButtonElement
    assert.ok(trigger, 'trigger button found')

    // Focus the trigger and click to open
    trigger.focus()
    assert.equal(document.activeElement, trigger, 'trigger is focused before click')

    // Intercept setAttribute to catch the exact moment aria-hidden is applied
    const origSetAttribute = trigger.setAttribute.bind(trigger)
    let ariaHiddenSetWhileFocused = false
    trigger.setAttribute = function (name: string, value: string) {
      origSetAttribute(name, value)
      if (name === 'aria-hidden' && value === 'true') {
        if (document.activeElement === trigger) {
          ariaHiddenSetWhileFocused = true
        }
      }
    }

    // Simulate real browser behavior: in a real browser, focus() silently fails
    // on an element that was recently display:none (via `hidden` attribute)
    // because it has no layout object yet. Layout objects are only created
    // during the browser's layout phase, AFTER rAF callbacks.
    //
    // Reading offsetHeight/getBoundingClientRect forces a synchronous layout
    // reflow, which creates layout objects and makes focus() work.
    //
    // We simulate this by tracking whether layout has been forced on the
    // content element and only allowing focus() after layout.
    const content = view.el!.querySelector('[data-part="content"]') as HTMLElement
    assert.ok(content, 'content found')
    let contentHasLayout = !content.hasAttribute('hidden')
    const origContentFocus = content.focus.bind(content)
    content.focus = function (opts?: FocusOptions) {
      if (!contentHasLayout) return
      origContentFocus(opts)
    }
    Object.defineProperty(content, 'offsetHeight', {
      get() {
        contentHasLayout = !content.hasAttribute('hidden')
        return 0
      },
      configurable: true,
    })

    trigger.click()
    await flushMicrotasks()

    assert.equal(child._api.open, true, 'dialog is open after click')

    // Verify hideContentBelow ran (trigger should have the data-aria-hidden marker)
    const triggerHasAriaHidden = trigger.getAttribute('aria-hidden') === 'true'
    const triggerHasMarker = trigger.hasAttribute('data-aria-hidden')

    // The critical check: aria-hidden must never be set on the trigger while it has focus
    assert.ok(
      !ariaHiddenSetWhileFocused,
      `aria-hidden="true" was set on the trigger while it still had focus. ` +
        `triggerHasAriaHidden=${triggerHasAriaHidden}, marker=${triggerHasMarker}, ` +
        `activeElement=${document.activeElement?.tagName}#${document.activeElement?.id}`,
    )

    // Verify the positioner is visible (hidden removed)
    const positioner = view.el!.querySelector('[data-part="positioner"]') as HTMLElement
    assert.ok(positioner, 'positioner found')
    assert.ok(!positioner.hasAttribute('hidden'), 'positioner hidden attribute must be removed when dialog is open')

    // Verify content is visible (content already captured above)
    assert.ok(!content.hasAttribute('hidden'), 'content hidden attribute must be removed when dialog is open')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ── RadioGroup ───────────────────────────────────────────────────────────

test('RadioGroup: initial value reflected, setValue updates parent', async () => {
  const restoreDom = installDom()
  try {
    const seed = `zag-real-${Date.now()}-radio`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const ZagComponent = await loadZagComponent(Component)
    const zagMod = await import('@zag-js/radio-group')
    const { normalizeProps } = await import('@zag-js/vanilla')

    const RadioGroup = await loadRealComponent('radio-group.tsx', 'RadioGroup', ZagComponent, {
      radioGroup: zagMod,
      normalizeProps,
    })

    const Parent = await compileSource(
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
      { Component, RadioGroup },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el?.querySelector('.display')?.textContent, 'pro', 'initial parent display')

    const child = (view as any)._radioGroup
    assert.ok(child, 'RadioGroup child instance exists')
    assert.ok(child._api, 'Zag API is connected')
    assert.equal(child._api.value, 'pro', 'Zag machine initial value is "pro"')

    child._api.setValue('enterprise')
    await flushMicrotasks()

    assert.equal(child._api.value, 'enterprise', 'Zag API must report "enterprise"')
    assert.equal(child.value, 'enterprise', 'child.value must be "enterprise"')
    assert.equal((view as any).radioVal, 'enterprise', 'parent state must be "enterprise"')
    assert.equal(view.el?.querySelector('.display')?.textContent, 'enterprise', 'parent DOM must show "enterprise"')

    child._api.setValue('free')
    await flushMicrotasks()

    assert.equal(child._api.value, 'free', 'Zag API after second change')
    assert.equal((view as any).radioVal, 'free')
    assert.equal(view.el?.querySelector('.display')?.textContent, 'free')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ── Slider ───────────────────────────────────────────────────────────────

test('Slider: initial value, setValue updates parent', async () => {
  const restoreDom = installDom()
  try {
    const seed = `zag-real-${Date.now()}-slider`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const ZagComponent = await loadZagComponent(Component)
    const zagMod = await import('@zag-js/slider')
    const { normalizeProps } = await import('@zag-js/vanilla')

    const Slider = await loadRealComponent('slider.tsx', 'Slider', ZagComponent, {
      slider: zagMod,
      normalizeProps,
    })

    const Parent = await compileSource(
      `
      import { Component } from '@geajs/core'
      import Slider from './Slider'
      export default class Parent extends Component {
        sliderVolume = 50
        template() {
          return (
            <div>
              <Slider
                value={[this.sliderVolume]}
                min={0}
                max={100}
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
      { Component, Slider },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el?.querySelector('.display')?.textContent, '50', 'initial display')

    const child = (view as any)._slider
    assert.ok(child._api, 'Zag API connected')
    assert.equal(child._api.value?.[0], 50, 'Zag initial [50]')

    child._api.setValue([30])
    await flushMicrotasks()

    assert.equal(child._api.value?.[0], 30, 'Zag API must be [30]')
    assert.equal((view as any).sliderVolume, 30, 'parent state 30')
    assert.equal(view.el?.querySelector('.display')?.textContent, '30', 'parent DOM "30"')

    child._api.setValue([75])
    await flushMicrotasks()

    assert.equal((view as any).sliderVolume, 75)
    assert.equal(view.el?.querySelector('.display')?.textContent, '75')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('Slider range: two thumbs, setValue updates both parent values', async () => {
  const restoreDom = installDom()
  try {
    const seed = `zag-real-${Date.now()}-range`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const ZagComponent = await loadZagComponent(Component)
    const zagMod = await import('@zag-js/slider')
    const { normalizeProps } = await import('@zag-js/vanilla')

    const Slider = await loadRealComponent('slider.tsx', 'Slider', ZagComponent, {
      slider: zagMod,
      normalizeProps,
    })

    const Parent = await compileSource(
      `
      import { Component } from '@geajs/core'
      import Slider from './Slider'
      export default class Parent extends Component {
        rangeMin = 20
        rangeMax = 80
        template() {
          return (
            <div>
              <Slider
                value={[this.rangeMin, this.rangeMax]}
                min={0}
                max={100}
                onValueChange={(d) => { this.rangeMin = d.value[0]; this.rangeMax = d.value[1] }}
              />
              <span class="min">{this.rangeMin}</span>
              <span class="max">{this.rangeMax}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, Slider },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el?.querySelector('.min')?.textContent, '20')
    assert.equal(view.el?.querySelector('.max')?.textContent, '80')

    const child = (view as any)._slider
    child._api.setValue([10, 60])
    await flushMicrotasks()

    assert.equal((view as any).rangeMin, 10)
    assert.equal((view as any).rangeMax, 60)
    assert.equal(view.el?.querySelector('.min')?.textContent, '10')
    assert.equal(view.el?.querySelector('.max')?.textContent, '60')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ── NumberInput ──────────────────────────────────────────────────────────

test('NumberInput: initial value, increment/decrement updates parent', async () => {
  const restoreDom = installDom()
  try {
    const seed = `zag-real-${Date.now()}-number`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const ZagComponent = await loadZagComponent(Component)
    const zagMod = await import('@zag-js/number-input')
    const { normalizeProps } = await import('@zag-js/vanilla')

    const NumberInput = await loadRealComponent('number-input.tsx', 'NumberInput', ZagComponent, {
      numberInput: zagMod,
      normalizeProps,
    })

    const Parent = await compileSource(
      `
      import { Component } from '@geajs/core'
      import NumberInput from './NumberInput'
      export default class Parent extends Component {
        numberVal = '5'
        template() {
          return (
            <div>
              <NumberInput
                value={this.numberVal}
                min={0}
                max={99}
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
      { Component, NumberInput },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el?.querySelector('.display')?.textContent, '5', 'initial display')

    const child = (view as any)._numberInput
    assert.ok(child._api, 'Zag API connected')
    assert.equal(child._api.value, '5', 'Zag initial "5"')

    child._api.increment()
    await flushMicrotasks()

    assert.equal(child._api.value, '6', 'Zag after increment')
    assert.equal((view as any).numberVal, '6', 'parent state "6"')
    assert.equal(view.el?.querySelector('.display')?.textContent, '6', 'parent DOM "6"')

    child._api.decrement()
    await flushMicrotasks()
    assert.equal((view as any).numberVal, '5', 'back to "5"')
    assert.equal(view.el?.querySelector('.display')?.textContent, '5')

    child._api.decrement()
    await flushMicrotasks()
    assert.equal((view as any).numberVal, '4', 'down to "4"')
    assert.equal(view.el?.querySelector('.display')?.textContent, '4')

    assert.equal(child._api.value, '4', 'Zag in sync')
    assert.equal(child.value, '4', 'child.value in sync')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ── Rapid changes ────────────────────────────────────────────────────────

// ── Combobox ─────────────────────────────────────────────────────────────

test('Combobox: initial value reflected, setValue updates parent', async () => {
  const restoreDom = installDom()
  try {
    const seed = `zag-real-${Date.now()}-combobox`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const ZagComponent = await loadZagComponent(Component)
    const zagMod = await import('@zag-js/combobox')
    const { normalizeProps } = await import('@zag-js/vanilla')

    const Combobox = await loadRealComponent('combobox.tsx', 'Combobox', ZagComponent, {
      combobox: zagMod,
      normalizeProps,
    })

    const Parent = await compileSource(
      `
      import { Component } from '@geajs/core'
      import Combobox from './Combobox'
      export default class Parent extends Component {
        comboboxVal = ''
        template() {
          return (
            <div>
              <Combobox
                value={this.comboboxVal ? [this.comboboxVal] : []}
                items={[
                  { value: 'us', label: 'United States' },
                  { value: 'uk', label: 'United Kingdom' },
                  { value: 'de', label: 'Germany' },
                  { value: 'fr', label: 'France' },
                ]}
                onValueChange={(d) => { this.comboboxVal = d.value[0] || '' }}
              />
              <span class="display">{this.comboboxVal || '(none)'}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, Combobox },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el?.querySelector('.display')?.textContent, '(none)', 'initial parent display')

    const child = (view as any)._combobox
    assert.ok(child, 'Combobox child instance exists')
    assert.ok(child._api, 'Zag API is connected')

    child._api.setValue(['de'])
    await flushMicrotasks()

    assert.equal(child.value[0], 'de', 'child.value must include "de"')
    assert.equal((view as any).comboboxVal, 'de', 'parent state must be "de"')
    assert.equal(view.el?.querySelector('.display')?.textContent, 'de', 'parent DOM must show "de"')

    child._api.setValue(['fr'])
    await flushMicrotasks()

    assert.equal(child.value[0], 'fr', 'child.value after second change')
    assert.equal((view as any).comboboxVal, 'fr', 'parent state "fr"')
    assert.equal(view.el?.querySelector('.display')?.textContent, 'fr', 'parent DOM "fr"')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('Combobox: clearing value syncs back to parent', async () => {
  const restoreDom = installDom()
  try {
    const seed = `zag-real-${Date.now()}-combobox-clear`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const ZagComponent = await loadZagComponent(Component)
    const zagMod = await import('@zag-js/combobox')
    const { normalizeProps } = await import('@zag-js/vanilla')

    const Combobox = await loadRealComponent('combobox.tsx', 'Combobox', ZagComponent, {
      combobox: zagMod,
      normalizeProps,
    })

    const Parent = await compileSource(
      `
      import { Component } from '@geajs/core'
      import Combobox from './Combobox'
      export default class Parent extends Component {
        comboboxVal = 'uk'
        template() {
          return (
            <div>
              <Combobox
                value={this.comboboxVal ? [this.comboboxVal] : []}
                items={[
                  { value: 'us', label: 'United States' },
                  { value: 'uk', label: 'United Kingdom' },
                  { value: 'de', label: 'Germany' },
                ]}
                onValueChange={(d) => { this.comboboxVal = d.value[0] || '' }}
              />
              <span class="display">{this.comboboxVal || '(none)'}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, Combobox },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el?.querySelector('.display')?.textContent, 'uk', 'initial display')

    const child = (view as any)._combobox
    child._api.setValue([])
    await flushMicrotasks()

    assert.equal((view as any).comboboxVal, '', 'parent state cleared')
    assert.equal(view.el?.querySelector('.display')?.textContent, '(none)', 'parent DOM shows (none)')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ── DatePicker ────────────────────────────────────────────────────────────

test('DatePicker: renders day grid, onValueChange updates parent, view switching works', async () => {
  const restoreDom = installDom()
  try {
    const seed = `zag-real-${Date.now()}-datepicker`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const ZagComponent = await loadZagComponent(Component)
    const zagMod = await import('@zag-js/date-picker')
    const { normalizeProps, spreadProps } = await import('@zag-js/vanilla')
    const { CalendarDate } = await import('@internationalized/date')

    const DatePicker = await loadRealComponent('date-picker.tsx', 'DatePicker', ZagComponent, {
      datepicker: zagMod,
      normalizeProps,
      spreadProps,
    })

    const Parent = await compileSource(
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
      '/virtual/Parent.jsx',
      'Parent',
      { Component, DatePicker },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent({ focusedDate: new CalendarDate(2025, 6, 1) })
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el?.querySelector('.display')?.textContent, '(none)', 'initial display is (none)')

    const child = (view as any)._datePicker
    assert.ok(child, 'DatePicker child instance exists')
    assert.ok(child._api, 'Zag API is connected')

    // Day grid must be rendered inside [data-part="content"]
    let content = view.el?.querySelector('[data-part="content"]') as HTMLElement
    assert.ok(content, 'content element found')
    const dayTable = content.querySelector('table')
    assert.ok(dayTable, 'day view table is rendered')

    // Trigger value change via Zag API
    child._api.setValue([new CalendarDate(2025, 6, 15)])
    await flushMicrotasks()

    assert.ok(child.valueAsString?.[0]?.includes('2025'), 'child.valueAsString contains 2025')
    assert.ok((view as any).dateVal?.includes('2025'), 'parent dateVal updated')
    assert.ok(view.el?.querySelector('.display')?.textContent?.includes('2025'), 'parent DOM updated')

    // Switching to month view must re-render content
    child._api.setView('month')
    await flushMicrotasks()

    assert.equal(child._api.view, 'month', 'view is month')
    content = view.el?.querySelector('[data-part="content"]') as HTMLElement
    assert.ok(content, 'content element found after month switch')
    const monthTable = content.querySelector('table')
    assert.ok(monthTable, 'month view table is rendered')

    // Switching to year view
    child._api.setView('year')
    await flushMicrotasks()

    assert.equal(child._api.view, 'year', 'view is year')
    content = view.el?.querySelector('[data-part="content"]') as HTMLElement
    assert.ok(content, 'content element found after year switch')
    const yearTable = content.querySelector('table')
    assert.ok(yearTable, 'year view table is rendered')

    // dispose must not throw (verifies cleanup lifecycle)
    assert.doesNotThrow(() => view.dispose(), 'dispose does not throw')
  } finally {
    restoreDom()
  }
})

test('DatePicker: selecting a date updates data-selected on the correct day trigger', async () => {
  const restoreDom = installDom()
  try {
    const seed = `zag-real-${Date.now()}-datepicker-select`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const ZagComponent = await loadZagComponent(Component)
    const zagMod = await import('@zag-js/date-picker')
    const { normalizeProps, spreadProps } = await import('@zag-js/vanilla')
    const { CalendarDate } = await import('@internationalized/date')

    const DatePicker = await loadRealComponent('date-picker.tsx', 'DatePicker', ZagComponent, {
      datepicker: zagMod,
      normalizeProps,
      spreadProps,
    })

    // Pin the calendar to June 2025 so the grid is deterministic
    const Parent = await compileSource(
      `
      import { Component } from '@geajs/core'
      import DatePicker from './DatePicker'
      export default class Parent extends Component {
        dateVal = ''
        template() {
          return (
            <div>
              <DatePicker
                label="Pick a date"
                defaultFocusedValue={this.props.focusedDate}
                onValueChange={(d) => { this.dateVal = d.valueAsString[0] || '' }}
              />
              <span class="display">{this.dateVal || '(none)'}</span>
            </div>
          )
        }
      }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, DatePicker },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent({ focusedDate: new CalendarDate(2025, 6, 1) })
    view.render(root)
    await flushMicrotasks()

    const child = (view as any)._datePicker
    assert.ok(child._api, 'Zag API is connected')

    // Select June 15 — same view and visible range, only selection state changes
    const targetDate = new CalendarDate(2025, 6, 15)
    child._api.setValue([targetDate])
    await flushMicrotasks()

    // Find the day trigger for June 15 by its data-value attribute
    const content = view.el?.querySelector('[data-part="content"]') as HTMLElement
    assert.ok(content, 'content found')

    const targetTrigger = content.querySelector(
      `[data-part="table-cell-trigger"][data-value="${targetDate.toString()}"]`,
    ) as HTMLElement
    assert.ok(targetTrigger, 'day trigger for 2025-06-15 found')
    assert.equal(
      targetTrigger.getAttribute('data-selected'),
      '',
      'day trigger for June 15 must have data-selected',
    )

    // A non-selected day must NOT have data-selected
    const otherDate = new CalendarDate(2025, 6, 10)
    const otherTrigger = content.querySelector(
      `[data-part="table-cell-trigger"][data-value="${otherDate.toString()}"]`,
    ) as HTMLElement
    assert.ok(otherTrigger, 'day trigger for 2025-06-10 found')
    assert.equal(
      otherTrigger.hasAttribute('data-selected'),
      false,
      'day trigger for June 10 must NOT have data-selected',
    )

    // Parent callback state must also be correct
    assert.ok((view as any).dateVal?.includes('2025'), 'parent dateVal updated via callback')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('DatePicker: moving focus within the same month updates data-focus and tabindex', async () => {
  const restoreDom = installDom()
  try {
    const seed = `zag-real-${Date.now()}-datepicker-focus`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const ZagComponent = await loadZagComponent(Component)
    const zagMod = await import('@zag-js/date-picker')
    const { normalizeProps, spreadProps } = await import('@zag-js/vanilla')
    const { CalendarDate } = await import('@internationalized/date')

    const DatePicker = await loadRealComponent('date-picker.tsx', 'DatePicker', ZagComponent, {
      datepicker: zagMod,
      normalizeProps,
      spreadProps,
    })

    // Pin the calendar to June 2025; focus starts on June 1
    const Parent = await compileSource(
      `
      import { Component } from '@geajs/core'
      import DatePicker from './DatePicker'
      export default class Parent extends Component {
        template() {
          return (
            <div>
              <DatePicker
                label="Focus test"
                defaultFocusedValue={this.props.focusedDate}
              />
            </div>
          )
        }
      }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, DatePicker },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const initialFocus = new CalendarDate(2025, 6, 1)
    const view = new Parent({ focusedDate: initialFocus })
    view.render(root)
    await flushMicrotasks()

    const child = (view as any)._datePicker
    assert.ok(child._api, 'Zag API is connected')

    const content = view.el?.querySelector('[data-part="content"]') as HTMLElement
    assert.ok(content, 'content found')

    // Verify initial focus is on June 1
    const june1Trigger = content.querySelector(
      `[data-part="table-cell-trigger"][data-value="${initialFocus.toString()}"]`,
    ) as HTMLElement
    assert.ok(june1Trigger, 'June 1 trigger found')
    assert.equal(june1Trigger.getAttribute('data-focus'), '', 'June 1 initially has data-focus')
    assert.equal(june1Trigger.getAttribute('tabindex'), '0', 'June 1 initially has tabindex=0')

    // Move focus to June 20 — same view, same visible range
    const nextFocus = new CalendarDate(2025, 6, 20)
    child._api.setFocusedValue(nextFocus)
    await flushMicrotasks()

    // June 20 must now have focus attributes
    const june20Trigger = content.querySelector(
      `[data-part="table-cell-trigger"][data-value="${nextFocus.toString()}"]`,
    ) as HTMLElement
    assert.ok(june20Trigger, 'June 20 trigger found')
    assert.equal(june20Trigger.getAttribute('data-focus'), '', 'June 20 now has data-focus')
    assert.equal(june20Trigger.getAttribute('tabindex'), '0', 'June 20 now has tabindex=0')

    // June 1 must have lost focus attributes
    const june1After = content.querySelector(
      `[data-part="table-cell-trigger"][data-value="${initialFocus.toString()}"]`,
    ) as HTMLElement
    assert.ok(june1After, 'June 1 trigger still in DOM')
    assert.equal(
      june1After.hasAttribute('data-focus'),
      false,
      'June 1 must NOT have data-focus after focus moved',
    )
    assert.equal(june1After.getAttribute('tabindex'), '-1', 'June 1 must have tabindex=-1 after focus moved')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ── Rapid changes ────────────────────────────────────────────────────────

test('RadioGroup: rapid setValue calls keep parent and Zag in sync', async () => {
  const restoreDom = installDom()
  try {
    const seed = `zag-real-${Date.now()}-rapid`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const ZagComponent = await loadZagComponent(Component)
    const zagMod = await import('@zag-js/radio-group')
    const { normalizeProps } = await import('@zag-js/vanilla')

    const RadioGroup = await loadRealComponent('radio-group.tsx', 'RadioGroup', ZagComponent, {
      radioGroup: zagMod,
      normalizeProps,
    })

    const Parent = await compileSource(
      `
      import { Component } from '@geajs/core'
      import RadioGroup from './RadioGroup'
      export default class Parent extends Component {
        radioVal = 'a'
        template() {
          return (
            <div>
              <RadioGroup
                value={this.radioVal}
                items={[
                  { value: 'a', label: 'A' },
                  { value: 'b', label: 'B' },
                  { value: 'c', label: 'C' },
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
      { Component, RadioGroup },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const child = (view as any)._radioGroup

    child._api.setValue('b')
    await flushMicrotasks()
    assert.equal((view as any).radioVal, 'b')
    assert.equal(view.el?.querySelector('.display')?.textContent, 'b')

    child._api.setValue('c')
    await flushMicrotasks()
    assert.equal((view as any).radioVal, 'c')
    assert.equal(view.el?.querySelector('.display')?.textContent, 'c')

    child._api.setValue('a')
    await flushMicrotasks()
    assert.equal((view as any).radioVal, 'a')
    assert.equal(view.el?.querySelector('.display')?.textContent, 'a')

    view.dispose()
  } finally {
    restoreDom()
  }
})
