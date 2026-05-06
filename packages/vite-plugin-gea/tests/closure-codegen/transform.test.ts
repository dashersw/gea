import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { transformFile } from '../../src/closure-codegen/transform.ts'
import { transformCompiledStoreModule } from '../../src/closure-codegen/transform/transform-store.ts'

describe('transform: end-to-end file transform', () => {
  it('transforms hello-world', () => {
    const src = `import { Component } from '@geajs/core'
export default class App extends Component {
  template() { return <div>Hello World</div> }
}`
    const { code, changed, rewritten } = transformFile(src, '/virtual/App.tsx')
    assert.equal(changed, true)
    assert.deepEqual(rewritten, ['App'])
    // Tiny static text elements skip the template/cache path.
    assert.match(code, /function _tpl0_create\(\) \{[\s\S]*const e = document\.createElement\("div"\);/)
    assert.match(code, /e\.textContent = "Hello World"/)
    assert.doesNotMatch(code, /let _tpl0_root = null/)
    assert.doesNotMatch(code, /document\.createElement\("template"\)/)
    assert.doesNotMatch(code, /\(\(\) =>/)
    // Class body has new method, not old template()
    assert.match(code, /\[GEA_STATIC_TEMPLATE\]\(\) \{/)
    assert.doesNotMatch(code, /template\(\)\s*\{\s*return/)
    // Compiler protocol import stays on the compiler-runtime entry.
    assert.match(
      code,
      /import \{[^}]*CompiledStaticElementComponent[^}]*GEA_STATIC_TEMPLATE[^}]*\} from ["']virtual:gea-compiler-runtime["']|import \{[^}]*GEA_STATIC_TEMPLATE[^}]*CompiledStaticElementComponent[^}]*\} from ["']virtual:gea-compiler-runtime["']/,
    )
    assert.match(code, /class App extends CompiledStaticElementComponent/)
    assert.doesNotMatch(code, /CompiledStaticComponent/)
    assert.doesNotMatch(code, /CompiledComponent/)
    assert.doesNotMatch(code, /scheduleAfterRenderAsync/)
    assert.doesNotMatch(code, /cloneNode/)
    assert.doesNotMatch(code, /\bnodeType\b/)
  })

  it('emits onAfterRenderAsync scheduling only when the hook exists', () => {
    const src = `import { Component } from '@geajs/core'
export default class App extends Component {
  onAfterRenderAsync() { window.didRender = true }
  template() { return <div>Hello World</div> }
}`
    const { code, changed, importsNeeded } = transformFile(src, '/virtual/App.tsx')

    assert.equal(changed, true)
    assert.ok(importsNeeded.includes('scheduleAfterRenderAsync'))
    assert.match(
      code,
      /import \{[^}]*scheduleAfterRenderAsync[^}]*\} from ["']virtual:gea-compiler-runtime["']/,
    )
    assert.match(code, /render\(parent, _index\) \{[\s\S]*super\.render\(parent, _index\);[\s\S]*scheduleAfterRenderAsync\(this\);/)
  })

  it('keeps event-only static components on the single-element static base', () => {
    const src = `import { Component } from '@geajs/core'
export default class App extends Component {
  template() { return <button onClick={() => console.log('x')}>x</button> }
}`
    const { code, changed } = transformFile(src)
    assert.equal(changed, true)
    assert.match(code, /delegateClick\(root, \[\[evt\d+, h\d+, false\]\]\)/)
    assert.match(code, /class App extends CompiledStaticElementComponent/)
    assert.doesNotMatch(code, /CompiledStaticComponent/)
  })

  it('keeps static fragments off the single-element static base', () => {
    const src = `import { Component } from '@geajs/core'
export default class App extends Component {
  template() { return <><div>A</div><div>B</div></> }
}`
    const { code, changed } = transformFile(src)
    assert.equal(changed, true)
    assert.match(code, /class App extends CompiledStaticComponent/)
    assert.doesNotMatch(code, /CompiledStaticElementComponent/)
  })

  it('transforms a component with reactive text and augments imports', () => {
    const src = `import { Component } from '@geajs/core'
export class Counter extends Component {
  template() { return <div>Count: {this.count}</div> }
}`
    const { code, changed, importsNeeded, ir } = transformFile(src)
    assert.equal(changed, true)
    assert.ok(importsNeeded.includes('reactiveTextValue'))
    assert.match(
      code,
      /import \{[^}]*reactiveTextValue[^}]*GEA_CREATE_TEMPLATE[^}]*\} from ["']virtual:gea-compiler-runtime["']|import \{[^}]*GEA_CREATE_TEMPLATE[^}]*reactiveTextValue[^}]*\} from ["']virtual:gea-compiler-runtime["']/,
    )
    assert.match(code, /import \{ Component \} from ["']@geajs\/core["']/)
    assert.match(code, /reactiveTextValue\(t0, d, this, \["count"\]\)/)
    assert.equal(ir?.components[0]?.exportName, 'Counter')
    assert.equal(ir?.components[0]?.template.slots[0]?.kind, 'text')
    assert.equal(ir?.components[0]?.template.slots[0]?.expr, 'this.count')
    assert.deepEqual(ir?.components[0]?.template.slots[0]?.exprPath, ['this', 'count'])
  })

  it('emits IR for keyed-list slots', () => {
    const src = `import { Component } from '@geajs/core'
export class Rows extends Component {
  template() { return <ul>{this.items.map(item => <li style={{ left: item.x }}>{item.label}</li>)}</ul> }
}`
    const { changed, ir } = transformFile(src, '/virtual/Rows.tsx')
    assert.equal(changed, true)
    assert.equal(ir?.components[0]?.exportName, 'Rows')
    const listSlot = ir?.components[0]?.template.slots.find((slot) => slot.kind === 'keyed-list')
    assert.ok(listSlot)
    assert.equal(listSlot.expr, 'this.items')
    assert.deepEqual(listSlot.exprPath, ['this', 'items'])
    assert.equal(listSlot.payload?.itemParam, 'item')
    assert.match(listSlot.payload?.rowTemplate?.html ?? '', /^<li/)
    assert.equal(listSlot.payload?.rowTemplate?.slots[0]?.kind, 'style')
    assert.deepEqual(listSlot.payload?.rowTemplate?.slots[0]?.exprObjectFields, [
      { name: 'left', expr: 'item.x', exprPath: ['item', 'x'] },
    ])
    assert.equal(listSlot.payload?.rowTemplate?.slots[1]?.kind, 'text')
    assert.deepEqual(listSlot.payload?.rowTemplate?.slots[1]?.exprPath, ['item', 'label'])
    assert.match(JSON.stringify(listSlot.payload), /item\.label|item\.x/)
  })

  it('emits store IR for named gea-embedded store instances without rewriting JS', () => {
    const src = `import { Store } from 'gea-embedded'
export class BreakoutStore extends Store {
  bricks = [{ x: 0, y: 0, alive: 1, opacity: 255, color: '#EF4444' }]
}
export const breakout = new BreakoutStore()
`
    const result = transformCompiledStoreModule(src, '/virtual/BreakoutStore.tsx')
    assert.equal(result?.changed, false)
    assert.equal(result?.code, src)
    assert.equal(result?.ir?.className, 'BreakoutStore')
    const bricks = result?.ir?.fields.find((field) => field.name === 'bricks')
    assert.equal(bricks?.shape?.kind, 'array')
    assert.match(JSON.stringify(bricks?.shape), /"x"|"opacity"|"color"/)
  })

  it('leaves non-component class untouched', () => {
    const src = `class Store { count = 0 }`
    const { code, changed } = transformFile(src)
    assert.equal(changed, false)
    assert.equal(code, src)
  })

  it('leaves files without JSX untouched', () => {
    const src = `export const x = 1`
    const { code, changed } = transformFile(src)
    assert.equal(changed, false)
    assert.equal(code, src)
  })

  it('handles multiple component classes in one file', () => {
    const src = `import { Component } from '@geajs/core'
export class A extends Component { template() { return <span>a</span> } }
export class B extends Component { template() { return <em>{this.n}</em> } }`
    const { code, changed, rewritten } = transformFile(src)
    assert.equal(changed, true)
    assert.deepEqual(rewritten.sort(), ['A', 'B'])
    // Two hoisted templates
    assert.match(code, /_tpl0/)
    assert.match(code, /_tpl1/)
    // B has reactive text
    assert.match(code, /reactiveTextValue\(t0, d, this, \["n"\]\)/)
  })

  it('transforms component with event handler', () => {
    const src = `import { Component } from '@geajs/core'
export class App extends Component {
  template() {
    return <button onClick={() => this.count++}>+</button>
  }
}`
    const { code } = transformFile(src)
    // Click handlers that do not read currentTarget use the smallest delegated path.
    assert.match(code, /delegateClick\(root, \[\[evt\d+, h\d+, false\]\]\)/)
  })

  it('inlines local static function components as direct DOM factories', () => {
    const src = `import { Component } from '@geajs/core'
import store from './store.ts'
function Button({ id, text, click }) {
  return (
    <div class="col-sm-6 smallpad">
      <button type="button" class="btn btn-primary btn-block" id={id} click={click}>{text}</button>
    </div>
  )
}
export default class App extends Component {
  template() {
    return <main><Button id="run" text="Run" click={() => store.run()} /></main>
  }
}`
    const { code } = transformFile(src)
    assert.match(code, /function Button\(id, text, click\)/)
    assert.match(code, /const __n0 = Button\("run", "Run", \(\) => store\.run\(\)\)/)
    assert.match(code, /parent0\.appendChild\(__n0\)/)
    assert.match(code, /ensureClickDelegate\(/)
    assert.doesNotMatch(code, /mount\(/)
    assert.doesNotMatch(code, /reactiveText\(/)
    assert.doesNotMatch(code, /reactiveAttr\(/)
  })

  it('keeps function components reactive when props are dynamic', () => {
    const src = `import { Component } from '@geajs/core'
import store from './store.ts'
function Note({ count }) {
  return <p>{count}</p>
}
export default class App extends Component {
  template() {
    return <main><Note count={store.count} /></main>
  }
}`
    const { code } = transformFile(src)
    assert.match(code, /mount\(/)
    assert.match(code, /reactiveTextValue\(/)
    assert.doesNotMatch(code, /const __n0 = Note\(\{/)
  })

  it('keeps direct function child prop getters lexical when they read this.props', () => {
    const src = `import { Component } from '@geajs/core'
import Icon from './Icon.tsx'
export default class Card extends Component {
  template() {
    return <div><Icon type={this.props.type} size={18} /></div>
  }
}`
    const { code } = transformFile(src, '/virtual/Card.tsx', {
      directFactoryComponents: new Set(['Icon']),
    })

    assert.match(code, /Object\.defineProperty\(__fp\d+, __k\d+,/)
    assert.match(code, /Icon\(__fp\d+, __fd\d+\)/)
    assert.doesNotMatch(code, /get type\(\)\s*\{\s*return this\.props\.type/)
  })

  it('adds import if @geajs/core was never imported', () => {
    const src = `class App extends Component {
  template() { return <div/> }
}`
    // Note: this file doesn't `extends Component` from an imported Component — it uses a bare `Component` identifier.
    // Transformer treats this as "extends Component" if the identifier matches.
    const { code, changed } = transformFile(src)
    assert.equal(changed, true)
    assert.match(code, /import\s+\{[^}]*GEA_STATIC_TEMPLATE[^}]*\}\s+from\s+["']virtual:gea-compiler-runtime["']/)
  })

  it('relational-class optimization: store.X === item.Y → one subscribe at list scope', () => {
    const src = `import { Component } from '@geajs/core'
import store from './store.ts'
export default class App extends Component {
  template() {
    return (
      <table><tbody>
        {store.data.map((item) => (
          <tr class={store.selected === item.id ? 'danger' : ''}>
            <td>{item.id}</td>
          </tr>
        ))}
      </tbody></table>
    )
  }
}`
    const { code } = transformFile(src)
    // List-scope shared map + one subscribe
    assert.match(code, /const __rowEls_r0 = \{\}/)
    assert.match(code, /relationalClassProp\(d, store, "selected", __rowEls_r0, "danger", store\.selected\)/)
    // Per-row: registration + initial class + disposer delete
    assert.match(code, /__rowEls_r0\[item\.id\] = root/)
    // Direct `.className =` assignment — the relational-class detector
    // already stripped `class={...}` from JSX, so the cloned row has no
    // class attribute and assignment is safe (no existing tokens to lose).
    assert.match(code, /if \(store\.selected === item\.id\) root\.className = "danger"/)
    // Cleanup is hoisted to keyedList's `onItemRemove` so the inline no-op
    // disposer path can kick in.
    assert.match(code, /onItemRemove: e => \{\s*delete __rowEls_r0\[e\.item\.id\]/)
    assert.doesNotMatch(code, /d\.add\(\(\) => delete __rowEls_r0/)
    // Must NOT emit reactiveClass for that attribute
    assert.doesNotMatch(code, /reactiveClass\(/)
  })

  it('relational-class: falls through to string class binding when ternary branches are both non-empty', () => {
    const src = `import { Component } from '@geajs/core'
import store from './store.ts'
export default class App extends Component {
  template() {
    return (
      <ul>{store.data.map((item) => (
        <li class={store.selected === item.id ? 'a' : 'b'}>{item.id}</li>
      ))}</ul>
    )
  }
}`
    const { code } = transformFile(src)
    // Should NOT match the relationalClass path
    assert.doesNotMatch(code, /relationalClass\(/)
    // Should fall back to the string-only class helper.
    assert.match(code, /reactiveClassName\(/)
  })

  it('relational-class: skips when item side is not a member of the map param', () => {
    const src = `import { Component } from '@geajs/core'
import store from './store.ts'
export default class App extends Component {
  template() {
    return (
      <ul>{store.data.map((item) => (
        <li class={store.selected === 42 ? 'danger' : ''}>{item.id}</li>
      ))}</ul>
    )
  }
}`
    const { code } = transformFile(src)
    assert.doesNotMatch(code, /relationalClass\(/)
    assert.match(code, /reactiveClassName\(/)
  })
})
