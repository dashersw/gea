# Gea Tools

Language support for the modern Gea JSX API.

The extension is focused on code intelligence, not custom syntax highlighting. It understands Gea components written as:

- class components with `template(props)` returning JSX
- function components returning JSX
- props declared by parameter destructuring or `const { ... } = props`

## Features

- Component completion inside JSX tags
- Prop completion based on the target component's declared props
- Event attribute completion for Gea JSX events like `click`, `input`, `change`, and `keydown`
- Go to Definition for imported or workspace-discovered JSX components
- Quick Fix auto-imports for unknown default-exported JSX components
- Hover details for components, props, and event attributes
- Unknown component warnings for JSX tags that look like Gea components
- TypeScript plugin support for suppressing noisy JSX diagnostics and unused-import warnings for imported components used as JSX tags

## Installation

### From Source

1. Clone this repository.
2. Navigate to `packages/gea-tools`.
3. Install dependencies:

```bash
npm install
```

4. Compile the extension:

```bash
npm run compile
```

5. Open the extension folder in VS Code or Cursor.
6. Press `F5` to launch an Extension Development Host.

### From Marketplace

Not published yet.

## Usage

The extension activates for:

- `javascript`
- `typescript`
- `javascriptreact`
- `typescriptreact`

### Component Completion

Start typing a JSX tag:

```jsx
<TodoI
```

The extension suggests discovered workspace components plus built-in Gea Mobile tags:

- `view`
- `sidebar`
- `tab-view`
- `navbar`
- `pull-to-refresh`
- `infinite-scroll`

### Prop Completion

Prop completion is driven by component signatures.

Class component example:

```jsx
export default class TodoItem extends Component {
  template({ todo, onToggle, onRemove }) {
    return <li />
  }
}
```

Function component example:

```jsx
export default function TodoFilters({ filter, activeCount, completedCount, onFilter }) {
  return <div />
}
```

`props` destructuring in the function body is also supported:

```jsx
export default function PaymentForm(props) {
  const { passengerName, onPay } = props
  return <div />
}
```

### Go to Definition

Place the cursor on a JSX component tag such as `<TodoItem />` and run Go to Definition to jump to the component declaration. The language server resolves both already-imported components and matching default-exported workspace components.

### Quick Fix Auto Import

If you reference a default-exported component before importing it, Gea Tools offers a Quick Fix to add the missing relative import. When multiple components share the same name, the closest matching file path is preferred.

### Event Completion

Inside JSX tags, the extension suggests Gea event attributes such as:

- `click`
- `input`
- `change`
- `keydown`
- `blur`
- `submit`

### Example

```jsx
import { Component } from '@geajs/core'
import todoStore from './todo-store'
import TodoItem from './components/TodoItem'

export default class TodoApp extends Component {
  template() {
    return (
      <div class="todo-app">
        <TodoItem todo={todoStore.todos[0]} onToggle={() => {}} onRemove={() => {}} />
      </div>
    )
  }
}
```

## Configuration

Language server features can be disabled with:

```json
{
  "gea.languageServer.enable": true
}
```

## Development Notes

- `src/client.ts` starts the language client.
- `src/server.ts` provides completions, hover, and diagnostics.
- `src/component-discovery.ts` extracts component names and props from JSX component definitions.
- `ts-plugin/gea-template-plugin.js` suppresses noisy TypeScript diagnostics for Gea JSX.

## License

MIT
