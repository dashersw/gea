import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { transformComponentSource } from './regressions/plugin-helpers'

describe('XSS prevention: dynamic text expression escaping', () => {
  it('wraps dynamic member expression with geaEscapeHtml', () => {
    const output = transformComponentSource(`
      import { Component } from '@geajs/core'
      export default class App extends Component {
        name = 'world'
        template() {
          return <div>{this.name}</div>
        }
      }
    `)

    assert.ok(
      output.includes('geaEscapeHtml'),
      'dynamic text expression should be wrapped with geaEscapeHtml, got: ' + output,
    )
  })

  it('wraps dynamic call expression with geaEscapeHtml', () => {
    const output = transformComponentSource(`
      import { Component } from '@geajs/core'
      export default class App extends Component {
        getName() { return '<script>xss</script>' }
        template() {
          return <div>{this.getName()}</div>
        }
      }
    `)

    assert.ok(output.includes('geaEscapeHtml'), 'dynamic call expression should be wrapped with geaEscapeHtml')
  })

  it('does NOT escape static string literals (already escaped at compile time)', () => {
    const output = transformComponentSource(`
      import { Component } from '@geajs/core'
      export default class App extends Component {
        template() {
          return <div>{"<script>alert('xss')</script>"}</div>
        }
      }
    `)

    // Static strings are escaped at compile time, no runtime geaEscapeHtml needed
    assert.ok(output.includes('&lt;script&gt;'), 'static string should be HTML-escaped at compile time')
  })
})

describe('XSS prevention: children prop text values are escaped', () => {
  it('wraps text children prop value with geaEscapeHtml so innerHTML is safe', () => {
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

    // The text expression this.label should be wrapped with geaEscapeHtml
    // so even if children uses innerHTML, the value is already escaped
    assert.ok(
      output.includes('geaEscapeHtml'),
      'text expression in children should be wrapped with geaEscapeHtml, got: ' + output,
    )
  })
})

describe('XSS prevention: dangerous URL protocols sanitized', () => {
  it('wraps dynamic href with geaSanitizeAttr', () => {
    const output = transformComponentSource(`
      import { Component } from '@geajs/core'
      export default class App extends Component {
        url = 'https://example.com'
        template() {
          return <a href={this.url}>Link</a>
        }
      }
    `)

    assert.ok(output.includes('geaSanitizeAttr'), 'dynamic href should be wrapped with geaSanitizeAttr, got: ' + output)
  })

  it('wraps dynamic src with geaSanitizeAttr', () => {
    const output = transformComponentSource(`
      import { Component } from '@geajs/core'
      export default class App extends Component {
        imgSrc = '/photo.png'
        template() {
          return <img src={this.imgSrc} />
        }
      }
    `)

    assert.ok(output.includes('geaSanitizeAttr'), 'dynamic src should be wrapped with geaSanitizeAttr, got: ' + output)
  })

  it('wraps dynamic action with geaSanitizeAttr', () => {
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
      output.includes('geaSanitizeAttr'),
      'dynamic action should be wrapped with geaSanitizeAttr, got: ' + output,
    )
  })

  it('does NOT wrap non-URL attributes with geaSanitizeAttr', () => {
    const output = transformComponentSource(`
      import { Component } from '@geajs/core'
      export default class App extends Component {
        cls = 'active'
        template() {
          return <div class={this.cls}>Hello</div>
        }
      }
    `)

    // Compiler may import geaSanitizeAttr for other code paths; class must not *use* it.
    assert.doesNotMatch(
      output,
      /geaSanitizeAttr\(\s*this\.cls\b/,
      'non-URL class binding should NOT be passed through geaSanitizeAttr',
    )
  })
})

describe('XSS prevention: dangerouslySetInnerHTML', () => {
  it('renders raw HTML without escaping when dangerouslySetInnerHTML is used', () => {
    const output = transformComponentSource(`
      import { Component } from '@geajs/core'
      export default class App extends Component {
        htmlContent = '<strong>bold</strong>'
        template() {
          return <div dangerouslySetInnerHTML={this.htmlContent} />
        }
      }
    `)

    // The expression should NOT be wrapped with geaEscapeHtml
    assert.ok(
      !output.includes('geaEscapeHtml') || !output.includes('dangerouslySetInnerHTML'),
      'dangerouslySetInnerHTML content should not be escaped',
    )
    // Should not render dangerouslySetInnerHTML as a DOM attribute
    assert.ok(
      !output.includes('dangerouslySetInnerHTML='),
      'dangerouslySetInnerHTML should not appear as a DOM attribute in output, got: ' + output,
    )
  })
})

describe('XSS prevention: destructured children prop is not double-escaped', () => {
  it('does not wrap destructured {children} with geaEscapeHtml in template', () => {
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

    // children contains HTML from the parent component — must not be escaped
    assert.ok(
      !output.includes('geaEscapeHtml(String(children))'),
      'destructured children prop must not be wrapped with geaEscapeHtml, got: ' + output,
    )
    assert.ok(
      output.includes('${children}') || output.includes('${children ||'),
      'children should be interpolated directly in the template',
    )
  })
})
