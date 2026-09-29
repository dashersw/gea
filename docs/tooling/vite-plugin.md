# Vite Plugin

`@geajs/vite-plugin` is the build-time engine that powers Gea's compile-time JSX transforms. It runs as a Vite plugin with `enforce: 'pre'`, processing your `.jsx` and `.tsx` files before other plugins.

## Installation

```bash
npm install -D @geajs/vite-plugin
```

Requires `vite` ^7.3.1 as a peer dependency.

## Configuration

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { geaPlugin } from '@geajs/vite-plugin'

export default defineConfig({
  plugins: [geaPlugin()]
})
```

No options are needed. The plugin handles everything automatically.

### `strict`

Some JSX compiles to code that renders nothing or misbehaves:

- a spread on a component tag, like `<Child {...props} />`
- a component-cased tag that holds a string, like `const Tag = 'section'` with `<Tag />`
- a callback ref, or a ref to a local the compiler inlines
- a class `template()` that doesn't return a single JSX element or fragment
- an `on…Capture` event handler
- a component class declared inside a function

By default, each one is a warning in the `vite` terminal and in the `vite build` output. The warning gives the file, line and column, and a hint on what to write instead. The code compiles as it did before these checks, so existing projects keep building.

Set `strict` to fail the build on them instead:

```ts
geaPlugin({ strict: true })
```

## What It Does

### JSX to HTML String Compilation

JSX in your components is transformed into HTML template strings at build time. There is no `createElement` at runtime — templates compile to plain strings.

- `className` is converted to `class`
- Both native-style (`click`) and React-style (`onClick`) event names are accepted
- Component tags become kebab-case custom elements with `data-prop-*` attributes

### Reactive Binding Generation

The plugin analyzes which state paths your template reads and generates `observe()` calls that surgically update only the specific DOM nodes that depend on changed state. This is what eliminates the need for virtual DOM diffing.

For example, if your template reads `counterStore.count`, the plugin generates an observer on the `count` path that updates only the text node displaying that value.

### Event Delegation Wiring

Event handlers in JSX (`click={fn}`, `input={fn}`, etc.) are compiled into an `events` getter that uses event delegation — a single global listener per event type on `document.body`, rather than listeners on each element.

### Function-to-Class Conversion

Function components are automatically converted to class components:

```jsx
// Input: function component
export default function Greeting({ name }) {
  return <h1>Hello, {name}!</h1>
}

// Output: class component (conceptually)
class Greeting extends Component {
  template({ name }) {
    return /* compiled template */
  }
}
```

### Conditional and List Compilation

- `{cond && <X />}` compiles into `<template>` markers with swap logic
- `.map()` with `key` props compiles into `applyListChanges` calls for efficient list updates

### Hot Module Replacement

The plugin injects HMR code that:

- Registers component instances at creation
- Unregisters them on disposal
- Updates instances with new prototypes when you edit a file
- Preserves component state across edits

### TypeScript Integration

Gea provides JSX type-checking via TypeScript's `jsxImportSource` mechanism. When your `tsconfig.json` includes `"jsx": "react-jsx"` and `"jsxImportSource": "@geajs/core"`, editors get full prop autocompletion, type errors on invalid attributes, and hover types — without any framework-specific plugin.

The plugin also adds `gea-env.d.ts` to the `compilerOptions.types` array for additional type support.

### Virtual Module

The plugin provides `virtual:gea-reconcile` — an internal module used for keyed list reconciliation.
