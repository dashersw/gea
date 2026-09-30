/**
 * https://github.com/dashersw/gea/issues/93 (element half)
 *
 * `{...obj}` on an HTML element was dropped from the template: none of the
 * object's attributes or handlers reached the element. A spread now merges
 * with the element's attributes in source order and stays live.
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxModule, loadRuntimeModules } from '../helpers/compile'
import { EVENT_NAMES } from '../../src/utils/events'
import { BOOL_ATTRS } from '../../src/closure-codegen/generator/generator-attrs'
import {
  SPREAD_ANIMATION_ATTRIBUTES as COMPILER_ANIMATION_ATTRIBUTES,
  SPREAD_ANIMATION_ELEMENTS as COMPILER_ANIMATION_ELEMENTS,
  spreadAttrName,
  walkJsxToTemplate,
} from '../../src/closure-codegen/generator/walk'
import { templateSpecToIr } from '../../src/closure-codegen/ir'
import { parse } from '@babel/parser'
import {
  SPREAD_ANIMATION_ATTRIBUTES,
  SPREAD_ANIMATION_ELEMENTS,
  SPREAD_BOOL_ATTRS,
  SPREAD_EVENT_NAMES,
  spreadKeyName,
} from '../../../gea/src/runtime/reactive-spread'

type View = { render: (n: Node) => void; dispose: () => void; [k: string]: any }

async function mount(source: string, id: string, bindings: Record<string, unknown> = {}) {
  const [{ default: Component }] = await loadRuntimeModules(`issue93-spread-${id}-${Date.now()}`)
  const m = await compileJsxModule(source, `/virtual/${id}.tsx`, ['App'], { Component, ...bindings })
  const App = m.App as { new (): View }
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = new App()
  app.render(root)
  await flushMicrotasks()
  return { root, app }
}

function click(el: Element | null): void {
  assert.ok(el, 'element to click')
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

describe('element spread attributes (#93)', { concurrency: false }, () => {
  let restoreDom: () => void
  beforeEach(() => (restoreDom = installDom()))
  afterEach(() => restoreDom())

  it('passes the rest of a template() parameter to the button, handlers included (issue repro)', async () => {
    const log: unknown[] = []
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        export class FooButton extends Component {
          template({ children, class: cls, ...props }) {
            log.push(Object.keys(props))
            return (
              <button class={\`foo-button \${cls ?? ''}\`} {...props}>
                {children}
              </button>
            )
          }
        }
        export class App extends Component {
          template() {
            return (
              <div>
                <FooButton class="big" type="button" onClick={() => log.push('clicked!')}>Go</FooButton>
              </div>
            )
          }
        }
      `,
      'IssueRepro',
      { log },
    )
    assert.deepEqual(log.splice(0), [['type', 'onClick']], 'the rest object is defined and excludes named keys')
    const button = root.querySelector('button')!
    assert.equal(button.className.trim(), 'foo-button big')
    assert.equal(button.getAttribute('type'), 'button')
    click(button)
    assert.deepEqual(log, ['clicked!'])
    app.dispose()
  })

  it('applies a plain object and follows its changes', async () => {
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        export class App extends Component {
          attrs = { id: 'target', title: 'first', 'data-x': 1, 'aria-label': 'Label' }
          template() {
            return <div><i {...this.attrs} /></div>
          }
        }
      `,
      'PlainObject',
    )
    const i = root.querySelector('i')!
    assert.equal(i.id, 'target')
    assert.equal(i.getAttribute('title'), 'first')
    assert.equal(i.getAttribute('data-x'), '1')
    assert.equal(i.getAttribute('aria-label'), 'Label')

    app.attrs.title = 'second'
    await flushMicrotasks()
    assert.equal(i.getAttribute('title'), 'second')

    app.attrs = { id: 'target', 'data-y': 'y' }
    await flushMicrotasks()
    assert.equal(i.hasAttribute('title'), false, 'a key that is gone is removed')
    assert.equal(i.hasAttribute('data-x'), false)
    assert.equal(i.hasAttribute('aria-label'), false)
    assert.equal(i.getAttribute('data-y'), 'y')
    app.dispose()
  })

  it('spreads the rest of this.props, live, with its handlers', async () => {
    const log: string[] = []
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        class FooButton extends Component {
          template() {
            const { children, class: cls, ...props } = this.props
            return <button class={\`foo-button \${cls ?? ''}\`} {...props}>{children}</button>
          }
        }
        export class App extends Component {
          title = 'Save it'
          template() {
            return (
              <div>
                <FooButton class="big" title={this.title} type="submit" onClick={() => log.push('clicked')}>
                  Save
                </FooButton>
              </div>
            )
          }
        }
      `,
      'ThisPropsRest',
      { log },
    )
    const button = root.querySelector('button')!
    assert.equal(button.className.trim(), 'foo-button big')
    assert.equal(button.getAttribute('title'), 'Save it')
    assert.equal(button.getAttribute('type'), 'submit')
    assert.equal(button.hasAttribute('onClick'), false)
    assert.equal(button.hasAttribute('onclick'), false)
    assert.equal(button.textContent!.trim(), 'Save')

    click(button)
    assert.deepEqual(log, ['clicked'])

    app.title = 'Saved'
    await flushMicrotasks()
    assert.equal(button.getAttribute('title'), 'Saved')
    app.dispose()
  })

  it('spreads this.props itself, skipping children', async () => {
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        class Tag extends Component {
          template() {
            return <span {...this.props}>{this.props.children}</span>
          }
        }
        export class App extends Component {
          role = 'note'
          template() {
            return <div><Tag role={this.role} data-id="7">hi</Tag></div>
          }
        }
      `,
      'ThisProps',
    )
    const span = root.querySelector('span')!
    assert.equal(span.getAttribute('role'), 'note')
    assert.equal(span.getAttribute('data-id'), '7')
    assert.equal(span.hasAttribute('children'), false)
    assert.equal(span.textContent, 'hi')
    app.role = 'status'
    await flushMicrotasks()
    assert.equal(span.getAttribute('role'), 'status')
    app.dispose()
  })

  it('merges with the element attributes in source order', async () => {
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        export class App extends Component {
          o = { title: 'spread', id: 'from-spread' }
          template() {
            return (
              <div>
                <b id="before" title="written" {...this.o} />
                <u {...this.o} title="written" data-k={this.o.id} />
              </div>
            )
          }
        }
      `,
      'SourceOrder',
    )
    const b = root.querySelector('b')!
    const u = root.querySelector('u')!
    // A spread overrides the attributes before it...
    assert.equal(b.getAttribute('title'), 'spread')
    assert.equal(b.id, 'from-spread')
    // ...and the attributes after it override the spread.
    assert.equal(u.getAttribute('title'), 'written')
    assert.equal(u.id, 'from-spread')
    assert.equal(u.getAttribute('data-k'), 'from-spread')

    app.o = { title: 'changed' }
    await flushMicrotasks()
    assert.equal(b.getAttribute('title'), 'changed')
    assert.equal(b.id, 'before', 'a key that is gone falls back to the attribute before the spread')
    assert.equal(u.getAttribute('title'), 'written')
    assert.equal(u.hasAttribute('id'), false)
    app.dispose()
  })

  it('writes class, style, booleans, value and visible like their attributes', async () => {
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        export class App extends Component {
          a = {
            className: 'one two',
            style: { backgroundColor: 'red', width: '10px' },
            disabled: true,
            value: 'typed',
            htmlFor: 'x',
            visible: true,
          }
          template() {
            return (
              <div>
                <input class="base" {...this.a} />
                <label {...this.a} />
              </div>
            )
          }
        }
      `,
      'Kinds',
    )
    const input = root.querySelector('input')!
    const label = root.querySelector('label')!
    assert.equal(input.className, 'one two', 'className in the spread overrides the class before it')
    assert.equal(input.style.backgroundColor, 'red')
    assert.equal(input.style.width, '10px')
    assert.equal(input.disabled, true)
    assert.equal(input.value, 'typed')
    assert.equal(input.style.display, '')
    assert.equal(label.getAttribute('for'), 'x')
    assert.equal(label.hasAttribute('htmlFor'), false)

    app.a = { class: ['three'], style: 'color: blue', disabled: false, value: 'next', visible: false }
    await flushMicrotasks()
    assert.equal(input.className, 'three')
    assert.equal(input.style.backgroundColor, '')
    assert.equal(input.style.color, 'blue')
    assert.equal(input.disabled, false)
    assert.equal(input.value, 'next')
    assert.equal(input.style.display, 'none')

    app.a = {}
    await flushMicrotasks()
    assert.equal(input.className, 'base', 'without a class key the class before the spread applies again')
    assert.equal(input.style.color, '')
    assert.equal(input.style.display, '')
    assert.equal(label.hasAttribute('for'), false)
    app.dispose()
  })

  it('installs, swaps and removes spread event handlers', async () => {
    const log: string[] = []
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        export class App extends Component {
          h = { onClick: (e) => log.push('a:' + e.currentTarget.id) }
          template() {
            return (
              <div id="outer" onClick={() => log.push('outer')}>
                <button id="btn" onMouseDown={this.down} {...this.h}>Go</button>
              </div>
            )
          }
          down() {
            log.push('down:' + (this instanceof App))
          }
        }
      `,
      'Events',
      { log },
    )
    const btn = root.querySelector('#btn')!
    click(btn)
    assert.deepEqual(log.splice(0), ['a:btn', 'outer'], 'currentTarget is the element; the click bubbles')
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    assert.deepEqual(log.splice(0), ['down:true'], 'a this.method before a spread is bound to the component')

    app.h = {
      click: (e) => {
        log.push('b')
        e.stopPropagation()
      },
      onMouseDown: () => log.push('spread-down'),
    }
    await flushMicrotasks()
    click(btn)
    assert.deepEqual(log.splice(0), ['b'], 'the new handler replaces the old one and can stop propagation')
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    assert.deepEqual(log.splice(0), ['spread-down'], 'the spread overrides the handler before it')

    app.h = { title: 'no handler' }
    await flushMicrotasks()
    click(btn)
    assert.deepEqual(log.splice(0), ['outer'], 'a removed handler no longer runs')
    assert.equal(btn.getAttribute('title'), 'no handler')
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    assert.deepEqual(log.splice(0), ['down:true'], 'without the key, the handler before the spread applies again')
    app.dispose()
  })

  it('skips children, key, ref, dangerouslySetInnerHTML and function values', async () => {
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        export class App extends Component {
          o = {
            children: 'nope',
            key: 'k',
            ref: 'r',
            dangerouslySetInnerHTML: '<b>x</b>',
            renderItem: () => 1,
            onClick: 'alert(1)',
            title: 't',
          }
          template() {
            return <div><p {...this.o}>kept</p></div>
          }
        }
      `,
      'Skipped',
    )
    const p = root.querySelector('p')!
    assert.equal(p.outerHTML, '<p title="t">kept</p>')
    app.dispose()
  })

  it("reads only the spread object's own keys", async () => {
    const log: string[] = []
    const base = { title: 'inherited', onClick: () => log.push('inherited') }
    const makeAttrs = () => Object.assign(Object.create(base), { id: 'own' })
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        export class App extends Component {
          o = makeAttrs()
          template() {
            return <div><p {...this.o}>kept</p></div>
          }
        }
      `,
      'OwnKeys',
      { makeAttrs },
    )
    const p = root.querySelector('p')!
    assert.equal(p.outerHTML, '<p id="own">kept</p>', 'like Object.assign, a spread copies own keys only')
    click(p)
    assert.deepEqual(log, [], 'an inherited handler is not installed')
    app.dispose()
  })

  it('skips spread keys that are not valid attribute names', async () => {
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        export class App extends Component {
          o = { 'bad name': 'a', 'x>y': 'b', '1st': 'c', '': 'd', title: 't', 'data-ok': 'e' }
          template() {
            return <div><p {...this.o}>kept</p></div>
          }
          add() {
            this.o = { ...this.o, 'still bad': 'f', lang: 'en' }
          }
        }
      `,
      'InvalidNames',
    )
    assert.equal(root.querySelector('p')?.outerHTML, '<p title="t" data-ok="e">kept</p>')
    app.add()
    await flushMicrotasks()
    assert.equal(root.querySelector('p')?.outerHTML, '<p title="t" data-ok="e" lang="en">kept</p>')
    app.dispose()
  })

  it('treats on* keys in any letter case as handlers, never as attributes', async () => {
    const log: string[] = []
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        export class App extends Component {
          strings = { ONCLICK: 'x', OnMouseDown: 'y', onClick: 'z', title: 't' }
          fns = { ONCLICK: () => log.push('upper'), OnMouseDown: () => log.push('mixed') }
          template() {
            return (
              <div>
                <p id="strings" {...this.strings}>s</p>
                <p id="fns" {...this.fns}>f</p>
              </div>
            )
          }
        }
      `,
      'OnAnyCase',
      { log },
    )
    assert.equal(root.querySelector('#strings')?.outerHTML, '<p id="strings" title="t">s</p>')
    assert.equal(root.querySelector('#fns')?.outerHTML, '<p id="fns">f</p>')
    click(root.querySelector('#strings'))
    const fns = root.querySelector('#fns')!
    click(fns)
    fns.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    assert.deepEqual(log, ['upper', 'mixed'])
    app.dispose()
  })

  it('writes URL attribute values from a spread through sanitizeAttr', async () => {
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        export class App extends Component {
          blocked = { href: 'javascript:void(0)', src: ' JavaScript:void(0)', action: 'vbscript:x', 'xlink:href': 'javascript:void(0)' }
          button = { formaction: 'javascript:void(0)', type: 'submit' }
          allowed = { href: '/docs', src: 'data:image/png;base64,AAAA', title: 'javascript:void(0)' }
          url = 'javascript:void(0)'
          template() {
            return (
              <form>
                <a id="blocked" {...this.blocked}>b</a>
                <button {...this.button}>go</button>
                <a id="allowed" {...this.allowed}>a</a>
                <a id="before" href={this.url} {...this.button}>c</a>
              </form>
            )
          }
          swap() {
            this.allowed = { ...this.allowed, href: 'javascript:void(1)' }
          }
        }
      `,
      'UrlValues',
    )
    const blocked = root.querySelector('#blocked')!
    for (const name of ['href', 'src', 'action', 'xlink:href']) assert.equal(blocked.getAttribute(name), '', name)
    assert.equal(root.querySelector('button')?.getAttribute('formaction'), '')
    assert.equal(root.querySelector('button')?.getAttribute('type'), 'submit')
    const allowed = root.querySelector('#allowed')!
    assert.equal(allowed.getAttribute('href'), '/docs')
    assert.equal(allowed.getAttribute('src'), 'data:image/png;base64,AAAA')
    assert.equal(allowed.getAttribute('title'), 'javascript:void(0)', 'only URL attributes are filtered')
    assert.equal(
      root.querySelector('#before')?.getAttribute('href'),
      '',
      'an attribute before the spread is applied by it',
    )
    app.swap()
    await flushMicrotasks()
    assert.equal(allowed.getAttribute('href'), '', 'an update is filtered too')
    app.dispose()
  })

  it('leaves srcdoc to the template and assigns no spread key as a property', async () => {
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        export class App extends Component {
          frame = { srcdoc: 'a', srcDoc: 'b', SRCDOC: 'c', title: 'f' }
          attrs = { innerHTML: '<b>x</b>', outerHTML: '<b>y</b>', textContent: 'z', innerText: 'w' }
          template() {
            return (
              <div>
                <iframe id="spread" {...this.frame}></iframe>
                <iframe id="written" srcdoc="kept" {...this.frame}></iframe>
                <p id="attrs" {...this.attrs}>kept</p>
              </div>
            )
          }
          swap() {
            this.frame = { ...this.frame, srcdoc: 'd' }
            this.attrs = { ...this.attrs, innerHTML: '<i>v</i>' }
          }
        }
      `,
      'TemplateOnly',
    )
    const check = () => {
      const spread = root.querySelector('#spread')!
      assert.equal(spread.hasAttribute('srcdoc'), false, 'a spread never writes srcdoc')
      assert.equal(spread.getAttribute('title'), 'f')
      assert.equal(
        root.querySelector('#written')?.getAttribute('srcdoc'),
        'kept',
        'a srcdoc in the template still applies',
      )
      const p = root.querySelector('#attrs')!
      assert.equal(p.childNodes.length, 1)
      assert.equal(p.textContent, 'kept', 'innerHTML, outerHTML, textContent and innerText are not assigned')
      assert.equal(root.querySelectorAll('b, i').length, 0)
      assert.equal(p.getAttribute('innerhtml'), app.attrs.innerHTML, 'they are ordinary attributes')
    }
    check()
    app.swap()
    await flushMicrotasks()
    check()
    app.dispose()
  })

  it('leaves animation attributes to the template on SVG animation elements only', async () => {
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        export class App extends Component {
          anim = { attributeName: 'x', TO: '1', From: '0', by: '2', VALUES: '0;1', dur: '1s' }
          matrix = { type: 'matrix', values: '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0', to: 't' }
          template() {
            return (
              <svg>
                <animate id="animate" {...this.anim} />
                <set id="set" {...this.anim} />
                <animateMotion id="motion" {...this.anim} />
                <animateTransform id="transform" {...this.anim} />
                <animate id="written" attributeName="opacity" to="1" {...this.anim} />
                <filter id="filter">
                  <feColorMatrix id="matrix" {...this.matrix} />
                </filter>
              </svg>
            )
          }
          swap() {
            this.anim = { ...this.anim, attributeName: 'y', values: '1;0', dur: '2s' }
            this.matrix = { ...this.matrix, values: '0 1 0 0 0 1 0 0 0 0 0 0 1 0 0 0 0 0 1 0' }
          }
        }
      `,
      'Animation',
    )
    const check = () => {
      for (const id of ['animate', 'set', 'motion', 'transform']) {
        const el = root.querySelector('#' + id)!
        assert.deepEqual(
          el.getAttributeNames().filter((n) => n !== 'id'),
          ['dur'],
          id + ' takes no animation attribute from a spread',
        )
        assert.equal(el.getAttribute('dur'), app.anim.dur)
      }
      const written = root.querySelector('#written')!
      assert.equal(written.getAttribute('attributeName'), 'opacity', 'the template still sets them')
      assert.equal(written.getAttribute('to'), '1')
      assert.equal(written.getAttribute('dur'), app.anim.dur)
      const matrix = root.querySelector('#matrix')!
      assert.equal(matrix.getAttribute('values'), app.matrix.values, 'other elements take them from a spread')
      assert.equal(matrix.getAttribute('to'), 't')
      assert.equal(matrix.getAttribute('type'), 'matrix')
    }
    check()
    app.swap()
    await flushMicrotasks()
    check()
    app.dispose()
  })

  it('works in keyed-list rows', async () => {
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        export class App extends Component {
          selected = 2
          items = [
            { id: 1, label: 'a', attrs: { title: 'one' } },
            { id: 2, label: 'b', attrs: { title: 'two', 'data-flag': 'y' } },
          ]
          template() {
            return (
              <ul>
                {this.items.map((item) => (
                  <li key={item.id} class={this.selected === item.id ? 'on' : ''} {...item.attrs}>
                    {item.label}
                  </li>
                ))}
              </ul>
            )
          }
        }
      `,
      'KeyedRows',
    )
    const rows = () => [...root.querySelectorAll('li')]
    assert.deepEqual(
      rows().map((li) => [li.textContent, li.getAttribute('title'), li.getAttribute('data-flag'), li.className]),
      [
        ['a', 'one', null, ''],
        ['b', 'two', 'y', 'on'],
      ],
    )
    app.items[0].attrs = { title: 'uno', class: 'x' }
    app.selected = 1
    await flushMicrotasks()
    assert.equal(rows()[0].getAttribute('title'), 'uno')
    assert.equal(rows()[0].className, 'x', 'the class key in the spread overrides the class before it')
    assert.equal(rows()[1].className, '')

    app.items[1].attrs.title = 'dos'
    await flushMicrotasks()
    assert.equal(rows()[1].getAttribute('title'), 'dos')

    app.items.push({ id: 3, label: 'c', attrs: { title: 'three' } })
    await flushMicrotasks()
    assert.equal(rows()[2].getAttribute('title'), 'three')
    app.dispose()
  })

  it('lets a class after the spread win in keyed rows', async () => {
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        export class App extends Component {
          selected = 1
          items = [{ id: 1, attrs: { class: 'row' } }, { id: 2, attrs: { class: 'row' } }]
          template() {
            return (
              <ul>
                {this.items.map((item) => (
                  <li key={item.id} {...item.attrs} class={this.selected === item.id ? 'on' : ''} />
                ))}
              </ul>
            )
          }
        }
      `,
      'RelationalAfter',
    )
    const rows = () => [...root.querySelectorAll('li')].map((li) => li.className)
    assert.deepEqual(rows(), ['on', ''], 'the class after the spread wins')
    app.selected = 2
    await flushMicrotasks()
    assert.deepEqual(rows(), ['', 'on'])
    app.dispose()
  })

  it('works in a function component called directly', async () => {
    const log: string[] = []
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        function Btn({ label, ...rest }) {
          return <button class="b" {...rest}>{label}</button>
        }
        export class App extends Component {
          template() {
            return <div><Btn label="Go" title="Go now" onClick={() => log.push('go')} /></div>
          }
        }
      `,
      'DirectFn',
      { log },
    )
    const button = root.querySelector('button')!
    assert.equal(button.outerHTML, '<button class="b" title="Go now">Go</button>')
    click(button)
    assert.deepEqual(log, ['go'])
    app.dispose()
  })
})

describe('element spread names match the compiler (#93)', () => {
  it('uses the same event, boolean attribute and animation lists', () => {
    assert.deepEqual([...SPREAD_EVENT_NAMES].sort(), [...EVENT_NAMES].sort())
    assert.deepEqual([...SPREAD_BOOL_ATTRS].sort(), [...BOOL_ATTRS].sort())
    assert.deepEqual([...SPREAD_ANIMATION_ELEMENTS].sort(), [...COMPILER_ANIMATION_ELEMENTS].sort())
    assert.deepEqual([...SPREAD_ANIMATION_ATTRIBUTES].sort(), [...COMPILER_ANIMATION_ATTRIBUTES].sort())
  })

  it('names a spread key the way the compiler names the attribute', () => {
    const names = [
      ...EVENT_NAMES,
      'onClick',
      'onMouseDown',
      'onDoubleClick',
      'ONCLICK',
      'OnMouseDown',
      'className',
      'class',
      'htmlFor',
      'style',
      'value',
      'visible',
      'disabled',
      'title',
      'data-id',
      'aria-label',
      'children',
      'key',
      'ref',
      'dangerouslySetInnerHTML',
      'on',
    ]
    for (const name of names) assert.equal(spreadKeyName(name), spreadAttrName(name), name)
  })
})

describe('element spread IR (#93)', () => {
  it('records the spread slot with its sources and the attributes that win', () => {
    const ast: any = parse('<div><b id="x" {...this.attrs} title="t" /></div>', { plugins: ['jsx'] })
    const spec = walkJsxToTemplate(ast.program.body[0].expression, { emitEventDataAttr: false })
    const ir = templateSpecToIr(spec)
    assert.equal(ir.html, '<div><b title=t>')
    assert.equal(ir.slots.length, 1)
    assert.equal(ir.slots[0].kind, 'spread')
    assert.match(ir.slots[0].expr!, /^\[\{\s*id: "x"\s*\}, this\.attrs\]$/)
    assert.deepEqual(ir.slots[0].payload, { skip: ['title'], explicit: [0] })
  })
})
