import assert from 'node:assert/strict'
import test from 'node:test'
import { transformComponentSource, geaPlugin, getJSXTagName, t } from './plugin-helpers'

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

  assert.match(output, /this\._counter = this\[GEA_CHILD\]\(Counter/)
  assert.match(output, /this\._counter2 = this\[GEA_CHILD\]\(Counter/)
})

test('component used only in render prop is registered when in knownComponentImports', () => {
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
    new Set(['MySelect', 'Avatar']),
  )

  assert.match(
    output,
    /Component\._register\(Avatar,\s*"avatar"\)/,
    'Avatar must be registered via Component._register with its tag name even though it only appears in a render prop',
  )
})

test('static style object is compiled to inline CSS string', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class StyledBox extends Component {
      template() {
        return <div style={{ backgroundColor: 'red', padding: '10px', fontSize: '14px' }}>Box</div>
      }
    }
  `)
  assert.match(output, /background-color:\s*red/, 'camelCase key should be converted to kebab-case')
  assert.match(output, /padding:\s*10px/, 'padding should appear in output')
  assert.match(output, /font-size:\s*14px/, 'fontSize should become font-size')
  assert.ok(!output.includes('[object Object]'), 'Style object should not become [object Object]')
})

test('dynamic style object generates runtime conversion', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class DynStyle extends Component {
      template() {
        return <div style={{ color: this.textColor }}>Dynamic</div>
      }
    }
  `)
  assert.ok(!output.includes('[object Object]'), 'Style object should not become [object Object]')
  assert.match(output, /Object\.entries/, 'Dynamic style should use Object.entries at runtime')
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
  assert.match(output, /style="color: blue"/, 'String style should pass through unchanged')
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
  assert.ok(
    output.includes('<span>') || output.includes('`<span'),
    'JSX inside IIFE should be converted to template literal strings',
  )
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

test('unused template IIFE over store state does not emit coarse rerender observers', () => {
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

  assert.doesNotMatch(
    baseOutput,
    /__observe_sheetStore_(cells|computed)|\[GEA_REQUEST_RENDER\]\(\)/,
    'baseline should not include coarse store rerender observers',
  )
  assert.doesNotMatch(
    unusedIifeOutput,
    /__observe_sheetStore_cells/,
    'unused inline IIFE should not register a top-level cells observer',
  )
  assert.doesNotMatch(
    unusedIifeOutput,
    /__observe_sheetStore_computed/,
    'unused inline IIFE should not register a top-level computed observer',
  )
  assert.doesNotMatch(
    unusedIifeOutput,
    /__observe_sheetStore_cells[\s\S]*[GEA_REQUEST_RENDER]\(\)/,
    'unused inline IIFE should not force full rerender from cells observer',
  )
  assert.doesNotMatch(
    unusedIifeOutput,
    /__observe_sheetStore_computed[\s\S]*[GEA_REQUEST_RENDER]\(\)/,
    'unused inline IIFE should not force full rerender from computed observer',
  )
})

test('used template IIFE over store state does not emit coarse rerender observers', () => {
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

  assert.doesNotMatch(
    usedIifeOutput,
    /__observe_sheetStore_(cells|computed)[\s\S]*[GEA_REQUEST_RENDER]\(\)/,
    'used inline IIFE should not force full rerender from store observers',
  )
  assert.match(
    usedIifeOutput,
    /this\[GEA_OBSERVE\]\(sheetStore,\s*\["cells"\]/,
    'used inline IIFE should still observe cells updates',
  )
  assert.match(
    usedIifeOutput,
    /this\[GEA_OBSERVE\]\(sheetStore,\s*\["computed"\]/,
    'used inline IIFE should still observe computed updates',
  )
})

test('unused template-local store reads do not create observers', () => {
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

  assert.doesNotMatch(
    output,
    /__observe_sheetStore_activeAddress|this\[GEA_OBSERVE\]\(sheetStore,\s*\["activeAddress"\]/,
    'unused activeAddress local should not create observers',
  )
  assert.doesNotMatch(
    output,
    /__observe_sheetStore_barDraft|this\[GEA_OBSERVE\]\(sheetStore,\s*\["barDraft"\]/,
    'unused barDraft local should not create observers',
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

  const getterOnlyObserveCalls = getterOnlyOutput.match(/this\[GEA_OBSERVE\]\(sheetStore,[^)]+\)/g) ?? []
  const getterPlusUnusedLocalObserveCalls =
    getterPlusUnusedLocalOutput.match(/this\[GEA_OBSERVE\]\(sheetStore,[^)]+\)/g) ?? []

  assert.deepEqual(
    getterPlusUnusedLocalObserveCalls,
    getterOnlyObserveCalls,
    'unused template local should not add any extra sheetStore subscriptions when getter already covers the same state',
  )
})

test('getter-backed cell display observers guard by current address', () => {
  const output = transformComponentSource(`
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

  assert.match(
    output,
    /this\[GEA_OBSERVE\]\(sheetStore,\s*\["cells"\],\s*\(__v,\s*__c\)\s*=>\s*\{[\s\S]*this\.props\.address[\s\S]*pathParts[\s\S]*__observe_local_editing\((?:this\.displayValue|undefined),\s*null\)/,
    'cells observer should guard by this.props.address before routing to the conditional patch path',
  )
  assert.match(
    output,
    /this\[GEA_OBSERVE\]\(sheetStore,\s*\["computed"\],\s*\(__v,\s*__c\)\s*=>\s*\{[\s\S]*this\.props\.address[\s\S]*pathParts[\s\S]*__observe_local_editing\((?:this\.displayValue|undefined),\s*null\)/,
    'computed observer should guard by this.props.address before routing to the conditional patch path',
  )
})

test('ref attribute generates data-gea-ref marker and GEA_SETUP_REFS method', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class Canvas extends Component {
      template() {
        return <canvas ref={this.canvasEl} width="800" height="600" />
      }
    }
  `)
  assert.match(output, /data-gea-ref="ref0"/, 'Should emit data-gea-ref marker attribute')
  assert.match(output, /GEA_SETUP_REFS/, 'Should generate GEA_SETUP_REFS method')
  assert.match(output, /querySelector.*data-gea-ref/, 'Should query for data-gea-ref elements in GEA_SETUP_REFS')
  assert.match(output, /= null;\s*\n.*querySelector/s, 'Should clear ref target before querySelector')
  assert.ok(
    !/ ref="[^"]*"/.test(output.replace(/data-gea-ref="[^"]*"/g, '')),
    'ref should not be emitted as a bare HTML attribute',
  )
})

test('multiple ref attributes get unique IDs', () => {
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
  assert.match(output, /data-gea-ref="ref0"/, 'First ref should get ref0')
  assert.match(output, /data-gea-ref="ref1"/, 'Second ref should get ref1')
  assert.match(output, /GEA_SETUP_REFS/, 'Should generate GEA_SETUP_REFS method')
})

test('getJSXTagName handles namespaced names', () => {
  const name = t.jsxNamespacedName(t.jsxIdentifier('xlink'), t.jsxIdentifier('href'))
  assert.equal(getJSXTagName(name), 'xlink:href')
})

test('getJSXTagName handles simple identifier', () => {
  const name = t.jsxIdentifier('div')
  assert.equal(getJSXTagName(name), 'div')
})

test('getJSXTagName handles member expression', () => {
  const name = t.jsxMemberExpression(t.jsxIdentifier('React'), t.jsxIdentifier('Fragment'))
  assert.equal(getJSXTagName(name), 'React.Fragment')
})

test('HMR runtime skips accessor properties during state snapshot', () => {
  const plugin = geaPlugin()
  const load = typeof plugin.load === 'function' ? plugin.load : plugin.load?.handler
  const hmrSource = load?.call({} as never, '\0virtual:gea-hmr') as string | undefined
  assert.ok(hmrSource, 'HMR virtual module should return source code')
  assert.match(
    hmrSource!,
    /getOwnPropertyDescriptor/,
    'HMR runtime should use getOwnPropertyDescriptor to check for accessors',
  )
  assert.match(
    hmrSource!,
    /__desc\.get\s*\|\|\s*__desc\.set|__desc\s*&&\s*\(__desc\.get\s*\|\|\s*__desc\.set\)/,
    'HMR runtime should skip properties with get/set descriptors',
  )
})

test('ref attribute does not generate a reactive observer', () => {
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

  assert.doesNotMatch(
    output,
    /__observe_local_myTextarea|__observe.*myTextarea/,
    'ref binding must not generate a reactive observer for the ref target property',
  )
  assert.doesNotMatch(
    output,
    /setAttribute\(\s*["']ref["']/,
    'ref must not be set as an HTML attribute in observer or clone patch',
  )
  assert.doesNotMatch(
    output,
    /removeAttribute\(\s*["']ref["']/,
    'ref must not be removed as an HTML attribute in observer or clone patch',
  )
  assert.match(output, /data-gea-ref/, 'ref should still produce data-gea-ref marker')
  assert.match(output, /GEA_SETUP_REFS/, 'ref should still generate GEA_SETUP_REFS method')
})

test('ref attribute does not generate clone patch entry', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class Canvas extends Component {
      canvasEl = null
      template() {
        return <canvas ref={this.canvasEl} width="800" height="600" />
      }
    }
  `)

  assert.doesNotMatch(
    output,
    /\.setAttribute\(\s*["']ref["']/,
    'clone template must not patch ref as an HTML attribute',
  )
  assert.doesNotMatch(
    output,
    /__observe_local_canvasEl|__observe.*canvasEl/,
    'ref target must not generate a reactive observer',
  )
})

test('onclick (on-prefixed) event does not generate clone patch entry or observer', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class Button extends Component {
      template() {
        return <button onclick={this.handleClick}>Click</button>
      }
      handleClick() {}
    }
  `)

  assert.doesNotMatch(
    output,
    /\.setAttribute\(\s*["']onclick["']/,
    'onclick must not be set as an HTML attribute in clone patch',
  )
  assert.doesNotMatch(output, /__observe_local_handleClick/, 'onclick handler must not generate a reactive observer')
})

test('ref with onclick: ref gets marker, neither generates observer', () => {
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

  assert.match(output, /data-gea-ref/, 'ref marker should be present')
  assert.match(output, /GEA_SETUP_REFS/, 'GEA_SETUP_REFS should be generated')
  assert.doesNotMatch(output, /__observe_local_inputEl/, 'ref target must not have a reactive observer')
  assert.doesNotMatch(output, /\.setAttribute\(\s*["']ref["']/, 'ref must not appear as HTML attribute in clone patch')
  assert.doesNotMatch(
    output,
    /\.setAttribute\(\s*["']onclick["']/,
    'onclick must not appear as HTML attribute in clone patch',
  )
})

test('plugin skips HMR injection for build transforms', async () => {
  const plugin = geaPlugin()
  const configResolved =
    typeof plugin.configResolved === 'function' ? plugin.configResolved : plugin.configResolved?.handler
  await configResolved?.call({} as never, { command: 'build' } as never)
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

  assert.ok(output, 'component should still be transformed during build')
  assert.doesNotMatch(output!, /virtual:gea-hmr/, 'build output should not import the HMR runtime')
  assert.doesNotMatch(output!, /import\.meta\.hot/, 'build output should not include HMR guards')
  assert.doesNotMatch(output!, /import\.meta\.url/, 'build output should not retain HMR module URLs')
})
