import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  const raf = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number
  const caf = (id: number) => clearTimeout(id)
  dom.window.requestAnimationFrame = raf
  dom.window.cancelAnimationFrame = caf

  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: (globalThis as any).HTMLElement,
    Node: (globalThis as any).Node,
    NodeFilter: (globalThis as any).NodeFilter,
    MutationObserver: (globalThis as any).MutationObserver,
    Event: globalThis.Event,
    CustomEvent: globalThis.CustomEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  }

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLUnknownElement: dom.window.HTMLUnknownElement,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    MutationObserver: dom.window.MutationObserver,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    MouseEvent: dom.window.MouseEvent,
    DOMParser: dom.window.DOMParser,
    Element: dom.window.Element,
    Text: dom.window.Text,
    DocumentFragment: dom.window.DocumentFragment,
    Range: dom.window.Range,
    HTMLBRElement: dom.window.HTMLBRElement,
    requestAnimationFrame: raf,
    cancelAnimationFrame: caf,
  })

  return () => {
    Object.assign(globalThis, prev)
    dom.window.close()
  }
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

async function loadModules() {
  const seed = `quill-${Date.now()}-${Math.random()}`
  const mgr = await import(`../src/lib/base/component-manager?${seed}`)
  mgr.default.instance = undefined
  const [compMod] = await Promise.all([import(`../src/lib/base/component.tsx?${seed}`)])
  return {
    Component: compMod.default as typeof import('../src/lib/base/component').default,
  }
}

import Quill from 'quill'

describe('QuillEditor – __onPropChange prevents re-render', () => {
  let restoreDom: () => void
  let Component: Awaited<ReturnType<typeof loadModules>>['Component']

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('component WITHOUT __onPropChange re-renders and destroys Quill DOM', async () => {
    class NaiveQuillEditor extends Component {
      quill: Quill | null = null

      onAfterRender() {
        const container = this.el?.querySelector('.ql-container-target')
        if (!container || this.quill) return
        this.quill = new Quill(container as HTMLElement, {
          theme: 'snow',
          modules: { toolbar: false },
        })
        if (this.props.value) {
          this.quill.clipboard.dangerouslyPasteHTML(this.props.value)
        }
      }

      template() {
        return '<div class="quill-editor-wrapper"><div class="ql-container-target"></div></div>'
      }
    }

    const root = document.createElement('div')
    document.body.appendChild(root)

    const editor = new NaiveQuillEditor({ value: '<p>Hello world</p>' })
    editor.render(root)
    await flush()

    assert.ok(editor.quill, 'Quill should initialize')
    const quillRoot = editor.quill!.root
    assert.ok(quillRoot.innerHTML.includes('Hello world'), 'Quill should have initial content')

    const wrapperBefore = editor.el?.querySelector('.ql-container-target')
    assert.ok(wrapperBefore, 'container target should exist before prop change')

    // Simulate parent updating value prop (like onChange → editDescription change → prop update)
    editor.__geaUpdateProps({ value: '<p>Hello <strong>world</strong></p>' })
    await flush()

    // Without __onPropChange, __geaRequestRender re-renders the template,
    // replacing the DOM and orphaning the Quill instance
    const wrapperAfter = editor.el?.querySelector('.ql-container-target')
    assert.ok(wrapperAfter, 'container target exists after re-render')
    assert.notEqual(wrapperBefore, wrapperAfter, 'DOM should be replaced (re-rendered)')

    // The new .ql-container-target is a fresh empty div — Quill is no longer managing it
    const qlEditor = wrapperAfter!.querySelector('.ql-editor')
    assert.equal(qlEditor, null, 'new container has no Quill editor — Quill was destroyed by re-render')
  })

  it('component WITH __onPropChange preserves Quill DOM on prop updates', async () => {
    class SafeQuillEditor extends Component {
      quill: Quill | null = null

      __onPropChange() {}

      onAfterRender() {
        const container = this.el?.querySelector('.ql-container-target')
        if (!container || this.quill) return
        this.quill = new Quill(container as HTMLElement, {
          theme: 'snow',
          modules: { toolbar: false },
        })
        if (this.props.value) {
          this.quill.clipboard.dangerouslyPasteHTML(this.props.value)
        }
      }

      template() {
        return '<div class="quill-editor-wrapper"><div class="ql-container-target"></div></div>'
      }
    }

    const root = document.createElement('div')
    document.body.appendChild(root)

    const editor = new SafeQuillEditor({ value: '<p>Hello world</p>' })
    editor.render(root)
    await flush()

    assert.ok(editor.quill, 'Quill should initialize')
    const quillRoot = editor.quill!.root
    assert.ok(quillRoot.innerHTML.includes('Hello world'), 'Quill should have initial content')

    const wrapperBefore = editor.el?.querySelector('.ql-container-target')
    assert.ok(wrapperBefore, 'container target should exist before prop change')

    // Simulate parent updating value prop
    editor.__geaUpdateProps({ value: '<p>Hello <strong>world</strong></p>' })
    await flush()

    // With __onPropChange, DOM is preserved — Quill's managed DOM stays intact
    const wrapperAfter = editor.el?.querySelector('.ql-container-target')
    assert.equal(wrapperBefore, wrapperAfter, 'DOM should be the SAME reference (not re-rendered)')
    assert.ok(quillRoot.parentElement, 'Quill root should still be attached to DOM')
    assert.ok(quillRoot.innerHTML.includes('Hello world'), 'Quill content should be preserved')
  })

  it('Quill text-change fires onChange without destroying editor', async () => {
    const receivedHtml: string[] = []

    class SafeQuillEditor extends Component {
      quill: Quill | null = null
      _ignoreChange = false

      __onPropChange() {}

      onAfterRender() {
        const container = this.el?.querySelector('.ql-container-target')
        if (!container || this.quill) return
        this.quill = new Quill(container as HTMLElement, {
          theme: 'snow',
          modules: { toolbar: false },
        })
        if (this.props.value) {
          this._ignoreChange = true
          this.quill.clipboard.dangerouslyPasteHTML(this.props.value)
          this._ignoreChange = false
        }
        this.quill.on('text-change', () => {
          if (this._ignoreChange) return
          this.props.onChange?.(this.quill!.root.innerHTML)
        })
      }

      template() {
        return '<div class="quill-editor-wrapper"><div class="ql-container-target"></div></div>'
      }
    }

    const root = document.createElement('div')
    document.body.appendChild(root)

    const onChange = (html: string) => receivedHtml.push(html)
    const editor = new SafeQuillEditor({ value: '<p>Hello</p>', onChange })
    editor.render(root)
    await flush()

    assert.ok(editor.quill, 'Quill should initialize')
    assert.equal(receivedHtml.length, 0, 'no onChange during initial paste')

    // Simulate user typing via Quill API
    editor.quill!.insertText(5, ' world')
    await flush()

    assert.equal(receivedHtml.length, 1, 'onChange should fire once')
    assert.ok(receivedHtml[0].includes('world'), 'onChange should contain new text')

    // Now simulate parent updating the prop (as IssueDetails would do in its onDescriptionChange)
    editor.__geaUpdateProps({ value: receivedHtml[0], onChange })
    await flush()

    // Quill DOM should still be intact
    assert.ok(editor.quill!.root.parentElement, 'Quill root should still be in the DOM')
    assert.ok(editor.quill!.root.innerHTML.includes('world'), 'Quill content preserved after prop update')
  })
})
