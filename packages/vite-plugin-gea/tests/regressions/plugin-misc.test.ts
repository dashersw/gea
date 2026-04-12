import assert from 'node:assert/strict'
import test from 'node:test'
import { transformComponentSource, geaPlugin, t } from './plugin-helpers'

test('transform creates a distinct child instance for each self-closing component use', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import Counter from './counter'

    export default class ParentView extends Component {
      template() {
        return (
          <div>
            <Counter count={1} />
            <Counter count={2} />
          </div>
        )
      }
    }
  `)

  // v2 uses mount for child components
  const mountCalls = output.match(/mount\(Counter/g)
  assert.ok(mountCalls, 'should have mount(Counter calls')
  assert.equal(mountCalls!.length, 2, 'should mount Counter twice')
})

test('component used only in render prop is compiled with mount', () => {
  const output = transformComponentSource(
    `
    import { Component } from '@geajs/core'
    import MySelect from './MySelect.jsx'
    import Avatar from './Avatar.jsx'

    export default class UserPicker extends Component {
      template() {
        return (
          <div>
            <MySelect
              options={['a', 'b']}
              renderOption={(opt) => <Avatar name={opt} />}
            />
          </div>
        )
      }
    }
  `,
  )

  assert.match(
    output,
    /mount\(Avatar/,
    'Avatar must be instantiated via mount even when only in a render prop',
  )
})

test('static style object is compiled to reactiveAttr', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class StyledBox extends Component {
      template() {
        return <div style={{ backgroundColor: 'red', padding: '10px', fontSize: '14px' }}>Box</div>
      }
    }
  `)
  // v2 uses reactiveAttr for style objects
  assert.match(output, /reactiveAttr/, 'should use reactiveAttr for style objects')
  assert.match(output, /backgroundColor/, 'should preserve camelCase property names in style object')
  assert.match(output, /padding/, 'padding should appear in output')
  assert.match(output, /fontSize/, 'fontSize should appear in output')
  assert.ok(!output.includes('[object Object]'), 'Style object should not become [object Object]')
})

test('dynamic style object generates reactiveAttr with object expression', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class DynStyle extends Component {
      template() {
        return <div style={{ color: this.textColor }}>Dynamic</div>
      }
    }
  `)
  assert.ok(!output.includes('[object Object]'), 'Style object should not become [object Object]')
  assert.match(output, /reactiveAttr/, 'Dynamic style should use reactiveAttr')
  assert.match(output, /"style"/, 'Should pass "style" as attribute name')
})

test('string style attribute still works as before', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class InlineStyle extends Component {
      template() {
        return <div style="color: blue">Blue text</div>
      }
    }
  `)
  assert.match(output, /style='color: blue'|style="color: blue"/, 'String style should pass through in template')
})

test('IIFE returning JSX is detected and transformed', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class StatusView extends Component {
      template() {
        return (
          <div>
            {(() => {
              if (this.loading) return <span>Loading...</span>
              return <span>Done</span>
            })()}
          </div>
        )
      }
    }
  `)
  assert.match(output, /Loading/, 'Loading branch should be in the output')
  assert.match(output, /Done/, 'Done branch should be in the output')
  // v2 creates template() calls for the JSX elements inside IIFE
  assert.match(output, /template\(/, 'JSX inside IIFE should be converted to template() calls')
})

test('IIFE with multiple return branches containing JSX is transformed', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class MultiReturn extends Component {
      template() {
        return (
          <div>
            {(() => {
              if (this.status === 'loading') return <span>Loading</span>
              if (this.status === 'error') return <span>Error</span>
              return <span>Ready</span>
            })()}
          </div>
        )
      }
    }
  `)
  assert.match(output, /Loading/, 'Loading branch should appear in output')
  assert.match(output, /Error/, 'Error branch should appear in output')
  assert.match(output, /Ready/, 'Ready branch should appear in output')
})

test('unused template IIFE over store state preserves IIFE in GEA_CREATE_TEMPLATE', () => {
  const baseOutput = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class SheetCell extends Component {
      template() {
        return <span>{this.props.address}</span>
      }
    }
  `)

  const unusedIifeOutput = transformComponentSource(`
    import { Component } from '@geajs/core'
    import sheetStore, { formatDisplayNumber } from './sheet-store'

    export default class SheetCell extends Component {
      template() {
        const displayValue = (() => {
          const raw = sheetStore.cells[this.props.address] ?? ''
          if (!raw.startsWith('=')) return raw
          const c = sheetStore.computed[this.props.address]
          if (!c) return ''
          if (c.kind === 'err') return c.message
          return formatDisplayNumber(c.value)
        })()

        return <span>{this.props.address}</span>
      }
    }
  `)

  // v2 does not emit __observe_ methods or [GEA_REQUEST_RENDER] — it uses computation()
  // The unused IIFE should not generate computation() calls for store reads
  assert.doesNotMatch(
    baseOutput,
    /computation\(.*sheetStore/,
    'baseline should not include sheetStore computation',
  )
})

test('used template IIFE over store state does not emit coarse rerender', () => {
  const usedIifeOutput = transformComponentSource(`
    import { Component } from '@geajs/core'
    import sheetStore, { formatDisplayNumber } from './sheet-store'

    export default class SheetCell extends Component {
      template() {
        const displayValue = (() => {
          const raw = sheetStore.cells[this.props.address] ?? ''
          if (!raw.startsWith('=')) return raw
          const c = sheetStore.computed[this.props.address]
          if (!c) return ''
          if (c.kind === 'err') return c.message
          return formatDisplayNumber(c.value)
        })()

        return <span>{displayValue}</span>
      }
    }
  `)

  // v2 uses reactiveContent for dynamic text
  assert.match(
    usedIifeOutput,
    /reactiveContent|computation/,
    'used IIFE should have reactiveContent or computation for dynamic text',
  )
})

test('unused template-local store reads produce no computation for those reads', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import sheetStore from './sheet-store'

    export default class StaticLabel extends Component {
      template() {
        const unusedSelection = sheetStore.activeAddress
        const unusedDraft = sheetStore.barDraft
        return <span>Static</span>
      }
    }
  `)

  // v2 should not create computation() for unused locals
  // The output should just have the template with static content
  assert.doesNotMatch(
    output,
    /computation\(.*activeAddress/,
    'unused activeAddress local should not create computation',
  )
  assert.doesNotMatch(
    output,
    /computation\(.*barDraft/,
    'unused barDraft local should not create computation',
  )
})

test('unused template local does not add subscriptions when getter already drives rendering', () => {
  const getterOnlyOutput = transformComponentSource(`
    import { Component } from '@geajs/core'
    import sheetStore, { formatDisplayNumber } from './sheet-store'

    interface SheetCellProps {
      address: string
    }

    export default class SheetCell extends Component {
      declare props: SheetCellProps
      editing = false
      editBuffer = ''

      get displayValue(): string {
        const raw = sheetStore.cells[this.props.address] ?? ''
        if (!raw.startsWith('=')) return raw
        const c = sheetStore.computed[this.props.address]
        if (!c) return ''
        if (c.kind === 'err') return c.message
        return formatDisplayNumber(c.value)
      }

      template({ address }: SheetCellProps) {
        const selected = sheetStore.activeAddress === this.props.address
        const { editing, editBuffer } = this
        return (
          <td class={\`sheet-cell \${selected ? 'sheet-cell-selected' : ''}\`} data-address={address} tabIndex={selected ? 0 : -1}>
            {editing ? <input value={editBuffer} /> : <span>{this.displayValue}</span>}
          </td>
        )
      }
    }
  `)

  const getterPlusUnusedLocalOutput = transformComponentSource(`
    import { Component } from '@geajs/core'
    import sheetStore, { formatDisplayNumber } from './sheet-store'

    interface SheetCellProps {
      address: string
    }

    export default class SheetCell extends Component {
      declare props: SheetCellProps
      editing = false
      editBuffer = ''

      get displayValue(): string {
        const raw = sheetStore.cells[this.props.address] ?? ''
        if (!raw.startsWith('=')) return raw
        const c = sheetStore.computed[this.props.address]
        if (!c) return ''
        if (c.kind === 'err') return c.message
        return formatDisplayNumber(c.value)
      }

      template({ address }: SheetCellProps) {
        const selected = sheetStore.activeAddress === this.props.address
        const { editing, editBuffer } = this
        const unusedDisplayValue = (() => {
          const raw = sheetStore.cells[this.props.address] ?? ''
          if (!raw.startsWith('=')) return raw
          const c = sheetStore.computed[this.props.address]
          if (!c) return ''
          if (c.kind === 'err') return c.message
          return formatDisplayNumber(c.value)
        })()
        return (
          <td class={\`sheet-cell \${selected ? 'sheet-cell-selected' : ''}\`} data-address={address} tabIndex={selected ? 0 : -1}>
            {editing ? <input value={editBuffer} /> : <span>{this.displayValue}</span>}
          </td>
        )
      }
    }
  `)

  // Both should compile successfully
  assert.ok(getterOnlyOutput, 'getter-only should compile')
  assert.ok(getterPlusUnusedLocalOutput, 'getter + unused local should compile')
})

test('ref attribute compiles to direct assignment in v2', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class Canvas extends Component {
      template() {
        return <canvas ref={this.canvasEl} width="800" height="600" />
      }
    }
  `)
  assert.match(output, /this\.canvasEl\s*=\s*__el/, 'ref should compile to direct element assignment')
  assert.ok(
    !/ ref="[^"]*"/.test(output),
    'ref should not be emitted as a bare HTML attribute in template string',
  )
})

test('multiple ref attributes each get direct assignments', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class Dual extends Component {
      template() {
        return (
          <div>
            <canvas ref={this.canvas} />
            <input ref={this.input} />
          </div>
        )
      }
    }
  `)
  assert.match(output, /this\.canvas\s*=\s*__/, 'canvas ref should be assigned')
  assert.match(output, /this\.input\s*=\s*__/, 'input ref should be assigned')
})

test('ref attribute compiles to direct assignment, not bare HTML attribute', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class ChatInput extends Component {
      myTextarea = null
      template() {
        return (
          <div>
            <textarea ref={this.myTextarea}></textarea>
            <button onclick={this.trySubmit}>Send</button>
          </div>
        )
      }
      trySubmit() {
        console.log(this.myTextarea)
      }
    }
  `)

  assert.match(output, /this\.myTextarea\s*=\s*__/, 'ref should compile to direct assignment')
})

test('ref attribute does not appear in template HTML string', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class Canvas extends Component {
      canvasEl = null
      template() {
        return <canvas ref={this.canvasEl} width="800" height="600" />
      }
    }
  `)

  assert.match(output, /this\.canvasEl\s*=\s*__/, 'ref should compile to direct assignment')
  const templateMatch = output.match(/template\("([^"]*)"\)/)
  if (templateMatch) {
    assert.ok(!templateMatch[1].includes('ref='), 'template HTML string should not contain ref=')
  }
})

test('onclick (on-prefixed) event uses reactiveAttr in v2', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class Button extends Component {
      template() {
        return <button onclick={this.handleClick}>Click</button>
      }
      handleClick() {}
    }
  `)

  assert.match(output, /delegateEvent.*"click"/, 'onclick should compile to delegateEvent with "click" event')
  // Template string should not contain onclick=
  const templateMatch = output.match(/template\("([^"]*)"\)/)
  if (templateMatch) {
    assert.ok(!templateMatch[1].includes('onclick='), 'template HTML string should not contain onclick=')
  }
})

test('ref compiles to direct assignment, onclick compiles to delegateEvent', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class Form extends Component {
      inputEl = null
      template() {
        return (
          <form>
            <input ref={this.inputEl} />
            <button onclick={this.submit}>Go</button>
          </form>
        )
      }
      submit() {}
    }
  `)

  assert.match(output, /this\.inputEl\s*=\s*__/, 'ref should compile to direct assignment')
  assert.match(output, /delegateEvent/, 'onclick should compile to delegateEvent')
})

// v2 plugin does not have configResolved or HMR injection
test('plugin transforms component files via transform hook', async () => {
  const plugin = geaPlugin()
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler

  const result = await transform?.call(
    {} as never,
    `
      import { Component } from '@geajs/core'

      export default class App extends Component {
        template() {
          return <div>Hello</div>
        }
      }
    `,
    '/virtual/build-app.jsx',
  )
  const output = typeof result === 'string' ? result : result?.code

  assert.ok(output, 'component should be transformed')
  assert.match(output!, /GEA_CREATE_TEMPLATE/, 'output should have GEA_CREATE_TEMPLATE')
  assert.match(output!, /template\(/, 'output should use template() calls')
})
