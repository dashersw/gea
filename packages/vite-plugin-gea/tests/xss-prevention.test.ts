import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { transformComponentSource } from './regressions/plugin-helpers'

describe('XSS prevention: v2 uses DOM operations instead of string escaping', () => {
  it('wraps dynamic member expression with computation and .data = (safe text node)', () => {
    const output = transformComponentSource(`
      import { Component } from '@geajs/core'
      export default class App extends Component {
        name = 'world'
        template() {
          return <div>{this.name}</div>
        }
      }
    `)

    // v2 uses computation() with .data = for dynamic text — inherently XSS-safe
    assert.ok(
      output.includes('computation') && output.includes('.data'),
      'dynamic text expression should use computation() with .data = assignment, got: ' + output,
    )
  })

  it('wraps dynamic call expression with computation (safe DOM operation)', () => {
    const output = transformComponentSource(`
      import { Component } from '@geajs/core'
      export default class App extends Component {
        getName() { return '<script>xss</script>' }
        template() {
          return <div>{this.getName()}</div>
        }
      }
    `)

    // v2 uses computation with DOM-safe operations
    assert.ok(
      output.includes('computation') || output.includes('reactiveContent'),
      'dynamic call expression should use computation or reactiveContent',
    )
  })

  it('static string literals use createTextNode (safe at compile time)', () => {
    const output = transformComponentSource(`
      import { Component } from '@geajs/core'
      export default class App extends Component {
        template() {
          return <div>{"<script>alert('xss')</script>"}</div>
        }
      }
    `)

    // v2 uses createTextNode for static strings — inherently XSS-safe
    assert.ok(output.includes('createTextNode'), 'static string should use createTextNode (DOM-safe)')
    assert.ok(!output.includes('innerHTML'), 'static string should not use innerHTML')
  })
})

describe('XSS prevention: children prop uses mount (safe component mounting)', () => {
  it('text children prop passed through mount children getter', () => {
    const output = transformComponentSource(`
      import { Component } from '@geajs/core'
      import Child from './Child'

      export default class App extends Component {
        label = 'hello'
        template() {
          return <Child>{this.label}</Child>
        }
      }
    `)

    // v2 passes children via mount props — no innerHTML injection possible
    assert.ok(
      output.includes('mount(Child'),
      'children should be passed through mount, got: ' + output,
    )
    assert.ok(
      output.includes('children'),
      'children prop should appear in mount props',
    )
  })
})

describe('XSS prevention: dynamic URL attributes use reactiveAttr (safe DOM operations)', () => {
  it('dynamic href uses reactiveAttr', () => {
    const output = transformComponentSource(`
      import { Component } from '@geajs/core'
      export default class App extends Component {
        url = 'https://example.com'
        template() {
          return <a href={this.url}>Link</a>
        }
      }
    `)

    // v2 uses reactiveAttr for dynamic attributes — sets via DOM API
    assert.ok(output.includes('reactiveAttr'), 'dynamic href should use reactiveAttr, got: ' + output)
  })

  it('dynamic src uses reactiveAttr', () => {
    const output = transformComponentSource(`
      import { Component } from '@geajs/core'
      export default class App extends Component {
        imgSrc = '/photo.png'
        template() {
          return <img src={this.imgSrc} />
        }
      }
    `)

    assert.ok(output.includes('reactiveAttr'), 'dynamic src should use reactiveAttr, got: ' + output)
  })

  it('dynamic action uses reactiveAttr', () => {
    const output = transformComponentSource(`
      import { Component } from '@geajs/core'
      export default class App extends Component {
        formAction = '/submit'
        template() {
          return <form action={this.formAction}><button>Go</button></form>
        }
      }
    `)

    assert.ok(
      output.includes('reactiveAttr'),
      'dynamic action should use reactiveAttr, got: ' + output,
    )
  })

  it('non-URL attributes also use reactiveAttr for dynamic values', () => {
    const output = transformComponentSource(`
      import { Component } from '@geajs/core'
      export default class App extends Component {
        cls = 'active'
        template() {
          return <div class={this.cls}>Hello</div>
        }
      }
    `)

    // v2 uses reactiveAttr for all dynamic attributes
    assert.ok(output.includes('reactiveAttr'), 'dynamic class should use reactiveAttr')
  })
})

describe('XSS prevention: dangerouslySetInnerHTML', () => {
  it('dangerouslySetInnerHTML uses reactiveAttr in v2', () => {
    const output = transformComponentSource(`
      import { Component } from '@geajs/core'
      export default class App extends Component {
        htmlContent = '<strong>bold</strong>'
        template() {
          return <div dangerouslySetInnerHTML={this.htmlContent} />
        }
      }
    `)

    // v2 passes dangerouslySetInnerHTML through reactiveAttr — runtime handles it
    assert.ok(
      output.includes('reactiveAttr') && output.includes('dangerouslySetInnerHTML'),
      'dangerouslySetInnerHTML should use reactiveAttr in v2',
    )
  })
})

describe('XSS prevention: destructured children prop is safe in v2', () => {
  it('destructured {children} is passed via __props (safe DOM operation)', () => {
    const output = transformComponentSource(`
      import { Component } from '@geajs/core'

      export default class Layout extends Component {
        template({ children }) {
          return (
            <main>
              <div class="content">{children}</div>
            </main>
          )
        }
      }
    `)

    // v2 uses reactiveContent with __props.children — safe DOM operation
    assert.ok(
      output.includes('__props.children') || output.includes('__props'),
      'children should reference __props, got: ' + output,
    )
    assert.ok(
      !output.includes('geaEscapeHtml'),
      'v2 does not use geaEscapeHtml — uses DOM operations instead',
    )
  })
})
