# JSX Syntax

Gea uses JSX that is close to standard HTML. The Vite plugin transforms it into HTML template strings at build time — there is no `createElement` or virtual DOM at runtime.

## Attributes

| Gea | HTML equivalent | Notes |
| --- | --- | --- |
| `class="foo"` | `class="foo"` | Use `class`, not `className` |
| `` class={`btn ${active ? 'on' : ''}`} `` | Dynamic class | Template literal for dynamic classes |
| `value={text}` | `value="..."` | For input elements |
| `checked={bool}` | `checked` | For checkboxes |
| `disabled={bool}` | `disabled` | For buttons/inputs |
| `aria-label="Close"` | `aria-label="Close"` | ARIA attributes pass through |

## Event Attributes

Both native-style (`click`, `change`) and React-style (`onClick`, `onChange`) event attribute names are supported. Native-style is preferred by convention.

```jsx
<button click={handleClick}>Click</button>
<input input={handleInput} />
<input change={handleChange} />
<input keydown={handleKeyDown} />
<input blur={handleBlur} />
<input focus={handleFocus} />
<span dblclick={handleDoubleClick}>Text</span>
```

Supported events: `click`, `dblclick`, `input`, `change`, `keydown`, `keyup`, `blur`, `focus`, `mousedown`, `mouseup`, `submit`, `dragstart`, `dragend`, `dragover`, `dragleave`, `drop`.

With `@geajs/mobile`: `tap`, `longTap`, `swipeRight`, `swipeUp`, `swipeLeft`, `swipeDown`.

Event handlers receive the native DOM event:

```jsx
const handleInput = e => {
  store.setName(e.target.value)
}
```

## Differences from React

| Feature | Gea | React |
| --- | --- | --- |
| CSS classes | `class="foo"` | `className="foo"` |
| Event handlers | `click={fn}` or `onClick={fn}` | `onClick={fn}` |
| Input events | `input={fn}` or `onInput={fn}` | `onChange={fn}` |
| Keyboard events | `keydown={fn}` or `onKeyDown={fn}` | `onKeyDown={fn}` |
| Checked inputs | `checked={bool}` + `change={fn}` | `checked={bool}` + `onChange={fn}` |

## Text Interpolation

Use curly braces for dynamic content:

```jsx
<span>{count}</span>
<span>{user.name}</span>
<span>{activeCount} {activeCount === 1 ? 'item' : 'items'} left</span>
```

## Style Objects

Gea supports inline style objects with camelCase property names, like React:

```jsx
// Static — compiled to a CSS string at build time
<div style={{ backgroundColor: 'red', fontSize: '14px', fontWeight: 'bold' }}>
  Styled content
</div>

// Dynamic — converted to cssText at runtime
<div style={{ color: this.textColor, opacity: this.isVisible ? 1 : 0 }}>
  Dynamic styling
</div>
```

String styles are also supported and passed through as-is:

```jsx
<div style="color:red">Static string</div>
<div style={`width:${size}px`}>Dynamic string</div>
```

Property names use camelCase: `backgroundColor` → `background-color`, `fontSize` → `font-size`.

## `ref` Attribute

Use `ref` to get a direct reference to a DOM element after render:

```jsx
export default class Canvas extends Component {
  canvasEl = null

  template() {
    return (
      <div class="wrapper">
        <canvas ref={this.canvasEl} width="800" height="600"></canvas>
      </div>
    )
  }

  onAfterRender() {
    const ctx = this.canvasEl.getContext('2d')
    ctx.fillRect(0, 0, 100, 100)
  }
}
```

The compiler generates a setup method that assigns the DOM element to the specified property after each render. Multiple refs are supported. For the component's root element, use `this.el` instead.

## Component Tags

Components are referenced by their import name in PascalCase. The Vite plugin converts them to kebab-case custom elements internally and passes props via `data-prop-*` attributes.

```jsx
import TodoItem from './todo-item'

<TodoItem todo={todo} onToggle={() => store.toggle(todo.id)} />
```

Single-word component names (e.g., `Link`, `Label`) are automatically prefixed with `gea-` to produce valid custom element tag names (e.g., `gea-link`, `gea-label`). Multi-word PascalCase names naturally contain a hyphen when converted to kebab-case (e.g., `TodoItem` becomes `todo-item`) and are used as-is. This is handled transparently — you always use the PascalCase import name in JSX.

## Type Safety

Gea provides full JSX type-checking via TypeScript's `jsxImportSource` mechanism. This means prop autocompletion, type errors on invalid attributes, and hover-to-inspect types work out of the box in any TypeScript-aware editor — VS Code, Cursor, Vim, Zed, etc. No framework-specific editor plugin is needed.

The type system understands:

- All standard HTML elements and their attributes (inherited from `@types/react`)
- Gea-specific attributes: `class` (instead of `className`), `for` (on `<label>`)
- Short event names: `click`, `input`, `change`, `keydown`, etc.
- Component props declared with `declare props` on class components (optionally typed inside `template()` via `: this['props']` for full end-to-end type safety) or parameter types on function components

To enable type-checking, your `tsconfig.json` needs:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@geajs/core"
  }
}
```

Projects scaffolded with `create-gea` have this configured automatically.

## Unsupported Patterns

The compiler throws clear errors at build time for these patterns:

| Pattern | Fix |
| --- | --- |
| `<div {...props} />` | Destructure and pass props individually |
| Dynamic tag names | Use conditional rendering instead |
| `{() => <div />}` (function as child) | Use named render prop attributes |
| `export function Foo() { return <div /> }` | Use `export default function` |
| Fragments as `.map()` item roots | Wrap in a single root element |
