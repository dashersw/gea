import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from '@babel/parser'
import { generate } from '../../src/utils/babel-interop.ts'
import { walkJsxToTemplate, findTemplateMethod, extractTemplateJsx } from '../../src/closure-codegen/generator.ts'
import { emitTemplateDecl } from '../../src/closure-codegen/emit.ts'
import { emitCreateTemplateMethod, nextTemplateName, resetTemplateCounter } from './emit-helper.ts'

function parseTs(code: string) {
  return parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
}

function generateDecls(decls: ReturnType<typeof emitTemplateDecl>): string {
  return decls.map((decl) => generate(decl).code).join('\n')
}

describe('generator: walk JSX to template', () => {
  it('static div → bare HTML, no slots', () => {
    const ast = parseTs(`const _ = <div>Hello World</div>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    assert.equal(spec.html, '<div>Hello World')
    assert.equal(spec.slots.length, 0)
  })

  it('div with one reactive expression → marker comment + text slot', () => {
    const ast = parseTs(`const _ = <div>Hello {this.name}</div>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    assert.equal(spec.html, '<div>Hello <!--0-->')
    assert.equal(spec.slots.length, 1)
    assert.equal(spec.slots[0].kind, 'text')
    assert.deepEqual(spec.slots[0].walk, [1])
  })

  it('nested elements with two reactive texts get distinct slot walks', () => {
    const ast = parseTs(`const _ = <div><span>{this.a}</span><span>{this.b}</span></div>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    // Each <span> has a single text slot, so the generator uses the direct-
    // text optimization: emits a text-node placeholder ('0') inline rather
    // than a `<!--N-->` comment, and marks the slot `directText: true`.
    assert.equal(spec.html, '<div><span>0</span><span>0')
    assert.equal(spec.slots.length, 2)
    assert.deepEqual(spec.slots[0].walk, [0, 0])
    assert.deepEqual(spec.slots[1].walk, [1, 0])
    assert.equal(spec.slots[0].directText, true)
    assert.equal(spec.slots[1].directText, true)
  })

  it('static attributes baked into template', () => {
    const ast = parseTs(`const _ = <div class="foo" id="bar">hi</div>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    assert.equal(spec.html, '<div class=foo id=bar>hi')
    assert.equal(spec.slots.length, 0)
  })

  it('reactive attribute records a slot, not baked into HTML', () => {
    const ast = parseTs(`const _ = <div id={this.id}>hi</div>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    assert.equal(spec.html, '<div>hi')
    assert.equal(spec.slots.length, 1)
    assert.equal(spec.slots[0].kind, 'attr')
    assert.equal(spec.slots[0].payload.attrName, 'id')
  })

  it('event handler onClick produces event slot', () => {
    const ast = parseTs(`const _ = <button onClick={() => this.count++}>+</button>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    assert.equal(spec.html, '<button>+')
    assert.equal(spec.slots.length, 1)
    assert.equal(spec.slots[0].kind, 'event')
  })
})

describe('generator: findTemplateMethod + extractTemplateJsx', () => {
  it('finds template() on Component subclass', () => {
    const ast = parseTs(`
      class App {
        template() { return <div>Hello</div> }
      }
    `)
    const classDecl = ast.program.body[0] as any
    const method = findTemplateMethod(classDecl)
    assert.ok(method)
    const jsx = extractTemplateJsx(method!)
    assert.ok(jsx)
    assert.equal((jsx as any).openingElement.name.name, 'div')
  })

  it('returns null if no template method', () => {
    const ast = parseTs(`class App { foo() {} }`)
    const classDecl = ast.program.body[0] as any
    assert.equal(findTemplateMethod(classDecl), null)
  })
})

describe('generator: end-to-end emit for hello-world', () => {
  it('hello-world emits template + clone method', () => {
    resetTemplateCounter()
    const ast = parseTs(`const _ = <div>Hello World</div>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    const tplName = nextTemplateName()
    const decls = emitTemplateDecl(spec.html, tplName)
    const { method, importsNeeded } = emitCreateTemplateMethod(spec, tplName)

    const declCode = generateDecls(decls)
    const methodCode = generate(method).code

    // Tiny static text elements skip the template/cache path.
    assert.match(declCode, /function _tpl0_create\(\)/)
    assert.match(declCode, /document\.createElement\("div"\)/)
    assert.match(declCode, /e\.textContent = "Hello World"/)
    assert.doesNotMatch(declCode, /document\.createElement\("template"\)/)
    assert.doesNotMatch(declCode, /\(\(\) =>/)

    // Method code should create + return root (no slots to wire)
    assert.match(methodCode, /GEA_CREATE_TEMPLATE/)
    assert.match(methodCode, /const root = _tpl0_create\(\)/)
    assert.match(methodCode, /return root/)
    assert.equal(importsNeeded.size, 0)
  })

  it('standalone svg child templates are parsed in the svg namespace', () => {
    const code = generateDecls(emitTemplateDecl('<path d="M0 0" fill="currentColor"></path>', '_tplSvg'))

    assert.match(code, /function _tplSvg_create\(\)/)
    assert.match(code, /document\.createElementNS\("http:\/\/www\.w3\.org\/2000\/svg", "svg"\)/)
    assert.match(code, /s\.innerHTML = "<path/)
    assert.match(code, /t\.content\.appendChild\(s\.firstChild\)/)
    assert.match(code, /return t\.content\.firstChild/)
  })

  it('reactive text emits scalar text helper with static path', () => {
    resetTemplateCounter()
    const ast = parseTs(`const _ = <div>Hello {this.name}</div>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    const tplName = nextTemplateName()
    const { method, importsNeeded } = emitCreateTemplateMethod(spec, tplName)

    const code = generate(method).code
    assert.match(code, /marker0 = root\.childNodes\[1\]/)
    assert.match(code, /document\.createTextNode\(""\)/)
    assert.match(code, /marker0\.replaceWith\(t0\)/)
    assert.match(code, /reactiveTextValue\(t0, d, this, \["name"\]\)/)
    assert.ok(importsNeeded.has('reactiveTextValue'))
  })

  it('reactive text with computed expression uses getter', () => {
    resetTemplateCounter()
    // The expression `this.a + this.b` is not a pure member chain → dynamic
    const ast = parseTs(`const _ = <div>{this.a + this.b}</div>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    const tplName = nextTemplateName()
    const { method } = emitCreateTemplateMethod(spec, tplName)
    const code = generate(method).code
    assert.match(code, /reactiveTextValue\(t0, d, this, \(\) => this\.a \+ this\.b\)/)
  })

  it('event handler emits root-delegated delegateEvent', () => {
    resetTemplateCounter()
    const ast = parseTs(`const _ = <button onClick={() => this.count++}>+</button>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    const tplName = nextTemplateName()
    const { method } = emitCreateTemplateMethod(spec, tplName)
    const code = generate(method).code
    assert.match(code, /delegateEvent\(root, "click", \[\[evt\d+, h\d+, false\]\], d\)/)
  })

  it('event handler that reads currentTarget keeps currentTarget shadowing', () => {
    resetTemplateCounter()
    const ast = parseTs(`const _ = <button onClick={(event) => event.currentTarget.classList.add("x")}>+</button>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    const tplName = nextTemplateName()
    const { method } = emitCreateTemplateMethod(spec, tplName)
    const code = generate(method).code
    assert.match(code, /delegateEvent\(root, "click", \[\[evt\d+, h\d+\]\], d\)/)
  })

  it('class={...} emits reactiveClass', () => {
    resetTemplateCounter()
    const ast = parseTs(`const _ = <div class={this.classes}>x</div>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    assert.equal(spec.slots[0].kind, 'class')
    const tplName = nextTemplateName()
    const { method, importsNeeded } = emitCreateTemplateMethod(spec, tplName)
    const code = generate(method).code
    assert.match(code, /reactiveClass\(el0, d, this, \["classes"\]\)/)
    assert.ok(importsNeeded.has('reactiveClass'))
  })

  it('conditional class with literal branches does not force always-tracking', () => {
    resetTemplateCounter()
    const ast = parseTs(`const _ = <div class={this.selected === this.id ? "active" : ""}>x</div>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    const tplName = nextTemplateName()
    const { method, importsNeeded } = emitCreateTemplateMethod(spec, tplName)
    const code = generate(method).code

    assert.match(code, /reactiveClassName\(el0, d, this, \(\) => this\.selected === this\.id \? "active" : ""\)/)
    assert.ok(importsNeeded.has('reactiveClassName'))
    assert.doesNotMatch(code, /void/)
  })

  it('style={...} emits reactiveStyle', () => {
    resetTemplateCounter()
    const ast = parseTs(`const _ = <div style={this.styles}>x</div>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    assert.equal(spec.slots[0].kind, 'style')
    const tplName = nextTemplateName()
    const { method, importsNeeded } = emitCreateTemplateMethod(spec, tplName)
    const code = generate(method).code
    assert.match(code, /reactiveStyle\(el0, d, this, \["styles"\]\)/)
    assert.ok(importsNeeded.has('reactiveStyle'))
  })

  it('disabled={...} emits attr-only reactiveBool helper', () => {
    resetTemplateCounter()
    const ast = parseTs(`const _ = <button disabled={this.busy}>x</button>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    assert.equal(spec.slots[0].kind, 'bool')
    const tplName = nextTemplateName()
    const { method, importsNeeded } = emitCreateTemplateMethod(spec, tplName)
    const code = generate(method).code
    assert.match(code, /reactiveBoolAttr\(el0, d, this, "disabled", \["busy"\]\)/)
    assert.ok(importsNeeded.has('reactiveBoolAttr'))
  })

  it('short-circuit boolean bindings eagerly read skipped deps before locking', () => {
    resetTemplateCounter()
    const ast = parseTs(`const _ = <button disabled={this.name.length > 1 && this.card.valid}>Pay</button>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    const tplName = nextTemplateName()
    const { method } = emitCreateTemplateMethod(spec, tplName)
    const code = generate(method).code

    assert.match(
      code,
      /reactiveBoolAttr\(el0, d, this, "disabled", \(\) => \(void this\.card, this\.name\.length > 1 && this\.card\.valid\)\)/,
    )
  })

  it('visible={...} emits reactiveBool in visible mode', () => {
    resetTemplateCounter()
    const ast = parseTs(`const _ = <div visible={this.show}>x</div>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    assert.equal(spec.slots[0].kind, 'bool')
    assert.equal(spec.slots[0].payload.attrName, 'visible')
    const tplName = nextTemplateName()
    const { method } = emitCreateTemplateMethod(spec, tplName)
    const code = generate(method).code
    assert.match(code, /reactiveBool\(el0, d, this, "display", \["show"\], "visible"\)/)
  })

  it('value={...} on input emits one-way reactiveValue helper', () => {
    resetTemplateCounter()
    const ast = parseTs(`const _ = <input value={this.name}/>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    assert.equal(spec.slots[0].kind, 'value')
    const tplName = nextTemplateName()
    const { method, importsNeeded } = emitCreateTemplateMethod(spec, tplName)
    const code = generate(method).code
    assert.match(code, /reactiveValueRead\(el0, d, this, \["name"\]\)/)
    assert.ok(importsNeeded.has('reactiveValueRead'))
  })

  it('value+input folds post-input value reconciliation into the delegated handler', () => {
    resetTemplateCounter()
    const ast = parseTs(`const _ = <input value={this.card} input={(e) => { this.card = e.target.value.trim() }}/>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    const tplName = nextTemplateName()
    const { method } = emitCreateTemplateMethod(spec, tplName)
    const code = generate(method).code

    assert.match(code, /reactiveValueRead\(el\d+, d, this, \["card"\]\)/)
    assert.match(
      code,
      /const h\d+ = e => \{[\s\S]*const __v = this\.card;[\s\S]*if \(evt\d+\.value !== __s\)[\s\S]*evt\d+\.value = __s/,
    )
    assert.doesNotMatch(code, /reactiveValue\(el\d+, d, this, \["card"\], undefined, true\)/)
  })
})

describe('generator: structural slots (conditional, list, mount)', () => {
  it('ternary JSX expression → conditional slot', () => {
    resetTemplateCounter()
    const ast = parseTs(`const _ = <div>{this.ok ? <span>y</span> : <em>n</em>}</div>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    assert.equal(spec.slots.length, 1)
    assert.equal(spec.slots[0].kind, 'conditional')
    const tplName = nextTemplateName()
    const { method, importsNeeded } = emitCreateTemplateMethod(spec, tplName)
    const code = generate(method).code
    assert.match(code, /conditional\(/)
    assert.match(code, /anchor0\.parentNode/)
    assert.ok(importsNeeded.has('conditional'))
  })

  it('&& JSX → conditional slot with null mkFalse', () => {
    resetTemplateCounter()
    const ast = parseTs(`const _ = <div>{this.show && <span>x</span>}</div>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    assert.equal(spec.slots[0].kind, 'conditional')
    const tplName = nextTemplateName()
    const { method, importsNeeded } = emitCreateTemplateMethod(spec, tplName)
    const code = generate(method).code
    assert.match(code, /conditionalTruthy\(/)
    assert.ok(importsNeeded.has('conditionalTruthy'))
  })

  it('items.map(...) → keyed-list slot', () => {
    resetTemplateCounter()
    const ast = parseTs(`const _ = <ul>{this.items.map(item => <li>{item.name}</li>)}</ul>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    assert.equal(spec.slots[0].kind, 'keyed-list')
    const tplName = nextTemplateName()
    const { method, importsNeeded } = emitCreateTemplateMethod(spec, tplName)
    const code = generate(method).code
    assert.match(code, /\b__kl_reconcile\s*=/)
    assert.match(code, /const __kl_container = parent0/)
    assert.doesNotMatch(code, /keyedListProp\(/)
    assert.match(code, /item\?\.id \?\? item \?\? idx/)
    assert.ok(importsNeeded.has('GEA_DIRTY'))
  })

  it('<MyChild /> → mount slot', () => {
    resetTemplateCounter()
    const ast = parseTs(`const _ = <div><MyChild name="a"/></div>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const spec = walkJsxToTemplate(expr)
    assert.equal(spec.slots[0].kind, 'mount')
    const tplName = nextTemplateName()
    const { method, importsNeeded } = emitCreateTemplateMethod(spec, tplName)
    const code = generate(method).code
    assert.match(code, /mount\(MyChild, anchor0\.parentNode,/)
    // Props are wrapped in thunks — `name: () => "a"`
    assert.match(code, /name: \(\) => "a"/)
    assert.ok(importsNeeded.has('mount'))
  })
})

describe('generator: recursive lowering via EmitContext', () => {
  it('conditional branch with nested JSX hoists a nested template', async () => {
    const { createEmitContext, buildCreateTemplateMethod } = await import('../../src/closure-codegen/emit.ts')
    const ast = parseTs(`const _ = <div>{this.show ? <span>yes</span> : <em>no</em>}</div>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const ctx = createEmitContext()
    const method = buildCreateTemplateMethod(expr, ctx)
    // Parent template keeps the template/cache path; tiny nested branches use
    // direct createElement factories.
    assert.equal(ctx.templateDecls.length, 4)
    const declsCode = ctx.templateDecls.map((d) => generate(d).code).join('\n')
    assert.match(declsCode, /_tpl0/)
    assert.match(declsCode, /_tpl1/)
    assert.match(declsCode, /_tpl2/)
    assert.match(declsCode, /let _tpl0_root = null/)
    assert.match(declsCode, /function _tpl0_create\(\)/)
    assert.match(declsCode, /document\.createElement\("span"\)/)
    assert.match(declsCode, /e\.textContent = "yes"/)
    assert.match(declsCode, /document\.createElement\("em"\)/)
    assert.match(declsCode, /e\.textContent = "no"/)
    const methodCode = generate(method).code
    // Tiny branch functions create their element directly.
    assert.match(methodCode, /d => \{[\s\S]*const root = _tpl1_create\(\)[\s\S]*return root;?\s*\}/)
    assert.match(methodCode, /d => \{[\s\S]*const root = _tpl2_create\(\)[\s\S]*return root;?\s*\}/)
  })

  it('items.map with JSX body hoists a nested template for the item', async () => {
    const { createEmitContext, buildCreateTemplateMethod } = await import('../../src/closure-codegen/emit.ts')
    const ast = parseTs(`const _ = <ul>{this.items.map(item => <li>{item.name}</li>)}</ul>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const ctx = createEmitContext()
    const method = buildCreateTemplateMethod(expr, ctx)
    // Parent template + one list-item template; both are tiny factories.
    assert.equal(ctx.templateDecls.length, 2)
    const declsCode = ctx.templateDecls.map((d) => generate(d).code).join('\n')
    // The terminal list uses the parent element directly, so <ul> no longer
    // needs a comment anchor. <li>'s single `{item.name}` child keeps the
    // direct-text placeholder ('0').
    assert.match(declsCode, /document\.createElement\("ul"\)/)
    assert.match(declsCode, /document\.createElement\("li"\)/)
    assert.match(declsCode, /e\.textContent = "0"/)
    assert.doesNotMatch(declsCode, /__rq_L0 = new Map\(\)/)
    const methodCode = generate(method).code
    // createItem should create the tiny _tpl1 element directly; item.name is
    // extracted into patchRow as a direct-DOM write. createItem is hoisted as a
    // named local (`__ki_L0`) before passing
    // specialized `createEntry` / `patchEntry` closures to the inline prop list.
    assert.match(methodCode, /__ki_L0 = \(item, idx, d\) => \{[\s\S]*const root = _tpl1_create\(\)/)
    // Walk emission (element-chain temporarily disabled while isolating a
    // saas-dashboard-jsdom OOM regression — emit.ts forces firstChild /
    // childNodes[n] fallback). childNodes[0] is rewritten to `.firstChild`
    // (faster getter; no live-NodeList allocation). Currently: directText
    // text slot on `<li>{item.name}</li>` walks `root.firstChild`.
    assert.match(methodCode, /const __n = root\.firstChild/)
    // Scalar-only text write: compiler now emits `__n.nodeValue = ${item.X ?? ''}`
    // directly — the `__v && __v.nodeType` branch is gone (item-rooted text
    // slots are assumed scalar; Node-typed slots should use `mount()`). Saves
    // ~100ns per write on create AND update paths.
    assert.match(methodCode, /__n\.nodeValue = `\$\{item\.name \?\? ""\}`/)
    // patchRow hoisted as `__kp_L0` — lazy-cached walk:
    assert.match(
      methodCode,
      /__kp_L0 = \(el, item\) => \{[\s\S]*const __n = el\.__r0 \|\| \(el\.__r0 = el\.firstChild\)/,
    )
  })

  it('hello-world end-to-end via EmitContext', async () => {
    const { createEmitContext, buildCreateTemplateMethod } = await import('../../src/closure-codegen/emit.ts')
    const ast = parseTs(`const _ = <div>Hello World</div>`)
    const expr = (ast.program.body[0] as any).declarations[0].init
    const ctx = createEmitContext()
    const method = buildCreateTemplateMethod(expr, ctx)
    // Tiny static text element emits only a direct creator function.
    assert.equal(ctx.templateDecls.length, 1)
    const methodCode = generate(method).code
    assert.match(methodCode, /const root = _tpl0_create\(\)/)
    assert.match(methodCode, /return root/)
    assert.equal(ctx.importsNeeded.size, 0)
  })
})
